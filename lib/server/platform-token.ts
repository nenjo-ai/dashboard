import { createHmac, randomUUID } from "node:crypto";

type PlatformTokenInput = {
  userId: string;
  sessionId?: string | null;
  orgId?: string | null;
  provisioningProfile?: {
    name: string;
    email: string;
  };
};

type PlatformTokenClaims = {
  iss: "dashboard-bff";
  aud: "platform";
  sub: string;
  sid?: string | null;
  org_id?: string | null;
  profile?: {
    name: string;
    email: string;
  };
  jti: string;
  iat: number;
  exp: number;
};

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function createPlatformToken(input: PlatformTokenInput): string {
  const secret = process.env.DASHBOARD_PLATFORM_SHARED_SECRET?.trim();
  if (!secret) {
    throw new Error("DASHBOARD_PLATFORM_SHARED_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: PlatformTokenClaims = {
    iss: "dashboard-bff",
    aud: "platform",
    sub: input.userId,
    sid: input.sessionId ?? null,
    org_id: input.orgId ?? null,
    profile: input.provisioningProfile,
    jti: randomUUID(),
    iat: now,
    exp: now + 120,
  };

  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}
