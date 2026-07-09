export function shouldShowUnlockMethodSetup({ localPasskeyCount, hasPassword }) {
  return localPasskeyCount === 0 || !hasPassword;
}

export function unlockMethodSetupVisibility({ localPasskeyCount, hasPassword }) {
  return {
    showDeviceUnlock: localPasskeyCount === 0,
    showPasswordUnlock: !hasPassword,
  };
}

export function canRemovePasswordUnlock({ localPasskeyCount }) {
  return localPasskeyCount > 0;
}

export function canRemoveLocalPasskeyUnlock({ localPasskeyCount, hasPassword }) {
  return hasPassword || localPasskeyCount > 1;
}
