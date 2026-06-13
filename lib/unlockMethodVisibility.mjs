export function shouldShowUnlockMethodSetup({ localPasskeyCount, hasPassword }) {
  return localPasskeyCount === 0 && !hasPassword;
}
