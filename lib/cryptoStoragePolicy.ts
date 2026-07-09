export const MIN_UNLOCK_PASSPHRASE_LENGTH = 16;

export type StorageEncryptionRecord = {
  version?: number;
  wrap?: "device" | "vault";
  account_id?: string;
  nonce: string;
  ciphertext: string;
};

export function recordMatchesAccount(
  recordAccountId: string | undefined,
  accountId?: string | null,
): boolean {
  return !accountId || !recordAccountId || recordAccountId === accountId;
}

export function unlockRecordMatchesAccount(
  recordAccountId: string | undefined,
  accountId?: string | null,
): boolean {
  return Boolean(accountId && recordAccountId && recordAccountId === accountId);
}

export function withStorageEncryptionMetadata<T extends Record<string, unknown>>(
  encrypted: StorageEncryptionRecord,
  fields: T,
): StorageEncryptionRecord & T {
  return {
    ...fields,
    ...encrypted,
  };
}

export function shouldTryVaultKeyFallbackForStorageRecord(
  record: Pick<StorageEncryptionRecord, "version" | "wrap">,
): boolean {
  return !(record.version === 2 && record.wrap === "vault");
}

export function shouldDeleteLocalEncryptedWorkspaceKeyForRestore(
  key: IDBValidKey,
): key is string {
  return (
    typeof key === "string" &&
    (key === "unlock-vault-config" ||
      key === "unlock-method:password" ||
      key === "vault-session-wrap-key" ||
      key === "vault-session" ||
      key === "encrypted-ack" ||
      key === "encrypted-account-signing-key" ||
      key === "encrypted-device-identity" ||
      key.startsWith("unlock-method:passkey:") ||
      key.startsWith("encrypted-ock:"))
  );
}
