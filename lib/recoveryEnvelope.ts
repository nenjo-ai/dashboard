// Recovery envelope crypto primitives (BOO-26). Pure module: browser WebCrypto
// only via globalThis, no API/import-tree dependencies, safe to unit test in
// Node. Consumed by lib/recoveryMethods.ts.

const RECOVERY_HKDF_INFO = "nenjo:account-recovery:v1";
export const RECOVERY_AAD_PREFIX = "nenjo-account-recovery-envelope:v1";
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

export type RecoveryAadBinding = {
  methodType: string;
  factorReference: string;
  keyEpoch: number;
};

/// Browser-context guard; tolerant of non-browser import environments so the
/// module can be unit-tested in Node.
export function assertSecureCryptoContextSafe(): void {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof crypto?.subtle === "undefined"
  ) {
    throw new Error("Account recovery requires a secure browser context.");
  }
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

/// Authenticated associated data binding the envelope to its factor and
/// account key epoch. Uses the stable credential binding (factor reference)
/// rather than server-assigned identifiers, so the same AAD is reproducible
/// before and after the server assigns a method id / bumps the revision.
export function recoveryAad(binding: RecoveryAadBinding): Uint8Array {
  return utf8(
    [
      RECOVERY_AAD_PREFIX,
      "account-recovery",
      binding.methodType,
      binding.factorReference,
      String(binding.keyEpoch),
    ].join("|"),
  );
}

/// HKDF-SHA256 wrapping key. The input secret is the factor ceremony output
/// (WebAuthn PRF result, or the OPAQUE export key for passwords) — never an
/// assertion signature, credential ID, or session key.
export async function deriveRecoveryWrapKey(
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

export async function sealRecoveryEnvelope(params: {
  payload: AccountRecoveryPayload;
  wrapSecret: Uint8Array;
  binding: RecoveryAadBinding;
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
    aad: RECOVERY_AAD_PREFIX,
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

export async function openRecoveryEnvelope(params: {
  blob: RecoveryEnvelopeBlob;
  wrapSecret: Uint8Array;
  binding: RecoveryAadBinding;
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

export function parseEnvelopeCiphertext(raw: string): RecoveryEnvelopeBlob {
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
