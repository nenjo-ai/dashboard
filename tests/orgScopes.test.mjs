import assert from "node:assert/strict";
import test from "node:test";
import { firstNonEmptyScopes, hasOrgScope } from "../lib/orgScopes.mjs";

test("write scope implies read for the same resource", () => {
  assert.equal(hasOrgScope(["org_invites:write"], "org_invites:read"), true);
  assert.equal(hasOrgScope(["org_invites:write"], "org_invites:write"), true);
  assert.equal(hasOrgScope(["org_invites:read"], "org_invites:write"), false);
  assert.equal(hasOrgScope(["org_members:write"], "org_invites:read"), false);
});

test("empty scopes deny all checks", () => {
  assert.equal(hasOrgScope([], "org_invites:read"), false);
  assert.equal(hasOrgScope([], "org_members:write"), false);
});

test("firstNonEmptyScopes ignores empty arrays so auth-resolved scopes win", () => {
  const fromOrgList = [];
  const fromAuthMe = [
    "org_members:read",
    "org_members:write",
    "org_invites:read",
    "org_invites:write",
  ];

  // Previous bug: `fromOrgList ?? fromAuthMe` kept [] because empty is not nullish.
  assert.deepEqual(firstNonEmptyScopes(fromOrgList, fromAuthMe), fromAuthMe);
  assert.equal(
    hasOrgScope(firstNonEmptyScopes(fromOrgList, fromAuthMe), "org_invites:read"),
    true,
  );
});

test("firstNonEmptyScopes prefers the first non-empty candidate", () => {
  assert.deepEqual(
    firstNonEmptyScopes(
      null,
      undefined,
      [],
      ["projects:read"],
      ["projects:write", "agents:write"],
    ),
    ["projects:read"],
  );
});

test("firstNonEmptyScopes returns empty when every candidate is empty or missing", () => {
  assert.deepEqual(firstNonEmptyScopes(null, undefined, []), []);
  assert.deepEqual(firstNonEmptyScopes(), []);
});
