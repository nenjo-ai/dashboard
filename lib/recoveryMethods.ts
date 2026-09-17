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
  buildRestoreCompletionStatement,
  sha256Hex,
  signRestoreCompletionStatement,
} from "./recoveryStatement";
import {
  assertSecureCryptoContextSafe as assertSecureCryptoContext,
  decodeAndValidateRecoveryPayload,
  openRecoveryEnvelope,
  parseEnvelopeCiphertext,
  RECOVERY_METHOD_TYPE_PASSKEY,
  sealRecoveryEnvelope,
  type AccountRecoveryPayload,
} from "./recoveryEnvelope";
import {
  buildTrustedDevicePayload,
  exportAccountSigningKeyMaterial,
  hasStoredAccountContentKey,
  loadStoredAccountContentKey,
  persistAccountSigningKeyMaterial,
  resetLocalEncryptedWorkspaceForRestore,
  setStoredAccountContentKey,
} from "./cryptoContent";

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
  const statement = buildRestoreCompletionStatement({
    attemptId: params.attemptId,
    methodId: params.methodId,
    methodRevision: params.methodRevision,
    keyEpoch: params.keyEpoch,
    deviceId: params.deviceId,
    deviceSignPublicKey: params.deviceSignPublicKey,
    wrappedAckJson,
    wrappedAckSha256: await sha256Hex(wrappedAckJson),
  });
  return signRestoreCompletionStatement({
    accountSigningPrivateKeyPkcs8: params.accountSigningPrivateKeyPkcs8,
    statement,
  });
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

export { RECOVERY_METHOD_TYPE_PASSKEY } from "./recoveryEnvelope";
export { decodeAndValidateRecoveryPayload } from "./recoveryEnvelope";
