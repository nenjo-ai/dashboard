import assert from "node:assert/strict";
import test from "node:test";

import { createPlatformToken } from "../lib/server/platform-token.ts";

function decodeClaims(token) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

test("local provisioning profile is carried only in the signed platform token", () => {
  const previousSecret = process.env.DASHBOARD_PLATFORM_SHARED_SECRET;
  process.env.DASHBOARD_PLATFORM_SHARED_SECRET = "test-shared-secret";

  try {
    const claims = decodeClaims(
      createPlatformToken({
        userId: "local_dev",
        sessionId: "local-local_dev",
        provisioningProfile: {
          name: "Local Developer",
          email: "local@nenjo.dev",
        },
      }),
    );

    assert.equal(claims.sub, "local_dev");
    assert.deepEqual(claims.profile, {
      name: "Local Developer",
      email: "local@nenjo.dev",
    });
  } finally {
    if (previousSecret === undefined) {
      delete process.env.DASHBOARD_PLATFORM_SHARED_SECRET;
    } else {
      process.env.DASHBOARD_PLATFORM_SHARED_SECRET = previousSecret;
    }
  }
});

test("normal Clerk-backed platform tokens omit provisioning profile claims", () => {
  const previousSecret = process.env.DASHBOARD_PLATFORM_SHARED_SECRET;
  process.env.DASHBOARD_PLATFORM_SHARED_SECRET = "test-shared-secret";

  try {
    const claims = decodeClaims(
      createPlatformToken({
        userId: "user_123",
        sessionId: "sess_123",
      }),
    );

    assert.equal(Object.hasOwn(claims, "profile"), false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.DASHBOARD_PLATFORM_SHARED_SECRET;
    } else {
      process.env.DASHBOARD_PLATFORM_SHARED_SECRET = previousSecret;
    }
  }
});
