import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowUnlockMethodSetup } from "../lib/unlockMethodVisibility.mjs";

test("shows unlock setup when no local unlock method exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 0, hasPassword: false }),
    true,
  );
});

test("hides unlock setup when local passkey unlock exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 1, hasPassword: false }),
    false,
  );
});

test("hides unlock setup when local passphrase unlock exists", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 0, hasPassword: true }),
    false,
  );
});

test("hides unlock setup when both local unlock methods exist", () => {
  assert.equal(
    shouldShowUnlockMethodSetup({ localPasskeyCount: 1, hasPassword: true }),
    false,
  );
});
