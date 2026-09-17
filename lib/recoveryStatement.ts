// Canonical restore-completion statement construction and signing
// (BOO-26). Pure module: no browser/API dependencies, safe to unit test in
// Node. The exact field order MUST mirror the platform's
// `canonical_restore_statement` in
// platform/crates/api-server/src/routes/content_encryption.rs.

export type RestoreCompletionStatementInput = {
  attemptId: string;
  methodId: string;
  methodRevision: number;
  keyEpoch: number;
  deviceId: string;
  deviceSignPublicKey: string;
  /** JSON string of the wrapped ACK, with platform serde field order. */
  wrappedAckJson: string;
  /** Hex sha-256 of wrappedAckJson. */
  wrappedAckSha256: string;
};

export const RESTORE_STATEMENT_PREFIX = "nenjo-account-recovery-restore:v1";

export function buildRestoreCompletionStatement(
  input: RestoreCompletionStatementInput,
): string {
  return [
    RESTORE_STATEMENT_PREFIX,
    `attempt_id=${input.attemptId}`,
    `method_id=${input.methodId}`,
    `method_revision=${input.methodRevision}`,
    `key_epoch=${input.keyEpoch}`,
    `device_id=${input.deviceId}`,
    `sign_public_key=${input.deviceSignPublicKey}`,
    `wrapped_ack_json=${input.wrappedAckJson}`,
    `wrapped_ack_sha256=${input.wrappedAckSha256}`,
  ].join("\n");
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
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

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(utf8(value)));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/// Signs the canonical statement with the account signing key (PKCS8, base64)
/// and returns the base64 signature the platform verifies against the anchor.
export async function signRestoreCompletionStatement(params: {
  accountSigningPrivateKeyPkcs8: string;
  statement: string;
}): Promise<string> {
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
    asBufferSource(utf8(params.statement)),
  );
  return bytesToBase64(new Uint8Array(signature));
}
