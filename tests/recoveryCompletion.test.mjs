import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRestoreCompletionStatement,
  signRestoreCompletionStatement,
  sha256Hex,
} from "../lib/recoveryStatement.ts";
import {
  decodeAndValidateRecoveryPayload,
  openRecoveryEnvelope,
  recoveryAad,
  sealRecoveryEnvelope,
} from "../lib/recoveryEnvelope.ts";

const FIXTURE_PATH = new URL(
  "./fixtures/recovery_completion_vector.json",
  import.meta.url,
);

test("restore completion statement matches the shared platform fixture", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));

  const statement = buildRestoreCompletionStatement({
    attemptId: fixture.attempt_id,
    methodId: fixture.method_id,
    methodRevision: fixture.method_revision,
    keyEpoch: fixture.key_epoch,
    deviceId: fixture.device_id,
    deviceSignPublicKey: fixture.device_sign_public_key,
    wrappedAckJson: fixture.wrapped_ack_json,
    wrappedAckSha256: fixture.wrapped_ack_sha256,
  });

  assert.equal(statement, fixture.expected_statement);
});

test("WebCrypto Ed25519 signature verifies against the platform fixture", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));

  const signature = await signRestoreCompletionStatement({
    accountSigningPrivateKeyPkcs8:
      fixture.test_only.account_signing_private_key_pkcs8_base64,
    statement: fixture.expected_statement,
  });

  assert.equal(signature, fixture.signature_base64);
});

test("statement digest covers the wrapped ACK payload", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  assert.equal(await sha256Hex(fixture.wrapped_ack_json), fixture.wrapped_ack_sha256);
});

function samplePayload() {
  return {
    version: 1,
    account_content_key: "dGVzdC1hY2stYmFzZTY0",
    account_signing_private_key_pkcs8: "dGVzdC1zaWduaW5nLXByaXZhdGUta2V5",
    account_signing_public_key: "dGVzdC1zaWduaW5nLXB1YmxpYy1rZXk",
    created_at: "2026-09-12T00:00:00.000Z",
  };
}

const BINDING = {
  methodType: "passkey_prf",
  factorReference: "2c3b1d4e-2222-4333-9444-b555c666d777",
  keyEpoch: 1,
};

test("recovery envelope round-trips through seal/open", async () => {
  const payload = samplePayload();
  const wrapSecret = new Uint8Array(32).fill(7);

  const { blob, cryptoHeader } = await sealRecoveryEnvelope({
    payload,
    wrapSecret,
    binding: BINDING,
  });

  assert.equal(blob.v, 1);
  assert.equal(blob.alg, "a256gcm");
  assert.equal(blob.kdf, "hkdf-sha256");
  assert.equal(cryptoHeader.aad_fields.join(","), "method_type,factor_reference,key_epoch");

  const opened = await openRecoveryEnvelope({ blob, wrapSecret, binding: BINDING });
  assert.deepEqual(opened, payload);
});

test("recovery envelope fails closed on a tampered ciphertext", async () => {
  const { blob } = await sealRecoveryEnvelope({
    payload: samplePayload(),
    wrapSecret: new Uint8Array(32).fill(7),
    binding: BINDING,
  });
  const tampered = JSON.parse(JSON.stringify(blob));
  const raw = atob(tampered.ciphertext);
  tampered.ciphertext = btoa(
    raw.slice(0, 4) + String.fromCharCode(raw.charCodeAt(4) ^ 0xff) + raw.slice(5),
  );

  await assert.rejects(
    () =>
      openRecoveryEnvelope({
        blob: tampered,
        wrapSecret: new Uint8Array(32).fill(7),
        binding: BINDING,
      }),
    /failed authentication/,
  );
});

test("recovery envelope fails closed when the AAD binding differs", async () => {
  const { blob } = await sealRecoveryEnvelope({
    payload: samplePayload(),
    wrapSecret: new Uint8Array(32).fill(7),
    binding: BINDING,
  });

  await assert.rejects(
    () =>
      openRecoveryEnvelope({
        blob,
        wrapSecret: new Uint8Array(32).fill(7),
        binding: { ...BINDING, keyEpoch: 2 },
      }),
    /failed authentication/,
  );
  await assert.rejects(
    () =>
      openRecoveryEnvelope({
        blob,
        wrapSecret: new Uint8Array(32).fill(7),
        binding: { ...BINDING, factorReference: "00000000-0000-4000-8000-000000000000" },
      }),
    /failed authentication/,
  );
});

test("recovery envelope rejects an unknown format version", async () => {
  await assert.rejects(
    () =>
      openRecoveryEnvelope({
        blob: {
          v: 2,
          alg: "a256gcm",
          kdf: "hkdf-sha256",
          hkdf_salt: "AAAA",
          nonce: "AAAA",
          ciphertext: "AAAA",
        },
        wrapSecret: new Uint8Array(32),
        binding: BINDING,
      }),
    /Unsupported recovery envelope format/,
  );
});

test("recovery payload validation enforces the strict schema", () => {
  assert.deepEqual(decodeAndValidateRecoveryPayload(samplePayload()), samplePayload());

  assert.throws(
    () => decodeAndValidateRecoveryPayload({ version: 2 }),
    /Unsupported recovery payload version/,
  );
  assert.throws(
    () => decodeAndValidateRecoveryPayload({ ...samplePayload(), account_content_key: "" }),
    /missing account_content_key/,
  );
  assert.throws(
    () => decodeAndValidateRecoveryPayload({ ...samplePayload(), extra_field: true }),
    /Unexpected field in recovery payload: extra_field/,
  );
  assert.throws(() => decodeAndValidateRecoveryPayload("flat"), /Invalid recovery payload/);
});

test("AAD binding is deterministic and factor-specific", () => {
  const a = Buffer.from(recoveryAad(BINDING)).toString("utf8");
  const b = Buffer.from(recoveryAad(BINDING)).toString("utf8");
  assert.equal(a, b);
  assert.ok(a.startsWith("nenjo-account-recovery-envelope:v1|account-recovery|passkey_prf|"));
  assert.ok(a.endsWith("|1"));
  assert.notEqual(
    a,
    Buffer.from(recoveryAad({ ...BINDING, methodType: "password_opaque" })).toString("utf8"),
  );
});
