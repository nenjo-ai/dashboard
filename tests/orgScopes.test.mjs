import assert from "node:assert/strict";
import test from "node:test";
import { firstDefinedScopes, hasOrgScope } from "../lib/orgScopes.mjs";

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

test("firstDefinedScopes keeps an authoritative empty scope assignment", () => {
  const fromAuthMe = [];
  const staleOrgList = ["org_members:write", "org_invites:write"];

  assert.deepEqual(firstDefinedScopes(fromAuthMe, staleOrgList), []);
  assert.equal(hasOrgScope(firstDefinedScopes(fromAuthMe, staleOrgList), "org_invites:read"), false);
});

test("firstDefinedScopes prefers the first defined candidate", () => {
  assert.deepEqual(
    firstDefinedScopes(
      null,
      undefined,
      ["projects:read"],
      ["projects:write", "agents:write"],
    ),
    ["projects:read"],
  );
});

test("firstDefinedScopes returns empty when every candidate is missing", () => {
  assert.deepEqual(firstDefinedScopes(null, undefined), []);
  assert.deepEqual(firstDefinedScopes(), []);
});
