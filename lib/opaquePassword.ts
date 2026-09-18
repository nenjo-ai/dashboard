"use client";

// OPAQUE password factor client (BOO-26 package 5, RFC 9807).
//
// Wraps @serenity-kit/opaque — a WASM build of the same opaque-ke crate the
// platform uses — so the wire formats interop byte-for-byte. Every message is
// exchanged with the platform as a base64-encoded RFC 9807 wire string
// (`?encoding=base64` on the password routes); the export key and the
// password never leave this module.

import * as opaque from "@serenity-kit/opaque";

/// Mirrors MIN_UNLOCK_PASSPHRASE_LENGTH (lib/cryptoStoragePolicy). Kept local
/// so this module stays dependency-free and unit-testable in Node, like
/// lib/recoveryEnvelope.ts.
const MIN_UNLOCK_PASSPHRASE_LENGTH = 16;

/** Frozen Argon2id KSF profile, must match the platform's advertised name. */
export const OPAQUE_KSF_PROFILE = "argon2id-m64-t3-p4-v1";

/// 64 MiB / 3 passes / 4 lanes — matches the platform's frozen profile.
export const KSF_CONFIG = {
  keyStretching: {
    "argon2id-custom": { memory: 65536, iterations: 3, parallelism: 4 },
  },
} as const;

export const MAX_RECOVERY_PASSWORD_LENGTH = 1024;

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

/// Password policy for the account-recovery password factor. Mirrors the
/// local unlock passphrase minimum; the workspace password itself is never
/// stored or transmitted — only its OPAQUE registration is.
export function validateRecoveryPassword(
  password: string,
): PasswordPolicyResult {
  const normalized = password.trim();
  if (normalized.length < MIN_UNLOCK_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      reason: `Use a password or passphrase with at least ${MIN_UNLOCK_PASSPHRASE_LENGTH} characters.`,
    };
  }
  if (normalized.length > MAX_RECOVERY_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Use at most ${MAX_RECOVERY_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true };
}

async function ensureReady(): Promise<void> {
  await opaque.ready;
}

export interface PasswordRegistrationResult {
  registrationId: string;
  ksfProfile: string;
  /** Client-only OPAQUE export key (base64, 64 bytes). Never sent to the server. */
  exportKey: string;
}

/// Runs the two-round-trip OPAQUE registration against
/// /recovery-methods/password/register/{start,finish}.
export async function registerRecoveryPassword(params: {
  password: string;
  post: <T>(path: string, body: unknown) => Promise<T>;
}): Promise<PasswordRegistrationResult> {
  await ensureReady();
  const start = opaque.client.startRegistration({ password: params.password });
  const startResponse = await params.post<{
    response: string;
  }>("/recovery-methods/password/register/start?encoding=base64", {
    request: start.registrationRequest,
  });
  const finish = opaque.client.finishRegistration({
    clientRegistrationState: start.clientRegistrationState,
    registrationResponse: startResponse.response,
    password: params.password,
    ...KSF_CONFIG,
  });
  if (!finish) {
    throw new Error("OPAQUE registration failed.");
  }
  const finishResponse = await params.post<{
    registration_id: string;
    ksf_profile: string;
  }>("/recovery-methods/password/register/finish", {
    upload: finish.registrationRecord,
  });
  return {
    registrationId: finishResponse.registration_id,
    ksfProfile: finishResponse.ksf_profile,
    exportKey: finish.exportKey,
  };
}

export interface PasswordLoginResult {
  verified: boolean;
  /** Client-only OPAQUE export key (base64, 64 bytes). Never sent to the server. */
  exportKey: string;
}

/// Runs the stateful OPAQUE login against
/// /recovery-methods/password/login/{start,finish}. A wrong password or a
/// consumed attempt fails closed server-side.
export async function loginRecoveryPassword(params: {
  password: string;
  /// Optional restore-attempt binding: a successful login marks the attempt
  /// factor-verified so the recovery envelope can be released.
  binding?: { attempt_id: string; method_id: string };
  post: <T>(path: string, body: unknown) => Promise<T>;
}): Promise<PasswordLoginResult> {
  await ensureReady();
  const start = opaque.client.startLogin({ password: params.password });
  const startResponse = await params.post<{
    login_id: string;
    response: string;
  }>("/recovery-methods/password/login/start?encoding=base64", {
    request: start.startLoginRequest,
    attempt_id: params.binding?.attempt_id,
    method_id: params.binding?.method_id,
  });
  const finish = opaque.client.finishLogin({
    clientLoginState: start.clientLoginState,
    loginResponse: startResponse.response,
    password: params.password,
    ...KSF_CONFIG,
  });
  if (!finish) {
    throw new Error("Password verification failed.");
  }
  const finishResponse = await params.post<{ verified: boolean }>(
    "/recovery-methods/password/login/finish",
    {
      login_id: startResponse.login_id,
      finalization: finish.finishLoginRequest,
    },
  );
  return {
    verified: finishResponse.verified,
    exportKey: finish.exportKey,
  };
}

/// Decodes a base64 export key into the raw bytes used as the recovery
/// envelope wrap secret (HKDF input). 64 bytes for ristretto255/Sha512.
export function exportKeyToBytes(exportKey: string): Uint8Array {
  const binary = atob(exportKey);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  if (out.length !== 64) {
    throw new Error("Unexpected OPAQUE export key length.");
  }
  return out;
}
