import assert from "node:assert/strict";
import test from "node:test";

import {
  onboardingEntryGateKey,
  shouldBootstrapSecureWorkspace,
  shouldRedirectExistingWorkspaceToDashboard,
  shouldRunOnboardingEntryGate,
  shouldUseExistingWorkspaceRestoreMode,
} from "../lib/vaultRestoreGate.mjs";
import {
  DEFAULT_AUTHENTICATED_ENTRY_PATH,
  shouldEnterFreshOnboarding,
} from "../lib/dashboardEntry.ts";

test("authenticated entry defaults to the normal onboarding flow", () => {
  assert.equal(DEFAULT_AUTHENTICATED_ENTRY_PATH, "/dashboard/onboarding");
});

test("only a genuinely fresh workspace enters onboarding automatically", () => {
  const freshWorkspace = {
    hasSignedInAccount: true,
    hasOrg: true,
    isOnboarded: false,
    hasRecoveryBundle: false,
    trustedDeviceCount: 0,
  };

  assert.equal(shouldEnterFreshOnboarding(freshWorkspace), true);
  assert.equal(
    shouldEnterFreshOnboarding({ ...freshWorkspace, isOnboarded: true }),
    false,
  );
  assert.equal(
    shouldEnterFreshOnboarding({ ...freshWorkspace, hasRecoveryBundle: true }),
    false,
  );
  assert.equal(
    shouldEnterFreshOnboarding({ ...freshWorkspace, trustedDeviceCount: 1 }),
    false,
  );
  assert.equal(
    shouldEnterFreshOnboarding({ ...freshWorkspace, hasOrg: false }),
    false,
  );
});

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

test("fresh accounts bootstrap encryption before entering the dashboard", () => {
  const state = {
    hasSignedInAccount: true,
    hasOrg: true,
    hasRecoveryBundle: false,
    isOnboarded: false,
    requiresSecureWorkspace: true,
  };

  assert.equal(shouldBootstrapSecureWorkspace(state), true);
  assert.equal(
    shouldBootstrapSecureWorkspace({
      ...state,
      hasRecoveryBundle: true,
    }),
    false,
  );
  assert.equal(
    shouldBootstrapSecureWorkspace({
      ...state,
      requiresSecureWorkspace: false,
    }),
    false,
  );
});

test("durable encrypted workspaces restore instead of generating replacement keys", () => {
  const state = {
    hasSignedInAccount: true,
    hasOrg: true,
    hasRecoveryBundle: false,
    isOnboarded: false,
    requiresSecureWorkspace: true,
  };

  assert.equal(
    shouldBootstrapSecureWorkspace({ ...state, hasRecoveryBundle: true }),
    false,
  );
  assert.equal(
    shouldBootstrapSecureWorkspace({ ...state, isOnboarded: true }),
    false,
  );
});

test("partial trusted-device setup still requires secure workspace bootstrap", () => {
  assert.equal(
    shouldBootstrapSecureWorkspace({
      hasSignedInAccount: true,
      hasOrg: true,
      hasRecoveryBundle: false,
      isOnboarded: false,
      requiresSecureWorkspace: true,
      trustedDeviceCount: 2,
    }),
    true,
  );
});

test("onboarding entry gate runs once for a user and mode", () => {
  const nextKey = onboardingEntryGateKey({
    accountId: "user-1",
    forceRestore: false,
  });

  assert.equal(
    shouldRunOnboardingEntryGate({ resolvedKey: null, nextKey }),
    true,
  );
  assert.equal(
    shouldRunOnboardingEntryGate({ resolvedKey: nextKey, nextKey }),
    false,
  );
});

test("explicit restore mode gets its own onboarding entry gate resolution", () => {
  const defaultKey = onboardingEntryGateKey({
    accountId: "user-1",
    forceRestore: false,
  });
  const restoreKey = onboardingEntryGateKey({
    accountId: "user-1",
    forceRestore: true,
  });

  assert.notEqual(defaultKey, restoreKey);
  assert.equal(
    shouldRunOnboardingEntryGate({
      resolvedKey: defaultKey,
      nextKey: restoreKey,
    }),
    true,
  );
});
