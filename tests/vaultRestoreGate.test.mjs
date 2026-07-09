import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldRedirectExistingWorkspaceToDashboard,
  shouldUseExistingWorkspaceRestoreMode,
} from "../lib/vaultRestoreGate.mjs";

const existingWorkspace = {
  hasSignedInAccount: true,
  hasOrg: true,
  hasExistingWorkspace: true,
  hasLocalAccountContentKey: false,
  lockedVault: false,
  forceRestore: false,
};

test("existing workspaces with an available local key redirect to dashboard", () => {
  const state = {
    ...existingWorkspace,
    hasLocalAccountContentKey: true,
  };

  assert.equal(shouldRedirectExistingWorkspaceToDashboard(state), true);
  assert.equal(shouldUseExistingWorkspaceRestoreMode(state), false);
});

test("force restore does not bypass dashboard when a valid local key is already available", () => {
  const state = {
    ...existingWorkspace,
    hasLocalAccountContentKey: true,
    forceRestore: true,
  };

  assert.equal(shouldRedirectExistingWorkspaceToDashboard(state), true);
  assert.equal(shouldUseExistingWorkspaceRestoreMode(state), false);
});

test("locked local vault redirects to dashboard during normal onboarding", () => {
  const state = {
    ...existingWorkspace,
    lockedVault: true,
  };

  assert.equal(shouldRedirectExistingWorkspaceToDashboard(state), true);
  assert.equal(shouldUseExistingWorkspaceRestoreMode(state), false);
});

test("locked local vault enters restore mode when restore is explicitly requested", () => {
  const state = {
    ...existingWorkspace,
    lockedVault: true,
    forceRestore: true,
  };

  assert.equal(shouldRedirectExistingWorkspaceToDashboard(state), false);
  assert.equal(shouldUseExistingWorkspaceRestoreMode(state), true);
});

test("fresh accounts do not enter existing-workspace restore mode", () => {
  const state = {
    ...existingWorkspace,
    hasExistingWorkspace: false,
  };

  assert.equal(shouldRedirectExistingWorkspaceToDashboard(state), false);
  assert.equal(shouldUseExistingWorkspaceRestoreMode(state), false);
});
