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
