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

/** Identify one onboarding entry-gate resolution for an authenticated user. */
export function onboardingEntryGateKey({ accountId, forceRestore }) {
  if (!accountId) return null;
  return `${accountId}:${forceRestore ? "restore" : "default"}`;
}

/** Return whether the entry gate still needs to run for this user and mode. */
export function shouldRunOnboardingEntryGate({ resolvedKey, nextKey }) {
  return Boolean(nextKey && resolvedKey !== nextKey);
}
