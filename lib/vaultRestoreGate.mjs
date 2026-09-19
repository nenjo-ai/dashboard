export function shouldRedirectExistingWorkspaceToDashboard({
  hasSignedInAccount,
  hasOrg,
  hasExistingWorkspace,
  hasLocalAccountContentKey,
  lockedVault,
  forceRestore,
}) {
  return Boolean(
    hasSignedInAccount &&
      hasOrg &&
      hasExistingWorkspace &&
      (hasLocalAccountContentKey || (lockedVault && !forceRestore)),
  );
}

export function shouldUseExistingWorkspaceRestoreMode({
  hasSignedInAccount,
  hasOrg,
  hasExistingWorkspace,
  hasLocalAccountContentKey,
  lockedVault,
  forceRestore,
}) {
  return Boolean(
    hasSignedInAccount &&
      hasOrg &&
      hasExistingWorkspace &&
      !hasLocalAccountContentKey &&
      (!lockedVault || forceRestore),
  );
}

/**
 * A fresh account must establish its browser-held encryption material before
 * entering the dashboard. Existing workspaces use the recovery flow instead;
 * generating replacement keys for them would make existing ciphertext
 * inaccessible.
 */
export function shouldBootstrapSecureWorkspace({
  hasSignedInAccount,
  hasOrg,
  isOnboarded,
  requiresSecureWorkspace,
}) {
  return Boolean(
    hasSignedInAccount &&
      hasOrg &&
      !isOnboarded &&
      requiresSecureWorkspace,
  );
}

/** Identify one onboarding entry-gate resolution for an authenticated user. */
export function onboardingEntryGateKey({ accountId, forceRestore }) {
  if (!accountId) return null;
  return `${accountId}:${forceRestore ? "restore" : "default"}`;
}

/** Return whether the entry gate still needs to run for this user and mode. */
export function shouldRunOnboardingEntryGate({ resolvedKey, nextKey }) {
  return Boolean(nextKey && resolvedKey !== nextKey);
}
