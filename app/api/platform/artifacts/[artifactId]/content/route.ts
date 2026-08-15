import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { createPlatformToken } from "@/lib/server/platform-token";
import {
  MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES,
  validateArtifactDownloadUrl,
} from "@/lib/server/artifactDownloadPolicy";
import { buildPlatformApiUrl } from "@/lib/server/platformProxyPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ArtifactDownloadGrant = {
  artifact?: {
    id?: string;
    state?: string;
    name?: string;
    media_type?: string;
    plaintext_size_bytes?: number;
    plaintext_digest?: string;
    ciphertext_size_bytes?: number;
  };
  download_url?: string;
};

function platformBaseUrl(): string {
  const url =
    process.env.PLATFORM_INTERNAL_URL?.trim()
    || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!url) throw new Error("PLATFORM_INTERNAL_URL or NEXT_PUBLIC_API_URL is required");
  return url;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

/**
 * Stream the encrypted artifact envelope through the authenticated dashboard
 * origin. This removes browser CORS and private object-store reachability from
 * the preview path without exposing plaintext to the server.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await context.params;
  if (!UUID_PATTERN.test(artifactId)) {
    return errorResponse("Invalid artifact ID", 400);
  }

  const { userId, sessionId } = await auth();
  if (!userId) {
    return errorResponse("Authentication required", 401);
  }

  let token: string;
  try {
    token = createPlatformToken({
      userId,
      sessionId,
      orgId: request.headers.get("x-nenjo-org-id")?.trim() || null,
    });
  } catch (error) {
    console.error("Failed to create artifact proxy token", error);
    return errorResponse("Platform authentication is not configured", 500);
  }

  let grantUrl: URL;
  try {
    grantUrl = buildPlatformApiUrl(platformBaseUrl(), [
      "artifacts",
      artifactId,
      "download",
    ]);
  } catch {
    return errorResponse("Platform API is not configured safely", 500);
  }
  const grantResponse = await fetch(grantUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  });
  if (!grantResponse.ok) {
    return new Response(grantResponse.body, {
      status: grantResponse.status,
      headers: {
        "cache-control": "private, no-store",
        "content-type": grantResponse.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const grant = await grantResponse.json() as ArtifactDownloadGrant;
  if (
    typeof grant.download_url !== "string"
    || grant.artifact?.id !== artifactId
    || grant.artifact.state !== "ready"
    || typeof grant.artifact?.name !== "string"
    || typeof grant.artifact.media_type !== "string"
    || !Number.isSafeInteger(grant.artifact.plaintext_size_bytes)
    || (grant.artifact.plaintext_size_bytes ?? -1) < 0
    || (grant.artifact.plaintext_size_bytes ?? 0) > MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES
    || typeof grant.artifact.plaintext_digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/i.test(grant.artifact.plaintext_digest)
    || !Number.isSafeInteger(grant.artifact.ciphertext_size_bytes)
    || (grant.artifact.ciphertext_size_bytes ?? 0) <= 0
    || (grant.artifact.ciphertext_size_bytes ?? 0) > MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES
  ) {
    return errorResponse("Artifact download grant is invalid", 502);
  }

  let objectUrl: URL;
  try {
    objectUrl = validateArtifactDownloadUrl(grant.download_url);
  } catch {
    return errorResponse("Artifact download URL is invalid", 502);
  }

  let objectResponse: Response;
  try {
    objectResponse = await fetch(objectUrl, {
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
    });
  } catch {
    return errorResponse("Artifact storage could not be reached", 502);
  }
  if (!objectResponse.ok || !objectResponse.body) {
    return errorResponse("Artifact download failed", 502);
  }
  const contentLength = Number(objectResponse.headers.get("content-length"));
  if (
    !Number.isSafeInteger(contentLength)
    || contentLength !== grant.artifact.ciphertext_size_bytes
  ) {
    await objectResponse.body.cancel();
    return errorResponse("Artifact download size is invalid", 502);
  }

  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": objectResponse.headers.get("content-type") ?? "application/json",
    "x-content-type-options": "nosniff",
    "x-nenjo-artifact-media-type": encodeURIComponent(grant.artifact.media_type),
    "x-nenjo-artifact-name": encodeURIComponent(grant.artifact.name),
    "x-nenjo-artifact-plaintext-digest": grant.artifact.plaintext_digest,
    "x-nenjo-artifact-plaintext-size": String(grant.artifact.plaintext_size_bytes),
  });
  headers.set("content-length", String(contentLength));

  return new Response(objectResponse.body, { status: 200, headers });
}
