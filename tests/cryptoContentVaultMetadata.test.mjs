import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_UNLOCK_PASSPHRASE_LENGTH,
  recordMatchesAccount,
  shouldDeleteLocalEncryptedWorkspaceKeyForRestore,
  shouldTryVaultKeyFallbackForStorageRecord,
  unlockRecordMatchesAccount,
  withStorageEncryptionMetadata,
} from "../lib/cryptoStoragePolicy.ts";

test("vault-encrypted stored records keep encryption metadata when domain fields are added", () => {
  const encrypted = {
    version: 2,
    wrap: "vault",
    account_id: "acct_1",
    nonce: "nonce",
    ciphertext: "ciphertext",
  };

  assert.deepEqual(
    withStorageEncryptionMetadata(encrypted, {
      public_key: "pub",
    }),
    {
      version: 2,
      wrap: "vault",
      account_id: "acct_1",
      nonce: "nonce",
      ciphertext: "ciphertext",
      public_key: "pub",
    },
  );
});

test("storage metadata wins over conflicting domain fields", () => {
  const encrypted = {
    version: 2,
    wrap: "vault",
    account_id: "acct_1",
    nonce: "real-nonce",
    ciphertext: "real-ciphertext",
  };

  assert.deepEqual(
    withStorageEncryptionMetadata(encrypted, {
      version: 1,
      wrap: "device",
      account_id: "acct_2",
      nonce: "wrong-nonce",
      ciphertext: "wrong-ciphertext",
      public_key: "pub",
    }),
    {
      version: 2,
      wrap: "vault",
      account_id: "acct_1",
      nonce: "real-nonce",
      ciphertext: "real-ciphertext",
      public_key: "pub",
    },
  );
});

test("unlock method account matching rejects unscoped legacy records", () => {
  assert.equal(unlockRecordMatchesAccount(undefined, "acct_1"), false);
  assert.equal(unlockRecordMatchesAccount("acct_1", null), false);
  assert.equal(unlockRecordMatchesAccount("acct_1", "acct_2"), false);
  assert.equal(unlockRecordMatchesAccount("acct_1", "acct_1"), true);
});

test("legacy content-key account matching still accepts unscoped records for compatibility", () => {
  assert.equal(recordMatchesAccount(undefined, "acct_1"), true);
  assert.equal(recordMatchesAccount("acct_1", null), true);
  assert.equal(recordMatchesAccount("acct_1", "acct_2"), false);
  assert.equal(recordMatchesAccount("acct_1", "acct_1"), true);
});

test("new passphrase unlocks require a stronger minimum length", () => {
  assert.equal(MIN_UNLOCK_PASSPHRASE_LENGTH >= 16, true);
});

test("ambiguous legacy storage records can try vault fallback but explicit vault records cannot", () => {
  assert.equal(
    shouldTryVaultKeyFallbackForStorageRecord({ version: 2, wrap: "vault" }),
    false,
  );
  assert.equal(
    shouldTryVaultKeyFallbackForStorageRecord({ wrap: "vault" }),
    true,
  );
  assert.equal(
    shouldTryVaultKeyFallbackForStorageRecord({ version: 2, wrap: "device" }),
    true,
  );
  assert.equal(
    shouldTryVaultKeyFallbackForStorageRecord({}),
    true,
  );
});

test("restore reset deletes local vault material but keeps recovery and device wrapping anchors", () => {
  const deletedKeys = [
    "unlock-vault-config",
    "unlock-method:password",
    "unlock-method:passkey:cred-1",
    "vault-session-wrap-key",
    "vault-session",
    "encrypted-ack",
    "encrypted-account-signing-key",
    "encrypted-device-identity",
    "encrypted-ock:org-1:1",
  ];
  for (const key of deletedKeys) {
    assert.equal(shouldDeleteLocalEncryptedWorkspaceKeyForRestore(key), true, key);
  }

  const keptKeys = [
    "device-wrap-key",
    "unrelated",
    "unlock-method:passkey",
    123,
  ];
  for (const key of keptKeys) {
    assert.equal(shouldDeleteLocalEncryptedWorkspaceKeyForRestore(key), false, String(key));
  }
});
