"use client";

// Browser harness for the BOO-26 account recovery crypto chain.
//
// Runs the real browser code paths (WebAuthn PRF via a virtual authenticator,
// WebCrypto HKDF/AES-GCM envelope, Ed25519 completion signing) and reports
// pass/fail through data attributes consumed by the Playwright suite. The
// backend-facing enrollment/restore ceremony needs a live platform session
// and is covered by the API integration tests plus the package-8 real-device
// matrix; this harness proves the browser-side chain end to end.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  assertWithCeremony,
  createPasskeyWithCeremony,
} from "@/lib/webauthnCeremony";
import {
  decodeAndValidateRecoveryPayload,
  openRecoveryEnvelope,
  sealRecoveryEnvelope,
  type AccountRecoveryPayload,
} from "@/lib/recoveryEnvelope";
import { bytesToBase64Url } from "@/lib/webauthnCeremony";
import {
  hasLocalSecretVault,
  listLocalPasskeyUnlockMethods,
  loadStoredAccountContentKey,
  resetLocalEncryptedWorkspaceForRestore,
  unlockWithPasskeyPrf,
} from "@/lib/cryptoContent";
import { restoreWithPasskeyRecoveryMethod } from "@/lib/recoveryMethods";
import {
  buildRestoreCompletionStatement,
  signRestoreCompletionStatement,
} from "@/lib/recoveryStatement";

type HarnessStatus = "pending" | "running" | "passed" | "failed";

type HarnessResult = {
  name: string;
  status: HarnessStatus;
  detail?: string;
};

type HarnessTest = {
  name: string;
  run: () => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await action();
    throw new Error(message);
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      throw error;
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const BINDING = {
  methodType: "passkey_prf",
  factorReference: "2c3b1d4e-2222-4333-9444-b555c666d777",
  keyEpoch: 1,
};

function samplePayload(): AccountRecoveryPayload {
  return {
    version: 1,
    account_content_key: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
    account_signing_private_key_pkcs8: bytesToBase64(
      crypto.getRandomValues(new Uint8Array(48)),
    ),
    account_signing_public_key: bytesToBase64(
      crypto.getRandomValues(new Uint8Array(32)),
    ),
    created_at: new Date().toISOString(),
  };
}

let cachedPrfOutput: Promise<Uint8Array> | null = null;

function sharedPrfOutput(): Promise<Uint8Array> {
  if (!cachedPrfOutput) {
    cachedPrfOutput = prfOutputFromVirtualAuthenticator().catch((error) => {
      cachedPrfOutput = null;
      throw error;
    });
  }
  return cachedPrfOutput;
}

async function prfOutputFromVirtualAuthenticator(): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const creation = await createPasskeyWithCeremony({
    publicKey: {
      challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
      rp: { name: "Nenjo Recovery Harness", id: window.location.hostname },
      user: {
        id: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
        name: "recovery-harness@example.com",
        displayName: "Recovery Harness",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      extensions: {
        prf: { eval: { first: bytesToBase64(salt) } },
      },
    },
  });

  const assertion = await assertWithCeremony({
    options: {
      publicKey: {
        challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
        rpId: window.location.hostname,
        userVerification: "required",
        extensions: {
          prf: { eval: { first: bytesToBase64(salt) } },
        },
      },
    },
    prfSalt: salt,
  });
  void assertion.responseJson;
  const prfOutput = assertion.prfOutput;
  assert(prfOutput && prfOutput.length === 32, "PRF output was absent or not 32 bytes.");
  return prfOutput;
}

export function RecoveryUnlockHarnessClient() {
  const searchParams = useSearchParams();
  const autoRun = searchParams.get("run") === "1";
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<HarnessResult[]>([]);

  const tests = useMemo<HarnessTest[]>(
    () => [
      {
        name: "Browser exposes a secure WebCrypto context",
        run: async () => {
          assert(window.isSecureContext, "Harness must run in a secure browser context.");
          assert(crypto.subtle, "WebCrypto subtle API is unavailable.");
        },
      },
      {
        name: "Virtual authenticator passkey returns 32-byte PRF output",
        run: async () => {
          await prfOutputFromVirtualAuthenticator();
        },
      },
      {
        name: "Recovery envelope round-trips with the PRF output as wrap secret",
        run: async () => {
          const wrapSecret = await sharedPrfOutput();
          const payload = samplePayload();
          const { blob, cryptoHeader } = await sealRecoveryEnvelope({
            payload,
            wrapSecret,
            binding: BINDING,
          });
          assert(cryptoHeader.alg === "a256gcm", "Envelope header algorithm mismatch.");
          const opened = await openRecoveryEnvelope({
            blob,
            wrapSecret,
            binding: BINDING,
          });
          assert(
            opened.account_content_key === payload.account_content_key,
            "Envelope round-trip changed the account content key.",
          );
        },
      },
      {
        name: "Tampered envelope fails closed",
        run: async () => {
          const wrapSecret = await sharedPrfOutput();
          const { blob } = await sealRecoveryEnvelope({
            payload: samplePayload(),
            wrapSecret,
            binding: BINDING,
          });
          const tampered = JSON.parse(JSON.stringify(blob)) as typeof blob;
          const raw = base64ToBytes(tampered.ciphertext);
          raw[4] = raw[4] ^ 0xff;
          tampered.ciphertext = bytesToBase64(raw);
          await assertRejects(
            () => openRecoveryEnvelope({ blob: tampered, wrapSecret, binding: BINDING }),
            "Tampered envelope decrypted; AEAD authentication did not fail closed.",
          );
        },
      },
      {
        name: "Wrong AAD binding fails closed",
        run: async () => {
          const wrapSecret = await sharedPrfOutput();
          const { blob } = await sealRecoveryEnvelope({
            payload: samplePayload(),
            wrapSecret,
            binding: BINDING,
          });
          await assertRejects(
            () =>
              openRecoveryEnvelope({
                blob,
                wrapSecret,
                binding: { ...BINDING, keyEpoch: 2 },
              }),
            "Envelope opened under a different key epoch; AAD binding is not enforced.",
          );
        },
      },
      {
        name: "Completion statement signs and verifies in-browser (Ed25519)",
        run: async () => {
          const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
            "sign",
            "verify",
          ]);
          if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
            throw new Error("Browser did not return an Ed25519 key pair.");
          }
          const privateKeyPkcs8 = await crypto.subtle.exportKey(
            "pkcs8",
            keyPair.privateKey,
          );
          const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
          const wrappedAckJson =
            '{"key_version":1,"algorithm":"x25519-hkdf-sha256-aes-256-gcm","ephemeral_public_key":"dGVzdC1lcGhlbWVyYWw","nonce":"dGVzdC1ub25jZQ","ciphertext":"dGVzdC1jaXBoZXJ0ZXh0","created_at":"2026-09-12T00:00:00.000Z"}';
          const statement = buildRestoreCompletionStatement({
            attemptId: "1b2a0c3d-1111-4222-8333-a444b555c666",
            methodId: "2c3b1d4e-2222-4333-9444-b555c666d777",
            methodRevision: 2,
            keyEpoch: 1,
            deviceId: "3d4c2e5f-3333-5444-a555-c666d777e888",
            deviceSignPublicKey: bytesToBase64(new Uint8Array(publicKeyRaw)),
            wrappedAckJson,
            wrappedAckSha256:
              "fixture-sha256-is-verified-by-node-tests",
          });
          const signature = await signRestoreCompletionStatement({
            accountSigningPrivateKeyPkcs8: bytesToBase64(
              new Uint8Array(privateKeyPkcs8),
            ),
            statement,
          });
          const verified = await crypto.subtle.verify(
            "Ed25519",
            keyPair.publicKey,
            base64ToBytes(signature) as unknown as BufferSource,
            new TextEncoder().encode(statement) as unknown as BufferSource,
          );
          assert(verified, "Ed25519 signature did not verify.");
        },
      },
      {
        name: "Strict payload validation rejects unexpected fields",
        run: async () => {
          const payload = samplePayload();
          decodeAndValidateRecoveryPayload(payload);
          await assertRejects(
            async () =>
              decodeAndValidateRecoveryPayload({ ...payload, extra_field: true }),
            "Expected strict-schema rejection of unexpected fields.",
          );
        },
      },
      {
        name: "Full restore recreates the local vault unlock (wiped storage)",
        run: async () => {
          const accountId = "harness-recovery-account";
          const knownAck = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));

          // Real passkey ceremony for the PRF secret.
          const salt = crypto.getRandomValues(new Uint8Array(32));
          const creation = await createPasskeyWithCeremony({
            publicKey: {
              challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
              rp: { name: "Nenjo Recovery Harness", id: window.location.hostname },
              user: {
                id: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
                name: "recovery-harness@example.com",
                displayName: "Recovery Harness",
              },
              pubKeyCredParams: [
                { type: "public-key", alg: -7 },
                { type: "public-key", alg: -257 },
              ],
              authenticatorSelection: {
                residentKey: "required",
                requireResidentKey: true,
                userVerification: "required",
              },
              extensions: { prf: { eval: { first: bytesToBase64(salt) } } },
            },
          });
          const assertion = await assertWithCeremony({
            options: {
              publicKey: {
                challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
                rpId: window.location.hostname,
                userVerification: "required",
                allowCredentials: [
                  { type: "public-key", id: creation.credentialId },
                ],
                extensions: { prf: { eval: { first: bytesToBase64(salt) } } },
              },
            },
            prfSalt: salt,
          });
          const prfOutput = assertion.prfOutput;
          assert(prfOutput, "PRF output required for the restore flow test.");

          // Real Ed25519 account signing key for the payload.
          const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
            "sign",
            "verify",
          ]);
          if (!("privateKey" in keyPair) || !("publicKey" in keyPair)) {
            throw new Error("Browser did not return an Ed25519 key pair.");
          }
          const privateKeyPkcs8 = bytesToBase64(
            new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)),
          );
          const publicKeyRaw = bytesToBase64(
            new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)),
          );
          const payload: AccountRecoveryPayload = {
            version: 1,
            account_content_key: knownAck,
            account_signing_private_key_pkcs8: privateKeyPkcs8,
            account_signing_public_key: publicKeyRaw,
            created_at: new Date().toISOString(),
          };

          // Server-side method record as the dashboard would see it.
          const binding = {
            methodType: "passkey_prf",
            factorReference: "00000000-0000-4000-8000-000000000001",
            keyEpoch: 1,
          };
          const { blob, cryptoHeader } = await sealRecoveryEnvelope({
            payload,
            wrapSecret: prfOutput,
            binding,
          });
          const method = {
            id: "00000000-0000-4000-8000-000000000002",
            method_type: "passkey_prf",
            state: "active",
            revision: 2,
            key_epoch: 1,
            crypto_header: cryptoHeader,
            factor_reference: binding.factorReference,
            metadata: {
              prf_input: bytesToBase64Url(salt),
              prf_credential_id: creation.credentialId,
            },
            created_at: new Date().toISOString(),
            activated_at: new Date().toISOString(),
          };

          // Wipe local state first: restore must rebuild everything.
          await resetLocalEncryptedWorkspaceForRestore();
          assert(
            !(await hasLocalSecretVault()),
            "Vault should be wiped before the restore flow runs.",
          );

          // Stub the recovery endpoints; everything else uses real fetch.
          const envelopeResponse = {
            method_id: method.id,
            method_type: method.method_type,
            state: method.state,
            revision: method.revision,
            key_epoch: method.key_epoch,
            crypto_header: cryptoHeader,
            ciphertext: JSON.stringify(blob),
          };
          const originalFetch = window.fetch.bind(window);
          window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            const responseBody = (() => {
              if (url.includes("/recovery-methods/anchor")) {
                return { established: true, key_epoch: 1 };
              }
              if (url.includes("/restore/start")) {
                return {
                  attempt_id: "00000000-0000-4000-8000-000000000003",
                  challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
                  purpose: "restore",
                  key_epoch: 1,
                  expires_at: new Date(Date.now() + 300000).toISOString(),
                };
              }
              if (url.includes("/restore/envelope")) {
                return envelopeResponse;
              }
              if (url.includes("/passkey/assertion-options")) {
                let credentialId: string | undefined;
                try {
                  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
                  credentialId = body?.credential_id;
                } catch {
                  // ignore malformed stub input
                }
                return {
                  ceremony_id: "00000000-0000-4000-8000-000000000005",
                  publicKey: {
                    challenge: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
                    rpId: window.location.hostname,
                    userVerification: "required",
                    ...(credentialId
                      ? {
                          allowCredentials: [
                            { type: "public-key", id: credentialId },
                          ],
                        }
                      : {}),
                  },
                };
              }
              if (url.includes("/passkey/assert")) {
                return {
                  credential_id: "stub-credential",
                  credential_row_id: "00000000-0000-4000-8000-000000000001",
                };
              }
              if (url.includes("/restore/complete")) {
                return { status: "completed", device_id: "00000000-0000-4000-8000-000000000004" };
              }
              return undefined;
            })();
            if (responseBody === undefined) {
              return originalFetch(input, init);
            }
            return new Response(JSON.stringify(responseBody), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          };
          try {
            await restoreWithPasskeyRecoveryMethod(method, { accountId });
          } finally {
            window.fetch = originalFetch;
          }

          // The restored browser state must be complete: keys, vault config,
          // and a working local unlock record.
          assert(
            await hasLocalSecretVault(),
            "Restore must recreate the local vault (vault config enabled), otherwise unlock/restore gating loops.",
          );
          assert(
            (await loadStoredAccountContentKey()) === knownAck,
            "Restored account content key does not match the envelope payload.",
          );
          const localMethods = await listLocalPasskeyUnlockMethods(accountId);
          assert(
            localMethods.some((entry) => entry.credential_id === creation.credentialId),
            "Restore must recreate the local passkey unlock record for the same credential.",
          );
          await unlockWithPasskeyPrf({
            credentialId: creation.credentialId,
            prfOutput,
            accountId,
          });
        },
      },
    ],
    [],
  );

  const runHarness = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const collected: HarnessResult[] = [];
    for (const harnessTest of tests) {
      try {
        await harnessTest.run();
        collected.push({ name: harnessTest.name, status: "passed" });
      } catch (error) {
        collected.push({
          name: harnessTest.name,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      setResults([...collected]);
    }
    setRunning(false);
  }, [tests]);

  useEffect(() => {
    if (autoRun && results.length === 0 && !running) {
      const timer = window.setTimeout(() => {
        void runHarness();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [autoRun, results.length, runHarness, running]);

  const failed = results.find((result) => result.status === "failed");
  const passedCount = results.filter((result) => result.status === "passed").length;
  const complete = results.length > 0 && !running && !failed && passedCount === tests.length;

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-8 text-gray-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Development Harness
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Account Recovery Browser Harness</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Runs the real browser recovery crypto chain: WebAuthn PRF via a
            virtual authenticator, HKDF/AES-GCM recovery envelopes with AAD
            binding, and Ed25519 completion signing. Requires a virtual
            authenticator with PRF (Chromium CDP) and an isolated localhost
            port.
          </p>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={() => void runHarness()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Harness"}
        </button>

        <div
          id="recovery-harness-status"
          data-status={failed ? "failed" : complete ? "passed" : running ? "running" : "idle"}
          data-passed={passedCount}
          data-total={tests.length}
          className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm"
        >
          {failed
            ? `Failed: ${failed.name}`
            : complete
              ? `Passed ${passedCount}/${tests.length}`
              : running
                ? `Running ${passedCount}/${tests.length}`
                : "Idle"}
        </div>

        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.name}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
              data-test-status={result.status}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{result.name}</p>
                <span className="text-xs uppercase tracking-[0.14em] text-gray-400">
                  {result.status}
                </span>
              </div>
              {result.detail ? (
                <p className="mt-2 text-sm text-red-300">{result.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
