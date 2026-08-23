import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken } from "@/lib/server/platform-token";
import { resolveDashboardSession } from "@/lib/server/dashboardAuth";
import {
  buildPlatformApiUrl,
  forwardPlatformResponseHeaders,
} from "@/lib/server/platformProxyPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STREAM_PATHS = new Set(["chat-streams", "execution-streams"]);

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

function forwardedRequestHeaders(req: NextRequest): Headers {
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

  const ifMatch = req.headers.get("if-match");
  if (ifMatch) {
    headers.set("if-match", ifMatch);
  }

  return headers;
}

function isStreamPath(path: string[]): boolean {
  return STREAM_PATHS.has(path.join("/"));
}

function finalizeResponseHeaders(upstreamHeaders: Headers, path: string[]): Headers {
  const headers = forwardPlatformResponseHeaders(upstreamHeaders);

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

  let sessionResolution;
  try {
    sessionResolution = await resolveDashboardSession(req.url);
  } catch (error) {
    console.error("Failed to resolve dashboard authentication", error);
    return NextResponse.json(
      { error: { code: "auth_not_configured", message: "Dashboard authentication is not configured" } },
      { status: 500 },
    );
  }
  if (sessionResolution.kind !== "authenticated") {
    const forbidden = sessionResolution.kind === "forbidden_local_host";
    const unconfigured = sessionResolution.kind === "unconfigured";
    return NextResponse.json(
      {
        error: {
          code: forbidden
            ? "local_auth_requires_loopback"
            : unconfigured
              ? "auth_not_configured"
              : "unauthorized",
          message: forbidden
            ? "Local authentication is only available through a loopback hostname"
            : unconfigured
              ? "Dashboard authentication is not configured"
              : "Authentication required",
        },
      },
      { status: forbidden ? 403 : unconfigured ? 500 : 401 },
    );
  }
  const { userId, sessionId, provisioningProfile } = sessionResolution.session;

  let token: string;
  try {
    token = createPlatformToken({
      userId,
      sessionId,
      provisioningProfile,
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
  let upstream: URL;
  try {
    upstream = buildPlatformApiUrl(
      platformBaseUrl(),
      path,
      new URL(req.url).search,
    );
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_proxy_path", message: "Invalid platform API path" } },
      { status: 400 },
    );
  }

  const headers = forwardedRequestHeaders(req);
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
