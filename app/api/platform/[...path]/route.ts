import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken } from "@/lib/server/platform-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STREAM_PATHS = new Set(["chat-streams", "execution-streams"]);
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function platformBaseUrl(): string {
  const url =
    process.env.PLATFORM_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!url) {
    throw new Error("PLATFORM_INTERNAL_URL or NEXT_PUBLIC_API_URL is required");
  }

  return url;
}

function requestHasAllowedOrigin(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) {
    return true;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    return false;
  }

  return origin === new URL(req.url).origin;
}

function forwardedContentHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  headers.set("accept", req.headers.get("accept") ?? "application/json");

  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const orgId = req.headers.get("x-nenjo-org-id")?.trim();
  if (orgId) {
    headers.set("x-nenjo-org-id", orgId);
  }

  return headers;
}

function forwardedResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers();

  upstreamHeaders.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

function isStreamPath(path: string[]): boolean {
  return STREAM_PATHS.has(path.join("/"));
}

function finalizeResponseHeaders(upstreamHeaders: Headers, path: string[]): Headers {
  const headers = forwardedResponseHeaders(upstreamHeaders);

  if (isStreamPath(path)) {
    headers.set("Cache-Control", "no-cache, no-transform");
    headers.set("X-Accel-Buffering", "no");
  }

  return headers;
}

async function proxyPlatformRequest(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!requestHasAllowedOrigin(req)) {
    return NextResponse.json(
      { error: { code: "bad_origin", message: "Invalid request origin" } },
      { status: 403 },
    );
  }

  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required" } },
      { status: 401 },
    );
  }

  let token: string;
  try {
    token = createPlatformToken({
      userId,
      sessionId,
      orgId: req.headers.get("x-nenjo-org-id")?.trim() || null,
    });
  } catch (error) {
    console.error("Failed to create platform token", error);
    return NextResponse.json(
      { error: { code: "platform_auth_not_configured", message: "Platform auth is not configured" } },
      { status: 500 },
    );
  }

  const { path } = await ctx.params;
  const upstream = new URL(`/api/v1/${path.join("/")}`, platformBaseUrl());
  upstream.search = new URL(req.url).search;

  const headers = forwardedContentHeaders(req);
  headers.set("authorization", `Bearer ${token}`);

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : req.body;
  const upstreamResponse = await fetch(upstream, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
    signal: req.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: finalizeResponseHeaders(upstreamResponse.headers, path),
  });
}

export const GET = proxyPlatformRequest;
export const POST = proxyPlatformRequest;
export const PUT = proxyPlatformRequest;
export const PATCH = proxyPlatformRequest;
export const DELETE = proxyPlatformRequest;
