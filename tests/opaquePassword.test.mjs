import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_RECOVERY_PASSWORD_LENGTH,
  OPAQUE_KSF_PROFILE,
  exportKeyToBytes,
  validateRecoveryPassword,
} from "../lib/opaquePassword.ts";

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

test("password policy enforces the minimum length", () => {
  const short = validateRecoveryPassword("short-pass");
  assert.equal(short.ok, false);
  assert.match(short.reason, /at least 16 characters/);
});

test("password policy accepts a strong passphrase", () => {
  assert.deepEqual(validateRecoveryPassword("correct horse battery staple"), {
    ok: true,
  });
});

test("password policy enforces the maximum length", () => {
  const long = validateRecoveryPassword("a".repeat(MAX_RECOVERY_PASSWORD_LENGTH + 1));
  assert.equal(long.ok, false);
  assert.match(long.reason, /at most/);
  assert.equal(
    validateRecoveryPassword("a".repeat(MAX_RECOVERY_PASSWORD_LENGTH)).ok,
    true,
  );
});

test("password policy ignores surrounding whitespace for the minimum check", () => {
  // The unlock flows trim before use, so padded short passwords still fail.
  assert.equal(validateRecoveryPassword("   short-pass   ").ok, false);
});

test("export key decodes 64-byte base64 payloads", () => {
  const bytes = exportKeyToBytes(base64(new Uint8Array(64).fill(7)));
  assert.equal(bytes.length, 64);
  assert.equal(bytes[0], 7);
});

test("export key rejects unexpected lengths", () => {
  assert.throws(() => exportKeyToBytes(base64(new Uint8Array(32))), /length/);
});

test("KSF profile name matches the platform's frozen profile", () => {
  assert.equal(OPAQUE_KSF_PROFILE, "argon2id-m64-t3-p4-v1");
});
