export const DEFAULT_AUTHENTICATED_ENTRY_PATH = "/dashboard/onboarding";

export function shouldEnterFreshOnboarding({
  hasSignedInAccount,
  hasOrg,
  isOnboarded,
  hasRecoveryBundle,
  trustedDeviceCount,
}: {
  hasSignedInAccount: boolean;
  hasOrg: boolean;
  isOnboarded: boolean;
  hasRecoveryBundle: boolean;
  trustedDeviceCount: number;
}): boolean {
  return (
    hasSignedInAccount &&
    hasOrg &&
    !isOnboarded &&
    !hasRecoveryBundle &&
    trustedDeviceCount === 0
  );
}
