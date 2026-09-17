// Recovery-aware guards for local unlock method removal.
//
// Removing the last local unlock used to be forbidden outright because it
// could lock the browser out of its vault. With account recovery (BOO-26),
// an active recovery method restores the vault after site-data loss, so it
// substitutes for a second unlock method.

export function shouldShowUnlockMethodSetup({ localPasskeyCount, hasPassword }) {
  return localPasskeyCount === 0 || !hasPassword;
}

export function unlockMethodSetupVisibility({ localPasskeyCount, hasPassword }) {
  return {
    showDeviceUnlock: localPasskeyCount === 0,
    showPasswordUnlock: !hasPassword,
  };
}

export function canRemovePasswordUnlock({ localPasskeyCount, hasAccountRecovery = false }) {
  return localPasskeyCount > 0 || hasAccountRecovery;
}

export function canRemoveLocalPasskeyUnlock({ localPasskeyCount, hasPassword, hasAccountRecovery = false }) {
  return hasPassword || localPasskeyCount > 1 || hasAccountRecovery;
}
