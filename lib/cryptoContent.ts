"use client";

import type {
  EncryptedPayload,
  RecoveryBundlePayload,
  TrustedDevicePayload,
  WorkerCertificate,
  WrappedAccountContentKey,
  WrappedOrgContentKey,
} from "./types";
import { RECOVERY_WORDS } from "./recoveryWords";
import {
  MIN_UNLOCK_PASSPHRASE_LENGTH,
  recordMatchesAccount,
  shouldDeleteLocalEncryptedWorkspaceKeyForRestore,
  shouldTryVaultKeyFallbackForStorageRecord,
  unlockRecordMatchesAccount,
  withStorageEncryptionMetadata,
  type StorageEncryptionRecord,
} from "./cryptoStoragePolicy";

export { MIN_UNLOCK_PASSPHRASE_LENGTH } from "./cryptoStoragePolicy";

const LEGACY_ACCOUNT_CONTENT_KEY_STORAGE_KEY = "nenjo:ack";
const DB_NAME = "nenjo-crypto";
const DB_VERSION = 1;
const STORE_NAME = "secrets";
const WRAP_KEY_ENTRY = "device-wrap-key";
const ENCRYPTED_ACK_ENTRY = "encrypted-ack";
const ENCRYPTED_ACCOUNT_SIGNING_KEY_ENTRY = "encrypted-account-signing-key";
const ENCRYPTED_DEVICE_IDENTITY_ENTRY = "encrypted-device-identity";
const ENCRYPTED_RECOVERY_BUNDLE_ENTRY = "encrypted-recovery-bundle";
const VAULT_CONFIG_ENTRY = "unlock-vault-config";
const PASSWORD_UNLOCK_ENTRY = "unlock-method:password";
const PASSKEY_UNLOCK_PREFIX = "unlock-method:passkey:";
const VAULT_SESSION_WRAP_KEY_ENTRY = "vault-session-wrap-key";
const VAULT_SESSION_ENTRY = "vault-session";
const AES_ALGORITHM = "AES-GCM";
const SIGNING_ALGORITHM = "Ed25519";
const PAYLOAD_ALGORITHM = "aes-256-gcm";
const WRAP_ALGORITHM = "x25519-hkdf-sha256-aes-256-gcm";
const HKDF_INFO = new TextEncoder().encode("nenjo-worker-ack-wrap-v1");
const RECOVERY_PBKDF2_ITERATIONS = 600_000;
const UNLOCK_PBKDF2_ITERATIONS = 650_000;
const VAULT_SESSION_DURATION_MS = 30 * 60 * 1000;

type StoredEncryptedAck = StorageEncryptionRecord;

export type LocalEncryptedStoragePayload = StoredEncryptedAck;

type VaultConfig = {
  version: 1;
  enabled: true;
  account_id?: string;
  created_at: string;
};

type LocalPasswordUnlockRecord = {
  version: 1;
  type: "password";
  account_id?: string;
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  nonce: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
};

type LocalVaultSessionRecord = {
  version: 1;
  account_id: string;
  nonce: string;
  ciphertext: string;
  created_at: string;
  expires_at: string;
};

export type LocalPasskeyUnlockRecord = {
  version: 1;
  type: "passkey-prf";
  account_id?: string;
  credential_id: string;
  label: string | null;
  salt: string;
  nonce: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
};

type StoredEncryptedAccountSigningKey = StoredEncryptedAck & {
  public_key: string;
};

type StoredEncryptedDeviceIdentity = StoredEncryptedAck & {
  device_id: string;
  enc_public_key: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;
let wrapKeyPromise: Promise<CryptoKey> | null = null;
let vaultSessionWrapKeyPromise: Promise<CryptoKey> | null = null;
let ackSessionCache: string | null = null;
const orgContentKeySessionCache = new Map<string, string>();
let accountSigningKeyPromise: Promise<CryptoKeyPair | null> | null = null;
let accountSigningPublicKeyCache: string | null = null;
let deviceIdentityPromise: Promise<{ deviceId: string; keyPair: CryptoKeyPair; publicKey: string } | null> | null = null;
let deviceIdentityEnsurePromise: Promise<{ deviceId: string; publicKey: string }> | null = null;
let vaultKeyRawSession: Uint8Array | null = null;
let vaultKeyPromise: Promise<CryptoKey> | null = null;
let vaultSessionAccountId: string | null = null;
let vaultIdleExpiresAt: number | null = null;
let lastVaultIdlePersistAt = 0;
const VAULT_IDLE_EXTENSION_THROTTLE_MS = 60_000;
let ackSessionAccountId: string | null = null;

function generateVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(value % 1_000_000).padStart(6, "0");
}

function describeCryptoError(stage: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`Device crypto failed at ${stage}: ${message}`);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function normalizeRecoveryPhrase(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
  }
  return dbPromise;
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed."));
    tx.objectStore(STORE_NAME).put(value, key);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed."));
    tx.objectStore(STORE_NAME).delete(key);
  });
}

function idbGetAllKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB key read failed."));
  });
}

async function getOrCreateDeviceWrapKey(): Promise<CryptoKey> {
  if (!wrapKeyPromise) {
    wrapKeyPromise = (async () => {
      const db = await openDb();
      const existing = await idbGet<CryptoKey>(db, WRAP_KEY_ENTRY);
      if (existing) return existing;

      const generated = await crypto.subtle.generateKey(
        { name: AES_ALGORITHM, length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await idbPut(db, WRAP_KEY_ENTRY, generated);
      return generated;
    })();
  }
  return wrapKeyPromise;
}

async function getOrCreateVaultSessionWrapKey(): Promise<CryptoKey> {
  if (!vaultSessionWrapKeyPromise) {
    vaultSessionWrapKeyPromise = (async () => {
      const db = await openDb();
      const existing = await idbGet<CryptoKey>(db, VAULT_SESSION_WRAP_KEY_ENTRY);
      if (existing) return existing;

      const generated = await crypto.subtle.generateKey(
        { name: AES_ALGORITHM, length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await idbPut(db, VAULT_SESSION_WRAP_KEY_ENTRY, generated);
      return generated;
    })();
  }
  return vaultSessionWrapKeyPromise;
}

async function importAesKey(rawKey: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asBufferSource(rawKey),
    { name: AES_ALGORITHM, length: 256 },
    false,
    usages,
  );
}

async function isVaultEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const db = await openDb();
  const config = await idbGet<VaultConfig>(db, VAULT_CONFIG_ENTRY);
  return config?.enabled === true;
}

async function requireVaultAccount(accountId: string): Promise<void> {
  const db = await openDb();
  const config = await idbGet<VaultConfig>(db, VAULT_CONFIG_ENTRY);
  if (config?.account_id && config.account_id !== accountId) {
    throw new Error("This browser's local vault belongs to a different signed-in account.");
  }
  if (vaultSessionAccountId && vaultSessionAccountId !== accountId) {
    lockLocalSecretVault();
    throw new Error("This browser's local vault session belongs to a different signed-in account.");
  }
  vaultSessionAccountId = accountId;
}

async function getVaultKey(): Promise<CryptoKey | null> {
  if (!vaultKeyRawSession) return null;
  if (!vaultKeyPromise) {
    vaultKeyPromise = importAesKey(vaultKeyRawSession, ["encrypt", "decrypt"]);
  }
  return vaultKeyPromise;
}

async function requireVaultKey(): Promise<CryptoKey> {
  const key = await getVaultKey();
  if (!key) {
    throw new Error("Encrypted workspace vault is locked. Unlock it before using local secrets.");
  }
  return key;
}

async function storageWrapKeyForEncrypt(): Promise<{ key: CryptoKey; wrap: "device" | "vault" }> {
  if (await isVaultEnabled()) {
    return { key: await requireVaultKey(), wrap: "vault" };
  }
  return { key: await getOrCreateDeviceWrapKey(), wrap: "device" };
}

async function storageWrapKeyForDecrypt(record: StoredEncryptedAck): Promise<CryptoKey> {
  if (record.version === 2 && record.wrap === "vault") {
    return requireVaultKey();
  }
  return getOrCreateDeviceWrapKey();
}

async function importAck(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asBufferSource(rawKey),
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function payloadAad(accountId: string, objectId: string, objectType: string): Uint8Array {
  return new TextEncoder().encode(`${accountId}:${objectId}:${objectType}`);
}

function normalizePayloadScope(scope?: string | null): "user" | "org" {
  return scope === "org" ? "org" : "user";
}

async function encryptAckForStorage(base64Key: string): Promise<StoredEncryptedAck> {
  const { key: wrapKey, wrap } = await storageWrapKeyForEncrypt();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    asBufferSource(base64ToBytes(base64Key)),
  );

  return {
    version: wrap === "vault" ? 2 : undefined,
    wrap,
    account_id: vaultSessionAccountId ?? undefined,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function orgContentKeyStorageEntry(orgId: string, keyVersion: number): string {
  return `encrypted-ock:${orgId}:${keyVersion}`;
}

async function decryptStoredAck(record: StoredEncryptedAck): Promise<string> {
  const wrapKey = await storageWrapKeyForDecrypt(record);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(record.nonce)),
    },
    wrapKey,
    asBufferSource(base64ToBytes(record.ciphertext)),
  );
  return bytesToBase64(new Uint8Array(plaintext));
}

async function encryptBytesForStorage(bytes: Uint8Array): Promise<StoredEncryptedAck> {
  const { key: wrapKey, wrap } = await storageWrapKeyForEncrypt();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    asBufferSource(bytes),
  );

  return {
    version: wrap === "vault" ? 2 : undefined,
    wrap,
    account_id: vaultSessionAccountId ?? undefined,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBytesFromStorage(record: StoredEncryptedAck): Promise<Uint8Array> {
  const wrapKey = await storageWrapKeyForDecrypt(record);
  const decryptWithKey = async (key: CryptoKey) => {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: AES_ALGORITHM,
        iv: asBufferSource(base64ToBytes(record.nonce)),
      },
      key,
      asBufferSource(base64ToBytes(record.ciphertext)),
    );
    return new Uint8Array(plaintext);
  };

  try {
    return await decryptWithKey(wrapKey);
  } catch (err) {
    if (!shouldTryVaultKeyFallbackForStorageRecord(record)) {
      throw err;
    }
    const vaultKey = await getVaultKey();
    if (!vaultKey) {
      throw err;
    }
    return decryptWithKey(vaultKey).catch(() => {
      throw err;
    });
  }
}

export async function encryptLocalJsonForStorage(value: unknown): Promise<LocalEncryptedStoragePayload> {
  return encryptBytesForStorage(new TextEncoder().encode(JSON.stringify(value)));
}

export async function decryptLocalJsonFromStorage<T>(
  record: LocalEncryptedStoragePayload,
): Promise<T> {
  const bytes = await decryptBytesFromStorage(record);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function derivePasswordUnlockKey(params: {
  password: string;
  salt: Uint8Array;
  iterations: number;
}): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(new TextEncoder().encode(params.password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBufferSource(params.salt),
      iterations: params.iterations,
    },
    baseKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptVaultRawKey(rawVaultKey: Uint8Array, wrappingKey: CryptoKey): Promise<{
  nonce: string;
  ciphertext: string;
}> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: nonce },
    wrappingKey,
    asBufferSource(rawVaultKey),
  );
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptVaultRawKey(params: {
  nonce: string;
  ciphertext: string;
  wrappingKey: CryptoKey;
}): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(params.nonce)),
    },
    params.wrappingKey,
    asBufferSource(base64ToBytes(params.ciphertext)),
  );
  return new Uint8Array(plaintext);
}

async function setVaultRawKey(rawKey: Uint8Array): Promise<void> {
  vaultKeyRawSession = new Uint8Array(rawKey);
  vaultKeyPromise = importAesKey(vaultKeyRawSession, ["encrypt", "decrypt"]);
}

async function saveVaultUnlockSession(accountId: string): Promise<void> {
  if (!vaultKeyRawSession) return;
  vaultSessionAccountId = accountId;
  const wrapKey = await getOrCreateVaultSessionWrapKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: nonce },
    wrapKey,
    asBufferSource(vaultKeyRawSession),
  );
  const now = Date.now();
  vaultIdleExpiresAt = now + VAULT_SESSION_DURATION_MS;
  const db = await openDb();
  await idbPut(db, VAULT_SESSION_ENTRY, {
    version: 1,
    account_id: accountId,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(vaultIdleExpiresAt).toISOString(),
  } satisfies LocalVaultSessionRecord);
}

function isVaultIdleExpired(): boolean {
  if (!vaultKeyRawSession) return false;
  if (vaultIdleExpiresAt === null) return false;
  return Date.now() >= vaultIdleExpiresAt;
}

export function isLocalSecretVaultUnlocked(): boolean {
  return vaultKeyRawSession !== null && !isVaultIdleExpired();
}

export function touchVaultSessionActivity(accountId: string): void {
  if (!vaultKeyRawSession || !accountId) return;
  if (vaultSessionAccountId && vaultSessionAccountId !== accountId) return;

  const now = Date.now();
  vaultIdleExpiresAt = now + VAULT_SESSION_DURATION_MS;

  if (now - lastVaultIdlePersistAt < VAULT_IDLE_EXTENSION_THROTTLE_MS) {
    return;
  }

  lastVaultIdlePersistAt = now;
  void saveVaultUnlockSession(accountId);
}

export function enforceVaultIdleExpiry(): boolean {
  if (!isVaultIdleExpired()) return false;
  lockLocalSecretVault();
  return true;
}

export async function restoreLocalSecretVaultSession(accountId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (vaultKeyRawSession) {
    if (vaultSessionAccountId && vaultSessionAccountId !== accountId) return false;
    if (isVaultIdleExpired()) {
      lockLocalSecretVault();
      return false;
    }
    vaultSessionAccountId = accountId;
    return true;
  }

  const db = await openDb();
  const record = await idbGet<LocalVaultSessionRecord>(db, VAULT_SESSION_ENTRY);
  if (!record) return false;
  if (record.account_id !== accountId || Date.parse(record.expires_at) <= Date.now()) {
    await idbDelete(db, VAULT_SESSION_ENTRY);
    return false;
  }

  try {
    const wrapKey = await getOrCreateVaultSessionWrapKey();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: AES_ALGORITHM,
        iv: asBufferSource(base64ToBytes(record.nonce)),
      },
      wrapKey,
      asBufferSource(base64ToBytes(record.ciphertext)),
    );
    await setVaultRawKey(new Uint8Array(plaintext));
    vaultSessionAccountId = accountId;
    vaultIdleExpiresAt = Date.parse(record.expires_at);
    return true;
  } catch {
    await idbDelete(db, VAULT_SESSION_ENTRY);
    return false;
  }
}

export async function clearLocalSecretVaultSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, VAULT_SESSION_ENTRY);
}

export function bindLocalSecretVaultSession(accountId: string): boolean {
  const mismatchedVaultAccount =
    vaultSessionAccountId !== null && vaultSessionAccountId !== accountId;
  const mismatchedAckAccount =
    ackSessionAccountId !== null && ackSessionAccountId !== accountId;

  if (mismatchedVaultAccount || mismatchedAckAccount) {
    lockLocalSecretVault();
    return false;
  }

  vaultSessionAccountId = accountId;
  return true;
}

async function getOrCreateVaultRawKey(accountId: string): Promise<Uint8Array> {
  await requireVaultAccount(accountId);
  if (vaultKeyRawSession) return vaultKeyRawSession;
  if (await isVaultEnabled()) {
    throw new Error("Encrypted workspace vault is locked. Unlock it before adding an unlock method.");
  }
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  await setVaultRawKey(rawKey);
  return rawKey;
}

async function derivePrfUnlockKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(prfOutput),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("nenjo-passkey-prf-v1"),
      info: new TextEncoder().encode("nenjo-local-vault-unlock"),
    },
    baseKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function rewriteEncryptedRecordWithVault(db: IDBDatabase, key: string, accountId: string): Promise<void> {
  const stored = await idbGet<StoredEncryptedAck & Record<string, unknown>>(db, key);
  if (!stored?.nonce || !stored.ciphertext || stored.wrap === "vault") return;
  const plaintext = await decryptBytesFromStorage(stored);
  const encrypted = await encryptBytesForStorage(plaintext);
  await idbPut(db, key, {
    ...stored,
    account_id: typeof stored.account_id === "string" ? stored.account_id : accountId,
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    version: encrypted.version,
    wrap: encrypted.wrap,
  });
}

async function migrateLocalSecretsToVault(accountId: string): Promise<void> {
  const db = await openDb();
  const existing = await idbGet<VaultConfig>(db, VAULT_CONFIG_ENTRY);
  if (existing?.account_id && existing.account_id !== accountId) {
    throw new Error("This browser's local vault belongs to a different signed-in account.");
  }
  await idbPut(db, VAULT_CONFIG_ENTRY, {
    version: 1,
    enabled: true,
    account_id: existing?.account_id ?? accountId,
    created_at: new Date().toISOString(),
  } satisfies VaultConfig);
  const keys = await idbGetAllKeys(db);
  await Promise.all(
    keys
      .filter((key): key is string => typeof key === "string")
      .filter((key) =>
        key === ENCRYPTED_ACK_ENTRY ||
        key === ENCRYPTED_ACCOUNT_SIGNING_KEY_ENTRY ||
        key === ENCRYPTED_DEVICE_IDENTITY_ENTRY ||
        key.startsWith("encrypted-ock:"),
      )
      .map((key) => rewriteEncryptedRecordWithVault(db, key, accountId)),
  );
}

export function lockLocalSecretVault(): void {
  vaultKeyRawSession = null;
  vaultKeyPromise = null;
  vaultSessionAccountId = null;
  vaultIdleExpiresAt = null;
  lastVaultIdlePersistAt = 0;
  ackSessionCache = null;
  ackSessionAccountId = null;
  orgContentKeySessionCache.clear();
  accountSigningKeyPromise = null;
  accountSigningPublicKeyCache = null;
  deviceIdentityPromise = null;
  deviceIdentityEnsurePromise = null;
  void clearLocalSecretVaultSession();
}

export async function resetLocalEncryptedWorkspaceForRestore(): Promise<void> {
  if (typeof window === "undefined") return;
  lockLocalSecretVault();
  vaultSessionWrapKeyPromise = null;
  const db = await openDb();
  const keys = await idbGetAllKeys(db);
  const deleteKeys = keys.filter(shouldDeleteLocalEncryptedWorkspaceKeyForRestore);
  await Promise.all(deleteKeys.map((key) => idbDelete(db, key)));
}

export async function hasLocalSecretVault(): Promise<boolean> {
  return isVaultEnabled();
}

export async function hasPasswordUnlockMethod(accountId?: string | null): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const db = await openDb();
  const record = await idbGet<LocalPasswordUnlockRecord>(db, PASSWORD_UNLOCK_ENTRY);
  return record !== undefined && unlockRecordMatchesAccount(record.account_id, accountId);
}

export async function listLocalPasskeyUnlockMethods(accountId?: string | null): Promise<LocalPasskeyUnlockRecord[]> {
  if (typeof window === "undefined") return [];
  const db = await openDb();
  const keys = await idbGetAllKeys(db);
  const records = await Promise.all(
    keys
      .filter((key): key is string => typeof key === "string" && key.startsWith(PASSKEY_UNLOCK_PREFIX))
      .map((key) => idbGet<LocalPasskeyUnlockRecord>(db, key)),
  );
  return records.filter(
    (record): record is LocalPasskeyUnlockRecord =>
      record?.type === "passkey-prf" && unlockRecordMatchesAccount(record.account_id, accountId),
  );
}

export async function setupPasskeyUnlock(params: {
  accountId: string;
  credentialId: string;
  label?: string | null;
  salt: Uint8Array;
  prfOutput: Uint8Array;
}): Promise<void> {
  const rawVaultKey = await getOrCreateVaultRawKey(params.accountId);
  await migrateLocalSecretsToVault(params.accountId);
  const db = await openDb();
  const entryKey = `${PASSKEY_UNLOCK_PREFIX}${params.credentialId}`;
  const existing = await idbGet<LocalPasskeyUnlockRecord>(db, entryKey);
  const wrappingKey = await derivePrfUnlockKey(params.prfOutput);
  const encrypted = await encryptVaultRawKey(rawVaultKey, wrappingKey);
  const now = new Date().toISOString();
  await idbPut(db, entryKey, {
    version: 1,
    type: "passkey-prf",
    account_id: params.accountId,
    credential_id: params.credentialId,
    label: params.label ?? null,
    salt: bytesToBase64(params.salt),
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  } satisfies LocalPasskeyUnlockRecord);
}

export async function unlockWithPasskeyPrf(params: {
  credentialId: string;
  prfOutput: Uint8Array;
  accountId: string;
}): Promise<void> {
  const db = await openDb();
  const record = await idbGet<LocalPasskeyUnlockRecord>(
    db,
    `${PASSKEY_UNLOCK_PREFIX}${params.credentialId}`,
  );
  if (!record) {
    throw new Error("No local passkey unlock record exists for that credential.");
  }
  if (!unlockRecordMatchesAccount(record.account_id, params.accountId)) {
    throw new Error("This device unlock method belongs to a different signed-in account.");
  }
  const wrappingKey = await derivePrfUnlockKey(params.prfOutput);
  const rawVaultKey = await decryptVaultRawKey({
    nonce: record.nonce,
    ciphertext: record.ciphertext,
    wrappingKey,
  });
  await setVaultRawKey(rawVaultKey);
  await saveVaultUnlockSession(params.accountId);
}

export async function removeLocalPasskeyUnlock(credentialId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, `${PASSKEY_UNLOCK_PREFIX}${credentialId}`);
}

export async function removePasswordUnlockMethod(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, PASSWORD_UNLOCK_ENTRY);
}

export async function setupPasswordUnlock(password: string, accountId: string): Promise<void> {
  const normalized = password.trim();
  if (normalized.length < MIN_UNLOCK_PASSPHRASE_LENGTH) {
    throw new Error(`Use a password or passphrase with at least ${MIN_UNLOCK_PASSPHRASE_LENGTH} characters.`);
  }
  const rawVaultKey = await getOrCreateVaultRawKey(accountId);
  await migrateLocalSecretsToVault(accountId);
  const db = await openDb();
  const existing = await idbGet<LocalPasswordUnlockRecord>(db, PASSWORD_UNLOCK_ENTRY);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrappingKey = await derivePasswordUnlockKey({
    password: normalized,
    salt,
    iterations: UNLOCK_PBKDF2_ITERATIONS,
  });
  const encrypted = await encryptVaultRawKey(rawVaultKey, wrappingKey);
  const now = new Date().toISOString();
  await idbPut(db, PASSWORD_UNLOCK_ENTRY, {
    version: 1,
    type: "password",
    account_id: accountId,
    kdf: "pbkdf2-sha256",
    iterations: UNLOCK_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  } satisfies LocalPasswordUnlockRecord);
}

export async function unlockWithPassword(password: string, accountId: string): Promise<void> {
  const db = await openDb();
  const record = await idbGet<LocalPasswordUnlockRecord>(db, PASSWORD_UNLOCK_ENTRY);
  if (!record) {
    throw new Error("No passphrase unlock method is configured on this browser.");
  }
  if (!unlockRecordMatchesAccount(record.account_id, accountId)) {
    throw new Error("This passphrase unlock method belongs to a different signed-in account.");
  }
  const wrappingKey = await derivePasswordUnlockKey({
    password: password.trim(),
    salt: base64ToBytes(record.salt),
    iterations: record.iterations,
  });
  const rawVaultKey = await decryptVaultRawKey({
    nonce: record.nonce,
    ciphertext: record.ciphertext,
    wrappingKey,
  });
  await setVaultRawKey(rawVaultKey);
  await saveVaultUnlockSession(accountId);
}

export async function loadStoredAccountContentKey(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (ackSessionCache) {
    if (
      ackSessionAccountId !== null &&
      vaultSessionAccountId !== null &&
      ackSessionAccountId !== vaultSessionAccountId
    ) {
      ackSessionCache = null;
      ackSessionAccountId = null;
      return null;
    }
    return ackSessionCache;
  }

  const legacy = window.localStorage.getItem(LEGACY_ACCOUNT_CONTENT_KEY_STORAGE_KEY);
  if (legacy) {
    await setStoredAccountContentKey(legacy);
    window.localStorage.removeItem(LEGACY_ACCOUNT_CONTENT_KEY_STORAGE_KEY);
    ackSessionCache = legacy;
    ackSessionAccountId = vaultSessionAccountId;
    return legacy;
  }

  const db = await openDb();
  const stored = await idbGet<StoredEncryptedAck>(db, ENCRYPTED_ACK_ENTRY);
  if (!stored) return null;
  if (!recordMatchesAccount(stored.account_id, vaultSessionAccountId)) {
    return null;
  }
  const decrypted = await decryptStoredAck(stored);
  if (vaultSessionAccountId && !stored.account_id) {
    await idbPut(db, ENCRYPTED_ACK_ENTRY, {
      ...stored,
      account_id: vaultSessionAccountId,
    });
  }
  ackSessionCache = decrypted;
  ackSessionAccountId = vaultSessionAccountId;
  return decrypted;
}

export async function hasStoredAccountContentKey(): Promise<boolean> {
  return (await loadStoredAccountContentKey()) !== null;
}

export async function setStoredAccountContentKey(base64Key: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  const encrypted = await encryptAckForStorage(base64Key);
  await idbPut(db, ENCRYPTED_ACK_ENTRY, encrypted);
  ackSessionCache = base64Key;
  ackSessionAccountId = vaultSessionAccountId;
}

export async function loadStoredOrgContentKey(
  orgId: string,
  keyVersion: number,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const cacheKey = orgContentKeyStorageEntry(orgId, keyVersion);
  const cached = orgContentKeySessionCache.get(cacheKey);
  if (cached) return cached;

  const db = await openDb();
  const stored = await idbGet<StoredEncryptedAck>(db, cacheKey);
  if (!stored) return null;
  const decrypted = await decryptStoredAck(stored);
  orgContentKeySessionCache.set(cacheKey, decrypted);
  return decrypted;
}

export async function setStoredOrgContentKey(
  orgId: string,
  keyVersion: number,
  base64Key: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  const encrypted = await encryptAckForStorage(base64Key);
  const cacheKey = orgContentKeyStorageEntry(orgId, keyVersion);
  await idbPut(db, cacheKey, encrypted);
  orgContentKeySessionCache.set(cacheKey, base64Key);
}

export async function ensureOrgContentKey(orgId: string, keyVersion: number): Promise<string> {
  const existing = await loadStoredOrgContentKey(orgId, keyVersion);
  if (existing) return existing;

  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const base64Key = bytesToBase64(rawKey);
  await setStoredOrgContentKey(orgId, keyVersion, base64Key);
  return base64Key;
}

export async function requireStoredOrgContentKey(
  orgId: string,
  keyVersion: number,
): Promise<string> {
  const existing = await loadStoredOrgContentKey(orgId, keyVersion);
  if (!existing) {
    throw new Error("This device does not currently hold the org content key. Restore org access on this device first.");
  }
  return existing;
}

export async function clearStoredAccountContentKey(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, ENCRYPTED_ACK_ENTRY);
  window.localStorage.removeItem(LEGACY_ACCOUNT_CONTENT_KEY_STORAGE_KEY);
  ackSessionCache = null;
  ackSessionAccountId = null;
}

export async function generateAccountContentKey(): Promise<string> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const base64Key = bytesToBase64(rawKey);
  await setStoredAccountContentKey(base64Key);
  return base64Key;
}

export async function ensureAccountContentKey(): Promise<string> {
  const existing = await loadStoredAccountContentKey();
  if (existing) return existing;
  return generateAccountContentKey();
}

export function clearAccountContentKeySessionCache(): void {
  ackSessionCache = null;
  ackSessionAccountId = null;
}

export async function warmAccountContentKey(): Promise<boolean> {
  return (await loadStoredAccountContentKey()) !== null;
}

async function importX25519PublicKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asBufferSource(base64ToBytes(base64Key)),
    { name: "X25519" } as AlgorithmIdentifier,
    false,
    [],
  );
}

async function loadStoredDeviceIdentity(): Promise<{
  deviceId: string;
  keyPair: CryptoKeyPair;
  publicKey: string;
} | null> {
  if (typeof window === "undefined") return null;
  if (deviceIdentityPromise) return deviceIdentityPromise;

  deviceIdentityPromise = (async () => {
    const db = await openDb();
    const stored = await idbGet<StoredEncryptedDeviceIdentity>(db, ENCRYPTED_DEVICE_IDENTITY_ENTRY);
    if (!stored) {
      deviceIdentityPromise = null;
      return null;
    }
    const pkcs8 = await decryptBytesFromStorage({
      nonce: stored.nonce,
      ciphertext: stored.ciphertext,
    }).catch((err) => {
      throw describeCryptoError("decrypt stored device private key", err);
    });
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      asBufferSource(pkcs8),
      { name: "X25519" } as AlgorithmIdentifier,
      true,
      ["deriveBits"],
    ).catch((err) => {
      throw describeCryptoError("import X25519 private key (pkcs8)", err);
    });
    const publicKey = await crypto.subtle.importKey(
      "raw",
      asBufferSource(base64ToBytes(stored.enc_public_key)),
      { name: "X25519" } as AlgorithmIdentifier,
      true,
      [],
    ).catch((err) => {
      throw describeCryptoError("import X25519 public key (raw)", err);
    });
    return {
      deviceId: stored.device_id,
      keyPair: { privateKey, publicKey },
      publicKey: stored.enc_public_key,
    };
  })();

  return deviceIdentityPromise;
}

async function persistDeviceIdentity(params: {
  deviceId: string;
  keyPair: CryptoKeyPair;
}): Promise<{ deviceId: string; keyPair: CryptoKeyPair; publicKey: string }> {
  const db = await openDb();
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", params.keyPair.privateKey).catch((err) => {
      throw describeCryptoError("export X25519 private key (pkcs8)", err);
    }),
  );
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", params.keyPair.publicKey).catch((err) => {
      throw describeCryptoError("export X25519 public key (raw)", err);
    }),
  );
  const encryptedPrivateKey = await encryptBytesForStorage(privateKeyPkcs8);
  const publicKey = bytesToBase64(publicKeyRaw);
  await idbPut(
    db,
    ENCRYPTED_DEVICE_IDENTITY_ENTRY,
    withStorageEncryptionMetadata(encryptedPrivateKey, {
      device_id: params.deviceId,
      enc_public_key: publicKey,
    }) satisfies StoredEncryptedDeviceIdentity,
  );
  const result = { deviceId: params.deviceId, keyPair: params.keyPair, publicKey };
  deviceIdentityPromise = Promise.resolve(result);
  return result;
}

export async function ensureDeviceEncryptionIdentity(): Promise<{
  deviceId: string;
  publicKey: string;
}> {
  if (!deviceIdentityEnsurePromise) {
    deviceIdentityEnsurePromise = (async () => {
      const existing = await loadStoredDeviceIdentity();
      if (existing) {
        return { deviceId: existing.deviceId, publicKey: existing.publicKey };
      }

      const generated = await crypto.subtle.generateKey(
        { name: "X25519" } as AlgorithmIdentifier,
        true,
        ["deriveBits"],
      ).catch((err) => {
        throw describeCryptoError("generate X25519 key pair", err);
      });
      if (!("privateKey" in generated) || !("publicKey" in generated)) {
        throw new Error("Browser did not return an X25519 device key pair.");
      }
      const persisted = await persistDeviceIdentity({
        deviceId: crypto.randomUUID(),
        keyPair: generated,
      });
      return { deviceId: persisted.deviceId, publicKey: persisted.publicKey };
    })().catch((err) => {
      deviceIdentityEnsurePromise = null;
      throw err;
    });
  }
  return deviceIdentityEnsurePromise;
}

export async function importWrappedAccountContentKeyForDevice(
  wrappedAck: WrappedAccountContentKey,
): Promise<string> {
  const identity = await loadStoredDeviceIdentity();
  if (!identity) {
    throw new Error("This device does not have a local device identity yet.");
  }
  const privateKey = identity.keyPair.privateKey;
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(base64ToBytes(wrappedAck.ephemeral_public_key)),
    { name: "X25519" } as AlgorithmIdentifier,
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "X25519",
      public: ephemeralPublicKey,
    } as AlgorithmIdentifier,
    privateKey,
    256,
  );
  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const wrapKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: HKDF_INFO,
    },
    sharedSecretKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(wrappedAck.nonce)),
    },
    wrapKey,
    asBufferSource(base64ToBytes(wrappedAck.ciphertext)),
  );
  const base64Ack = bytesToBase64(new Uint8Array(plaintext));
  await setStoredAccountContentKey(base64Ack);
  return base64Ack;
}

export async function importWrappedOrgContentKeyForDevice(params: {
  orgId: string;
  wrappedOck: WrappedOrgContentKey;
}): Promise<string> {
  const identity = await loadStoredDeviceIdentity();
  if (!identity) {
    throw new Error("This device does not have a local device identity yet.");
  }
  const privateKey = identity.keyPair.privateKey;
  const ephemeralPublicKeyValue = params.wrappedOck.ephemeral_public_key;
  if (!ephemeralPublicKeyValue) {
    throw new Error("Device-wrapped OCK is missing an ephemeral public key.");
  }
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(base64ToBytes(ephemeralPublicKeyValue)),
    { name: "X25519" } as AlgorithmIdentifier,
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "X25519",
      public: ephemeralPublicKey,
    } as AlgorithmIdentifier,
    privateKey,
    256,
  );
  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const wrapKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: HKDF_INFO,
    },
    sharedSecretKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(params.wrappedOck.nonce)),
    },
    wrapKey,
    asBufferSource(base64ToBytes(params.wrappedOck.ciphertext)),
  );
  const base64Ock = bytesToBase64(new Uint8Array(plaintext));
  await setStoredOrgContentKey(params.orgId, params.wrappedOck.key_version, base64Ock);
  return base64Ock;
}

async function deriveWrapKeyForWorker(workerPublicKey: string): Promise<{
  wrapKey: CryptoKey;
  ephemeralPublicKey: string;
}> {
  const recipientPublicKey = await importX25519PublicKey(workerPublicKey);
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "X25519" } as AlgorithmIdentifier,
    true,
    ["deriveBits"],
  );
  if (!("privateKey" in ephemeralKeyPair) || !("publicKey" in ephemeralKeyPair)) {
    throw new Error("Browser did not return an X25519 key pair.");
  }

  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "X25519",
      public: recipientPublicKey,
    } as AlgorithmIdentifier,
    ephemeralKeyPair.privateKey,
    256,
  );
  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const wrapKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: HKDF_INFO,
    },
    sharedSecretKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["encrypt"],
  );
  const exportedEphemeralPublicKey = await crypto.subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey,
  );

  return {
    wrapKey,
    ephemeralPublicKey: bytesToBase64(new Uint8Array(exportedEphemeralPublicKey)),
  };
}

function signingPayload(certificate: Omit<WorkerCertificate, "signature">): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      account_id: certificate.account_id,
      api_key_id: certificate.api_key_id,
      issued_at: certificate.issued_at,
      enc_public_key: certificate.enc_public_key,
      sign_public_key: certificate.sign_public_key,
    }),
  );
}

async function loadStoredAccountSigningKeyPair(): Promise<CryptoKeyPair | null> {
  if (typeof window === "undefined") return null;
  if (accountSigningKeyPromise) return accountSigningKeyPromise;

  accountSigningKeyPromise = (async () => {
    const db = await openDb();
    const stored = await idbGet<StoredEncryptedAccountSigningKey>(
      db,
      ENCRYPTED_ACCOUNT_SIGNING_KEY_ENTRY,
    );
    if (!stored) {
      accountSigningKeyPromise = null;
      return null;
    }

    const pkcs8 = await decryptBytesFromStorage(stored);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      asBufferSource(pkcs8),
      SIGNING_ALGORITHM,
      true,
      ["sign"],
    );
    const publicKey = await crypto.subtle.importKey(
      "raw",
      asBufferSource(base64ToBytes(stored.public_key)),
      SIGNING_ALGORITHM,
      true,
      ["verify"],
    );
    accountSigningPublicKeyCache = stored.public_key;
    return { privateKey, publicKey };
  })();

  return accountSigningKeyPromise;
}

async function persistAccountSigningKeyPair(keyPair: CryptoKeyPair): Promise<string> {
  const db = await openDb();
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const encryptedPrivateKey = await encryptBytesForStorage(privateKeyPkcs8);
  const publicKeyBase64 = bytesToBase64(publicKeyRaw);
  await idbPut(
    db,
    ENCRYPTED_ACCOUNT_SIGNING_KEY_ENTRY,
    withStorageEncryptionMetadata(encryptedPrivateKey, {
      public_key: publicKeyBase64,
    }) satisfies StoredEncryptedAccountSigningKey,
  );
  accountSigningPublicKeyCache = publicKeyBase64;
  accountSigningKeyPromise = Promise.resolve(keyPair);
  return publicKeyBase64;
}

export async function ensureAccountSigningKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKey: string;
}> {
  const existing = await loadStoredAccountSigningKeyPair();
  if (existing) {
    return {
      keyPair: existing,
      publicKey: accountSigningPublicKeyCache ?? "",
    };
  }

  const generated = await crypto.subtle.generateKey(
    SIGNING_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in generated) || !("publicKey" in generated)) {
    throw new Error("Browser did not return an Ed25519 signing key pair.");
  }
  const publicKey = await persistAccountSigningKeyPair(generated);
  return { keyPair: generated, publicKey };
}

export async function loadAccountSigningPublicKey(): Promise<string | null> {
  if (accountSigningPublicKeyCache) return accountSigningPublicKeyCache;
  const existing = await loadStoredAccountSigningKeyPair();
  if (!existing) return null;
  return accountSigningPublicKeyCache;
}

export async function clearAccountSigningKeyPair(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, ENCRYPTED_ACCOUNT_SIGNING_KEY_ENTRY);
  accountSigningKeyPromise = null;
  accountSigningPublicKeyCache = null;
}

export async function warmAccountSigningKeyPair(): Promise<boolean> {
  return (await loadStoredAccountSigningKeyPair()) !== null;
}

export function generateRecoveryPhrase(wordCount = 12): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    const index = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
    words.push(RECOVERY_WORDS[index % RECOVERY_WORDS.length] ?? "anchor");
  }
  return words.join(" ");
}

async function deriveRecoveryKey(phrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(new TextEncoder().encode(normalizeRecoveryPhrase(phrase))),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBufferSource(salt),
      iterations: RECOVERY_PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: AES_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function exportAccountSigningKeyMaterial(): Promise<{
  privateKeyPkcs8: string;
  publicKey: string;
}> {
  const { keyPair, publicKey } = await ensureAccountSigningKeyPair();
  const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return {
    privateKeyPkcs8: bytesToBase64(new Uint8Array(privateKeyPkcs8)),
    publicKey,
  };
}

export async function buildRecoveryBundle(recoveryPhrase: string): Promise<RecoveryBundlePayload> {
  const ack = await ensureAccountContentKey();
  const signingKey = await exportAccountSigningKeyMaterial();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveRecoveryKey(recoveryPhrase, salt);
  const payload = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      account_content_key: ack,
      account_signing_private_key_pkcs8: signingKey.privateKeyPkcs8,
      account_signing_public_key: signingKey.publicKey,
      created_at: new Date().toISOString(),
    }),
  );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    payload,
  );

  return {
    version: 1,
    kdf: "pbkdf2-sha256",
    iterations: RECOVERY_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString(),
  };
}

export async function storeRecoveryBundle(bundle: RecoveryBundlePayload): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbPut(db, ENCRYPTED_RECOVERY_BUNDLE_ENTRY, bundle);
}

export async function loadStoredRecoveryBundle(): Promise<RecoveryBundlePayload | null> {
  if (typeof window === "undefined") return null;
  const db = await openDb();
  return (await idbGet<RecoveryBundlePayload>(db, ENCRYPTED_RECOVERY_BUNDLE_ENTRY)) ?? null;
}

export async function clearStoredRecoveryBundle(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await idbDelete(db, ENCRYPTED_RECOVERY_BUNDLE_ENTRY);
}

async function persistAccountSigningKeyMaterial(params: {
  privateKeyPkcs8: string;
  publicKey: string;
}): Promise<void> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    asBufferSource(base64ToBytes(params.privateKeyPkcs8)),
    SIGNING_ALGORITHM,
    true,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(base64ToBytes(params.publicKey)),
    SIGNING_ALGORITHM,
    true,
    ["verify"],
  );
  await persistAccountSigningKeyPair({ privateKey, publicKey });
}

export async function restoreFromRecoveryBundle(params: {
  recoveryPhrase: string;
  bundle: RecoveryBundlePayload;
  resetLocalVault?: boolean;
}): Promise<{ accountContentKey: string; publicKey: string }> {
  const { recoveryPhrase, bundle } = params;
  const wrapKey = await deriveRecoveryKey(recoveryPhrase, base64ToBytes(bundle.salt));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(bundle.nonce)),
    },
    wrapKey,
    asBufferSource(base64ToBytes(bundle.ciphertext)),
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
    version: number;
    account_content_key: string;
    account_signing_private_key_pkcs8: string;
    account_signing_public_key: string;
  };
  if (!parsed.account_content_key || !parsed.account_signing_private_key_pkcs8) {
    throw new Error("Recovery bundle is missing required key material.");
  }

  if (params.resetLocalVault) {
    await resetLocalEncryptedWorkspaceForRestore();
  }
  await setStoredAccountContentKey(parsed.account_content_key);
  await persistAccountSigningKeyMaterial({
    privateKeyPkcs8: parsed.account_signing_private_key_pkcs8,
    publicKey: parsed.account_signing_public_key,
  });
  await storeRecoveryBundle(bundle);

  return {
    accountContentKey: parsed.account_content_key,
    publicKey: parsed.account_signing_public_key,
  };
}

export const __cryptoContentTest = {
  MIN_UNLOCK_PASSPHRASE_LENGTH,
  recordMatchesAccount,
  unlockRecordMatchesAccount,
  withStorageEncryptionMetadata,
};

export async function wrapAccountContentKeyForWorker(params: {
  workerPublicKey: string;
  keyVersion?: number;
}): Promise<WrappedAccountContentKey> {
  const base64Key = await loadStoredAccountContentKey();
  if (!base64Key) {
    throw new Error("No local account content key is configured on this device.");
  }

  const { workerPublicKey, keyVersion = 1 } = params;
  const { wrapKey, ephemeralPublicKey } = await deriveWrapKeyForWorker(workerPublicKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    asBufferSource(base64ToBytes(base64Key)),
  );

  return {
    key_version: keyVersion,
    algorithm: WRAP_ALGORITHM,
    ephemeral_public_key: ephemeralPublicKey,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString(),
  };
}

export async function wrapOrgContentKeyForWorker(params: {
  orgId: string;
  keyVersion?: number;
  workerPublicKey: string;
}): Promise<WrappedOrgContentKey> {
  const { orgId, workerPublicKey, keyVersion = 1 } = params;
  const base64Key = await requireStoredOrgContentKey(orgId, keyVersion);
  const { wrapKey, ephemeralPublicKey } = await deriveWrapKeyForWorker(workerPublicKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    asBufferSource(base64ToBytes(base64Key)),
  );

  return {
    key_version: keyVersion,
    algorithm: WRAP_ALGORITHM,
    ephemeral_public_key: ephemeralPublicKey,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString(),
  };
}

export async function wrapOrgContentKeyForRecovery(params: {
  orgId: string;
  keyVersion?: number;
}): Promise<WrappedOrgContentKey> {
  const { orgId, keyVersion = 1 } = params;
  const accountContentKey = await loadStoredAccountContentKey();
  if (!accountContentKey) {
    throw new Error("No local account content key is configured on this device.");
  }

  const orgContentKey = await requireStoredOrgContentKey(orgId, keyVersion);
  const wrapKey = await importAck(base64ToBytes(accountContentKey));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
    },
    wrapKey,
    asBufferSource(base64ToBytes(orgContentKey)),
  );

  return {
    key_version: keyVersion,
    algorithm: "ack-aes-256-gcm",
    ephemeral_public_key: null,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString(),
  };
}

export async function importWrappedOrgContentKeyFromRecovery(params: {
  orgId: string;
  wrappedOck: WrappedOrgContentKey;
}): Promise<string> {
  const accountContentKey = await loadStoredAccountContentKey();
  if (!accountContentKey) {
    throw new Error("No local account content key is configured on this device.");
  }
  if (params.wrappedOck.algorithm !== "ack-aes-256-gcm") {
    throw new Error(`Unsupported recovery-wrapped OCK algorithm: ${params.wrappedOck.algorithm}`);
  }

  const wrapKey = await importAck(base64ToBytes(accountContentKey));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(params.wrappedOck.nonce)),
    },
    wrapKey,
    asBufferSource(base64ToBytes(params.wrappedOck.ciphertext)),
  );
  const base64Ock = bytesToBase64(new Uint8Array(plaintext));
  await setStoredOrgContentKey(params.orgId, params.wrappedOck.key_version, base64Ock);
  return base64Ock;
}

export async function buildTrustedDevicePayload(params?: {
  deviceLabel?: string | null;
  keyVersion?: number;
  requireSigningKey?: boolean;
}): Promise<TrustedDevicePayload> {
  const requireSigningKey = params?.requireSigningKey ?? true;
  const deviceIdentityPromise = ensureDeviceEncryptionIdentity();
  const signingPublicKeyPromise = requireSigningKey
    ? ensureAccountSigningKeyPair().then(({ publicKey }) => publicKey)
    : loadAccountSigningPublicKey();
  const [deviceIdentity, signingPublicKey] = await Promise.all([
    deviceIdentityPromise,
    signingPublicKeyPromise,
  ]);
  const wrappedAck = await wrapAccountContentKeyForWorker({
    workerPublicKey: deviceIdentity.publicKey,
    keyVersion: params?.keyVersion ?? 1,
  });

  return {
    device_id: deviceIdentity.deviceId,
    device_label: params?.deviceLabel ?? null,
    enc_public_key: deviceIdentity.publicKey,
    sign_public_key: signingPublicKey ?? "",
    wrapped_ack: wrappedAck,
  };
}

export async function buildCurrentOrgContentKeyBootstrap(params: {
  orgId: string;
  keyVersion: number;
}): Promise<{
  device_id: string;
  wrapped_ock: WrappedOrgContentKey;
  recovery_wrapped_ock: WrappedOrgContentKey;
}> {
  const deviceIdentity = await ensureDeviceEncryptionIdentity();
  await ensureOrgContentKey(params.orgId, params.keyVersion);

  return {
    device_id: deviceIdentity.deviceId,
    wrapped_ock: await wrapOrgContentKeyForWorker({
      orgId: params.orgId,
      keyVersion: params.keyVersion,
      workerPublicKey: deviceIdentity.publicKey,
    }),
    recovery_wrapped_ock: await wrapOrgContentKeyForRecovery({
      orgId: params.orgId,
      keyVersion: params.keyVersion,
    }),
  };
}

export async function buildDeviceEnrollmentPayload(params?: {
  deviceLabel?: string | null;
}): Promise<import("./types").DeviceEnrollmentPayload> {
  const deviceIdentity = await ensureDeviceEncryptionIdentity();
  return {
    device_id: deviceIdentity.deviceId,
    device_label: params?.deviceLabel ?? null,
    enc_public_key: deviceIdentity.publicKey,
    verification_code: generateVerificationCode(),
    state: "pending",
    wrapped_ack: null,
  };
}

export async function buildWorkerCertificate(params: {
  accountId: string;
  apiKeyId: string;
  encPublicKey: string;
  signPublicKey: string;
}): Promise<WorkerCertificate> {
  const unsignedCertificate = {
    account_id: params.accountId,
    api_key_id: params.apiKeyId,
    issued_at: new Date().toISOString(),
    enc_public_key: params.encPublicKey,
    sign_public_key: params.signPublicKey,
  };
  const { keyPair } = await ensureAccountSigningKeyPair();
  const signature = await crypto.subtle.sign(
    SIGNING_ALGORITHM,
    keyPair.privateKey,
    asBufferSource(signingPayload(unsignedCertificate)),
  );

  return {
    ...unsignedCertificate,
    signature: bytesToBase64(new Uint8Array(signature)),
  };
}

export async function encryptContentPayload(params: {
  accountId: string;
  objectId: string;
  objectType: string;
  plaintext: string;
  keyVersion?: number;
}): Promise<EncryptedPayload | null> {
  const base64Key = await loadStoredAccountContentKey();
  if (!base64Key) return null;

  const { accountId, objectId, objectType, plaintext, keyVersion = 1 } = params;
  const key = await importAck(base64ToBytes(base64Key));
  return encryptContentPayloadWithKey({
    key,
    accountId,
    encryptionScope: "user",
    objectId,
    objectType,
    plaintext,
    keyVersion,
  });
}

async function encryptContentPayloadWithKey(params: {
  key: CryptoKey;
  accountId: string;
  encryptionScope: "user" | "org";
  objectId: string;
  objectType: string;
  plaintext: string;
  keyVersion: number;
}): Promise<EncryptedPayload> {
  const {
    key,
    accountId,
    encryptionScope,
    objectId,
    objectType,
    plaintext,
    keyVersion,
  } = params;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv: nonce,
      additionalData: asBufferSource(payloadAad(accountId, objectId, objectType)),
    },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    account_id: accountId,
    encryption_scope: encryptionScope,
    object_id: objectId,
    object_type: objectType,
    algorithm: PAYLOAD_ALGORITHM,
    key_version: keyVersion,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function encryptOrgContentPayload(params: {
  orgId: string;
  objectId: string;
  objectType: string;
  plaintext: string;
  keyVersion?: number;
}): Promise<EncryptedPayload | null> {
  const { orgId, objectId, objectType, plaintext, keyVersion = 1 } = params;
  const base64Key = await loadStoredOrgContentKey(orgId, keyVersion);
  if (!base64Key) return null;

  const key = await importAck(base64ToBytes(base64Key));
  return encryptContentPayloadWithKey({
    key,
    accountId: orgId,
    encryptionScope: "org",
    objectId,
    objectType,
    plaintext,
    keyVersion,
  });
}

export async function decryptContentPayload(
  payload: EncryptedPayload,
): Promise<string | null> {
  if (payload.algorithm !== PAYLOAD_ALGORITHM) return null;

  const base64Key =
    normalizePayloadScope(payload.encryption_scope) === "org"
      ? await loadStoredOrgContentKey(payload.account_id, payload.key_version)
      : await loadStoredAccountContentKey();
  if (!base64Key) return null;

  const key = await importAck(base64ToBytes(base64Key));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: asBufferSource(base64ToBytes(payload.nonce)),
      additionalData: asBufferSource(
        payloadAad(payload.account_id, payload.object_id, payload.object_type),
      ),
    },
    key,
    asBufferSource(base64ToBytes(payload.ciphertext)),
  );

  return new TextDecoder().decode(plaintext);
}
