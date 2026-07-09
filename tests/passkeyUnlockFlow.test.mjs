import assert from "node:assert/strict";
import test from "node:test";

import { tryPasskeyUnlockMethods } from "../lib/passkeyUnlockFlow.ts";

test("passkey unlock retry rejects when no local methods exist", async () => {
  await assert.rejects(
    () => tryPasskeyUnlockMethods([], async () => true),
    /No local device unlock method is configured/,
  );
});

test("passkey unlock retry continues after a cancelled assertion", async () => {
  const attempted = [];

  await tryPasskeyUnlockMethods(["stale", "current"], async (method) => {
    attempted.push(method);
    return method === "current";
  });

  assert.deepEqual(attempted, ["stale", "current"]);
});

test("passkey unlock retry stops after the first successful method", async () => {
  const attempted = [];

  await tryPasskeyUnlockMethods(["current", "backup"], async (method) => {
    attempted.push(method);
    return true;
  });

  assert.deepEqual(attempted, ["current"]);
});

test("passkey unlock retry continues after a stale method throws", async () => {
  const attempted = [];

  await tryPasskeyUnlockMethods(["stale", "current"], async (method) => {
    attempted.push(method);
    if (method === "stale") {
      throw new Error("This passkey did not return WebAuthn PRF output.");
    }
    return true;
  });

  assert.deepEqual(attempted, ["stale", "current"]);
});

test("passkey unlock retry returns the last concrete failure when all methods fail", async () => {
  await assert.rejects(
    () =>
      tryPasskeyUnlockMethods(["a", "b"], async (method) => {
        throw new Error(`failed ${method}`);
      }),
    /failed b/,
  );
});

test("passkey unlock retry reports cancelled flow when no method succeeds or throws", async () => {
  await assert.rejects(
    () => tryPasskeyUnlockMethods(["a", "b"], async () => false),
    /Device unlock was cancelled/,
  );
});
