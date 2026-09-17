"use client";

// Account recovery methods (BOO-26): enrollment and seamless restore of
// browser crypto state after local key material is lost (e.g. site data
// cleared). The platform stores only opaque ciphertext; every secret-bearing
// step happens in this module.
//
// Separation of concerns (per the recovery plan):
//   decodeAndValidateRecoveryPayload — strict decrypt + schema validation
//   commitRestoredVault              — fresh device identity, signed server
//                                      completion, then local persistence
// Orchestration functions drive the server round-trips via lib/api.

import {
  activateRecoveryMethod,
  completeRecoveryRestore,
  establishRecoveryAnchor,
  fetchRecoveryEnvelope,
  fetchStagedRecoveryEnvelope,
  fetchRecoveryAnchor,
  finishPasskeyRecoveryAssertion,
  finishPasskeyRecoveryRegistration,
  listRecoveryMethods,
  stageRecoveryMethod,
  startPasskeyRecoveryAssertion,
  startPasskeyRecoveryRegistration,
  startRecoveryAttempt,
  type RecoveryEnvelope,
  type RecoveryMethodMetadata,
} from "./api";
import {
  assertWithCeremony,
  base64UrlToBytes,
  bytesToBase64Url,
  createPasskeyWithCeremony,
} from "./webauthnCeremony";
import {
  base64ToBytes,
  buildTrustedDevicePayload,
  bytesToBase64,
  exportAccountSigningKeyMaterial,
  hasStoredAccountContentKey,
  loadStoredAccountContentKey,
  persistAccountSigningKeyMaterial,
  resetLocalEncryptedWorkspaceForRestore,
  setStoredAccountContentKey,
} from "./cryptoContent";

const RECOVERY_HKDF_INFO = "nenjo:account-recovery:v1";
export const RECOVERY_METHOD_TYPE_PASSKEY = "passkey_prf";

export type AccountRecoveryPayload = {
  version: 1;
  account_content_key: string;
  account_signing_private_key_pkcs8: string;
  account_signing_public_key: string;
  created_at: string;
};

export type RecoveryEnvelopeBlob = {
  v: 1;
  alg: "a256gcm";
  kdf: "hkdf-sha256";
  hkdf_salt: string;
  nonce: string;
  ciphertext: string;
};

export type RecoveryCryptoHeader = {
  alg: "a256gcm";
  kdf: "hkdf-sha256";
  info: string;
  aad: string;
  aad_fields: string[];
  nonce_bits: number;
  tag_bits: number;
};

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function assertSecureCryptoContext(): void {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof crypto?.subtle === "undefined"
  ) {
    throw new Error("Account recovery requires a secure browser context.");
  }
}

/// HKDF-SHA256 wrapping key. The input secret is the factor ceremony output
/// (WebAuthn PRF result, or the OPAQUE export key for passwords) — never an
/// assertion signature, credential ID, or session key.
async function deriveRecoveryWrapKey(
  secret: Uint8Array,
  hkdfSalt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asBufferSource(hkdfSalt),
      info: asBufferSource(utf8(RECOVERY_HKDF_INFO)),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/// Authenticated associated data binding the envelope to its factor and
/// account key epoch. Uses the stable credential binding (factor reference)
/// rather than server-assigned identifiers, so the same AAD is reproducible
/// before and after the server assigns a method id / bumps the revision.
function recoveryAad(binding: {
  methodType: string;
  factorReference: string;
  keyEpoch: number;
}): Uint8Array {
  return utf8(
    [
      "nenjo-account-recovery-envelope:v1",
      "account-recovery",
      binding.methodType,
      binding.factorReference,
      String(binding.keyEpoch),
    ].join("|"),
  );
}

async function sealRecoveryEnvelope(params: {
  payload: AccountRecoveryPayload;
  wrapSecret: Uint8Array;
  binding: { methodType: string; factorReference: string; keyEpoch: number };
}): Promise<{ blob: RecoveryEnvelopeBlob; cryptoHeader: Record<string, unknown> }> {
  const hkdfSalt = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveRecoveryWrapKey(params.wrapSecret, hkdfSalt);
  const plaintext = utf8(JSON.stringify(params.payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asBufferSource(nonce),
      additionalData: asBufferSource(recoveryAad(params.binding)),
      tagLength: 128,
    },
    wrapKey,
    asBufferSource(plaintext),
  );
  const cryptoHeader: RecoveryCryptoHeader = {
    alg: "a256gcm",
    kdf: "hkdf-sha256",
    info: RECOVERY_HKDF_INFO,
    aad: "nenjo-account-recovery-envelope:v1",
    aad_fields: ["method_type", "factor_reference", "key_epoch"],
    nonce_bits: 96,
    tag_bits: 128,
  };
  return {
    blob: {
      v: 1,
      alg: "a256gcm",
      kdf: "hkdf-sha256",
      hkdf_salt: bytesToBase64(hkdfSalt),
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
    cryptoHeader: cryptoHeader as unknown as Record<string, unknown>,
  };
}

async function openRecoveryEnvelope(params: {
  blob: RecoveryEnvelopeBlob;
  wrapSecret: Uint8Array;
  binding: { methodType: string; factorReference: string; keyEpoch: number };
}): Promise<AccountRecoveryPayload> {
  if (
    params.blob.v !== 1 ||
    params.blob.alg !== "a256gcm" ||
    params.blob.kdf !== "hkdf-sha256"
  ) {
    throw new Error("Unsupported recovery envelope format.");
  }
  const wrapKey = await deriveRecoveryWrapKey(
    params.wrapSecret,
    base64ToBytes(params.blob.hkdf_salt),
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(base64ToBytes(params.blob.nonce)),
        additionalData: asBufferSource(recoveryAad(params.binding)),
        tagLength: 128,
      },
      wrapKey,
      asBufferSource(base64ToBytes(params.blob.ciphertext)),
    );
  } catch {
    throw new Error(
      "Recovery envelope failed authentication. The wrong factor was used or the record was tampered with.",
    );
  }
  return decodeAndValidateRecoveryPayload(
    JSON.parse(new TextDecoder().decode(plaintext)),
  );
}

export function decodeAndValidateRecoveryPayload(
  value: unknown,
): AccountRecoveryPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid recovery payload.");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("Unsupported recovery payload version.");
  }
  for (const field of [
    "account_content_key",
    "account_signing_private_key_pkcs8",
    "account_signing_public_key",
    "created_at",
  ] as const) {
    if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
      throw new Error(`Recovery payload is missing ${field}.`);
    }
  }
  // Strict schema: unexpected fields mean a future format we must not parse.
  const allowed = new Set([
    "version",
    "account_content_key",
    "account_signing_private_key_pkcs8",
    "account_signing_public_key",
    "created_at",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`Unexpected field in recovery payload: ${key}`);
    }
  }
  return {
    version: 1,
    account_content_key: record.account_content_key as string,
    account_signing_private_key_pkcs8: record.account_signing_private_key_pkcs8 as string,
    account_signing_public_key: record.account_signing_public_key as string,
    created_at: record.created_at as string,
  };
}

function parseEnvelopeCiphertext(raw: string): RecoveryEnvelopeBlob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Recovery envelope is not valid JSON.");
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.v !== 1 ||
    record.alg !== "a256gcm" ||
    typeof record.hkdf_salt !== "string" ||
    typeof record.nonce !== "string" ||
    typeof record.ciphertext !== "string"
  ) {
    throw new Error("Recovery envelope has an invalid structure.");
  }
  return parsed as RecoveryEnvelopeBlob;
}

// ---------------------------------------------------------------------------
// Read-only payload export (no key generation during recovery operations)
// ---------------------------------------------------------------------------

async function buildAccountRecoveryPayload(): Promise<AccountRecoveryPayload> {
  // Require existing keys: recovery enrollment must never mint replacements.
  if (!(await hasStoredAccountContentKey())) {
    throw new Error("No local account content key is available to back up.");
  }
  const accountContentKey = await loadStoredAccountContentKey();
  if (!accountContentKey) {
    throw new Error("No local account content key is available to back up.");
  }
  const signing = await exportAccountSigningKeyMaterial();
  return {
    version: 1,
    account_content_key: accountContentKey,
    account_signing_private_key_pkcs8: signing.privateKeyPkcs8,
    account_signing_public_key: signing.publicKey,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Enrollment (staged: start -> stage -> readback/decrypt -> activate)
// ---------------------------------------------------------------------------

export async function enrollPasskeyRecoveryMethod(params: {
  label?: string | null;
}): Promise<RecoveryMethodMetadata> {
  assertSecureCryptoContext();
  const payload = await buildAccountRecoveryPayload();

  // Pin the account signing anchor once. The anchor public key is the account
  // signing key already held by this (authorized, unlocked) browser.
  const anchor = await fetchRecoveryAnchor();
  if (!anchor.established) {
    await establishRecoveryAnchor({
      sign_public_key: {
        algorithm: "ed25519",
        public_key: payload.account_signing_public_key,
      },
    });
  }

  // 1. Server-verified registration ceremony. The platform verifies the
  // attestation against its configured RP/origin allowlist; unverified
  // metadata can never become a recovery factor.
  const registration = await startPasskeyRecoveryRegistration();
  const created = await createPasskeyWithCeremony(registration);
  const verified = await finishPasskeyRecoveryRegistration({
    ceremony_id: registration.ceremony_id,
    response: created.responseJson,
    label: params.label,
  });

  // 2. Follow-up assertion to obtain PRF output: registration alone does not
  // guarantee PRF results. The PRF input is random, public, and persisted
  // with the method metadata; the output never leaves the browser.
  const prfInput = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await startPasskeyRecoveryAssertion({
    credential_id: verified.credential_id,
  });
  const assertionResult = await assertWithCeremony({
    options: { publicKey: assertion.publicKey },
    prfSalt: prfInput,
  });
  await finishPasskeyRecoveryAssertion({
    ceremony_id: assertion.ceremony_id,
    response: assertionResult.responseJson,
  });
  const prfOutput = assertionResult.prfOutput;
  if (!prfOutput) {
    throw new Error("This passkey did not return WebAuthn PRF output.");
  }

  // 3. Staged enrollment: seal the payload, upload, read back, decrypt
  // through the factor path, then activate with CAS on the revision.
  const started = await startRecoveryAttempt({ purpose: "enroll", key_epoch: 1 });
  const binding = {
    methodType: RECOVERY_METHOD_TYPE_PASSKEY,
    factorReference: verified.credential_row_id,
    keyEpoch: 1,
  };
  const sealed = await sealRecoveryEnvelope({
    payload,
    wrapSecret: prfOutput,
    binding,
  });

  const staged = await stageRecoveryMethod({
    attempt_id: started.attempt_id,
    challenge: started.challenge,
    method_type: RECOVERY_METHOD_TYPE_PASSKEY,
    key_epoch: 1,
    crypto_header: sealed.cryptoHeader,
    ciphertext: JSON.stringify(sealed.blob),
    factor_reference: verified.credential_row_id,
    metadata: {
      // Public PRF input for future ceremonies; the HKDF salt stays in the
      // envelope blob. These are distinct values per the recovery plan.
      prf_input: bytesToBase64Url(prfInput),
      prf_credential_id: verified.credential_id,
      ...(params.label ? { label: params.label } : {}),
    },
  });

  const envelope = await fetchStagedRecoveryEnvelope({
    attempt_id: started.attempt_id,
    challenge: started.challenge,
  });
  const blob = parseEnvelopeCiphertext(envelope.ciphertext);
  await openRecoveryEnvelope({ blob, wrapSecret: prfOutput, binding });

  return activateRecoveryMethod({
    method_id: staged.id,
    expected_revision: staged.revision,
  });
}

// ---------------------------------------------------------------------------
// Restore: seamless device-unlock modal flow
// ---------------------------------------------------------------------------

export async function listRestorableMethods(): Promise<RecoveryMethodMetadata[]> {
  let methods: RecoveryMethodMetadata[];
  try {
    methods = await listRecoveryMethods();
  } catch {
    return [];
  }
  return methods.filter(
    (method) => method.state === "active" || method.state === "stale",
  );
}

/// Restores browser crypto state from a server-held recovery envelope using
/// the passkey PRF factor. Validates everything in memory before persisting;
/// on failure no local records are altered.
export async function restoreWithPasskeyRecoveryMethod(
  method: RecoveryMethodMetadata,
): Promise<{ accountContentKey: string; publicKey: string }> {
  assertSecureCryptoContext();

  const started = await startRecoveryAttempt({
    purpose: "restore",
    method_id: method.id,
    key_epoch: method.key_epoch,
  });

  // Server-verified assertion bound to this restore attempt; the platform
  // marks the attempt factor-verified only after a successful ceremony. The
  // PRF output is evaluated locally and never serialized into the response.
  const prfInputRaw = method.metadata?.prf_input;
  if (typeof prfInputRaw !== "string") {
    throw new Error("Recovery method is missing its PRF input.");
  }
  const assertion = await startPasskeyRecoveryAssertion({
    attempt_id: started.attempt_id,
    method_id: method.id,
    credential_id: method.metadata?.prf_credential_id as string | undefined,
  });
  const assertionResult = await assertWithCeremony({
    options: { publicKey: assertion.publicKey },
    prfSalt: base64UrlToBytes(prfInputRaw),
  });
  await finishPasskeyRecoveryAssertion({
    ceremony_id: assertion.ceremony_id,
    response: assertionResult.responseJson,
  });
  const prfOutput = assertionResult.prfOutput;
  if (!prfOutput) {
    throw new Error("This passkey did not return WebAuthn PRF output.");
  }

  const envelope: RecoveryEnvelope = await fetchRecoveryEnvelope({
    attempt_id: started.attempt_id,
    challenge: started.challenge,
  });
  if (envelope.key_epoch !== method.key_epoch) {
    throw new Error("Recovery envelope epoch does not match the restore attempt.");
  }
  const blob = parseEnvelopeCiphertext(envelope.ciphertext);
  const payload = await openRecoveryEnvelope({
    blob,
    wrapSecret: prfOutput,
    binding: {
      methodType: envelope.method_type,
      factorReference: method.factor_reference,
      keyEpoch: envelope.key_epoch,
    },
  });

  return commitRestoredVault({
    payload,
    attemptId: started.attempt_id,
    challenge: started.challenge,
    methodId: envelope.method_id,
    methodRevision: envelope.revision,
    keyEpoch: envelope.key_epoch,
  });
}

// ---------------------------------------------------------------------------
// Signed fresh-device completion and local commit
// ---------------------------------------------------------------------------

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    asBufferSource(utf8(value)),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signRecoveryCompletion(params: {
  attemptId: string;
  methodId: string;
  methodRevision: number;
  keyEpoch: number;
  deviceId: string;
  deviceSignPublicKey: string;
  wrappedAck: Record<string, unknown>;
  accountSigningPrivateKeyPkcs8: string;
}): Promise<string> {
  // Must mirror the platform's serde field order for wrapped_ack exactly:
  // key_version, algorithm, ephemeral_public_key, nonce, ciphertext, created_at.
  const wrappedAckJson = JSON.stringify(params.wrappedAck);
  const wrappedAckSha256 = await sha256Hex(wrappedAckJson);
  // Exact field order of the platform's canonical_restore_statement.
  const canonical = [
    "nenjo-account-recovery-restore:v1",
    `attempt_id=${params.attemptId}`,
    `method_id=${params.methodId}`,
    `method_revision=${params.methodRevision}`,
    `key_epoch=${params.keyEpoch}`,
    `device_id=${params.deviceId}`,
    `sign_public_key=${params.deviceSignPublicKey}`,
    `wrapped_ack_json=${wrappedAckJson}`,
    `wrapped_ack_sha256=${wrappedAckSha256}`,
  ].join("\n");

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    asBufferSource(base64ToBytes(params.accountSigningPrivateKeyPkcs8)),
    "Ed25519",
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    asBufferSource(utf8(canonical)),
  );
  return bytesToBase64(new Uint8Array(signature));
}

/// Persists the decrypted payload as a fresh device: new local vault, restored
/// account keys, fresh device identity, and the signed server completion.
async function commitRestoredVault(params: {
  payload: AccountRecoveryPayload;
  attemptId: string;
  challenge: string;
  methodId: string;
  methodRevision: number;
  keyEpoch: number;
}): Promise<{ accountContentKey: string; publicKey: string }> {
  // Stage the fresh local vault (fresh device identity is generated because
  // none exists after site-data loss).
  await resetLocalEncryptedWorkspaceForRestore();
  await setStoredAccountContentKey(params.payload.account_content_key);
  await persistAccountSigningKeyMaterial({
    privateKeyPkcs8: params.payload.account_signing_private_key_pkcs8,
    publicKey: params.payload.account_signing_public_key,
  });

  const device = await buildTrustedDevicePayload({ requireSigningKey: false });
  const completionSignature = await signRecoveryCompletion({
    attemptId: params.attemptId,
    methodId: params.methodId,
    methodRevision: params.methodRevision,
    keyEpoch: params.keyEpoch,
    deviceId: device.device_id,
    deviceSignPublicKey: device.sign_public_key,
    wrappedAck: device.wrapped_ack as unknown as Record<string, unknown>,
    accountSigningPrivateKeyPkcs8: params.payload.account_signing_private_key_pkcs8,
  });

  await completeRecoveryRestore({
    attempt_id: params.attemptId,
    challenge: params.challenge,
    method_id: params.methodId,
    method_revision: params.methodRevision,
    key_epoch: params.keyEpoch,
    device_id: device.device_id,
    device_label: device.device_label,
    enc_public_key: device.enc_public_key,
    sign_public_key: device.sign_public_key,
    wrapped_ack: device.wrapped_ack,
    completion_signature: completionSignature,
  });

  return {
    accountContentKey: params.payload.account_content_key,
    publicKey: params.payload.account_signing_public_key,
  };
}
