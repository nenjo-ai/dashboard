export const DEFAULT_AUTHENTICATED_ENTRY_PATH = "/dashboard/onboarding";

export function shouldEnterFreshOnboarding({
  hasSignedInAccount,
  hasOrg,
  isOnboarded,
  trustedDeviceCount,
}: {
  hasSignedInAccount: boolean;
  hasOrg: boolean;
  isOnboarded: boolean;
  trustedDeviceCount: number;
}): boolean {
  return (
    hasSignedInAccount &&
    hasOrg &&
    !isOnboarded &&
    trustedDeviceCount === 0
  );
}
