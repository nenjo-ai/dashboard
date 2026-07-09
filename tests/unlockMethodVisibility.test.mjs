import assert from "node:assert/strict";
import test from "node:test";

import {
  canRemoveLocalPasskeyUnlock,
  canRemovePasswordUnlock,
  shouldShowUnlockMethodSetup,
  unlockMethodSetupVisibility,
} from "../lib/unlockMethodVisibility.mjs";

test("shows unlock setup when no local unlock method exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 0, hasPassword: false }),
    true,
  );
});

test("keeps unlock setup visible when only local passkey unlock exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 1, hasPassword: false }),
    true,
  );
});

test("keeps unlock setup visible when only local passphrase unlock exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 0, hasPassword: true }),
    true,
  );
});

test("hides unlock setup when both local unlock methods exist", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 1, hasPassword: true }),
    false,
  );
});

test("only offers setup controls for missing unlock methods", () => {
  assert.deepEqual(
    unlockMethodSetupVisibility({ localPasskeyCount: 0, hasPassword: false }),
    { showDeviceUnlock: true, showPasswordUnlock: true },
  );
  assert.deepEqual(
    unlockMethodSetupVisibility({ localPasskeyCount: 1, hasPassword: false }),
    { showDeviceUnlock: false, showPasswordUnlock: true },
  );
  assert.deepEqual(
    unlockMethodSetupVisibility({ localPasskeyCount: 0, hasPassword: true }),
    { showDeviceUnlock: true, showPasswordUnlock: false },
  );
});

test("does not allow removing the last local unlock method", () => {
  assert.equal(canRemovePasswordUnlock({ localPasskeyCount: 0 }), false);
  assert.equal(canRemovePasswordUnlock({ localPasskeyCount: 1 }), true);

  assert.equal(
    canRemoveLocalPasskeyUnlock({ localPasskeyCount: 1, hasPassword: false }),
    false,
  );
  assert.equal(
    canRemoveLocalPasskeyUnlock({ localPasskeyCount: 1, hasPassword: true }),
    true,
  );
  assert.equal(
    canRemoveLocalPasskeyUnlock({ localPasskeyCount: 2, hasPassword: false }),
    true,
  );
});
