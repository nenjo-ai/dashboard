import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveActiveOrgId } from "../lib/activeOrg.ts";
import { shouldRetryDashboardRequest } from "../lib/apiRetryPolicy.ts";
import { isOrgScopedPlatformApiUrl } from "../lib/apiScope.ts";

const ROOT = new URL("..", import.meta.url);

test("stale organization selections converge on an accessible organization", () => {
  assert.equal(
    resolveActiveOrgId({
      storedOrgId: "removed-org",
      availableOrgIds: ["current-org", "other-org"],
      currentUserOrgId: "current-org",
      currentOrgId: "removed-org",
    }),
    "current-org",
  );
  assert.equal(
    resolveActiveOrgId({
      storedOrgId: "current-org",
      availableOrgIds: ["current-org", "other-org"],
      currentUserOrgId: "other-org",
    }),
    "current-org",
  );
});

test("organization cache invalidation excludes bootstrap requests", () => {
  assert.equal(isOrgScopedPlatformApiUrl("/api/platform/tasks"), true);
  assert.equal(
    isOrgScopedPlatformApiUrl("/api/platform/projects?limit=20"),
    true,
  );
  assert.equal(isOrgScopedPlatformApiUrl("/api/platform/auth/me"), false);
  assert.equal(isOrgScopedPlatformApiUrl("/api/platform/orgs"), false);
  assert.equal(
    isOrgScopedPlatformApiUrl("/api/platform/orgs/invitations/token/accept"),
    false,
  );
});

test("SWR does not automatically retry rate-limited requests", () => {
  assert.equal(shouldRetryDashboardRequest({ status: 429 }), false);
  assert.equal(shouldRetryDashboardRequest({ status: 503 }), true);
  assert.equal(shouldRetryDashboardRequest(new Error("network")), true);
});

test("the fetch wrapper does not add a second 429 retry layer", () => {
  const source = readFileSync(new URL("lib/api.ts", ROOT), "utf8");
  assert.doesNotMatch(source, /res\.status === 429[\s\S]{0,120}continue/);
});
