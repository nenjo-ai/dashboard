import assert from "node:assert/strict";
import test from "node:test";

import { commitPasskeyUnlockRegistration } from "../lib/passkeyRegistrationCommit.ts";

test("passkey registration commits remote before local setup", async () => {
  const events = [];

  const registered = await commitPasskeyUnlockRegistration({
    registerRemote: async () => {
      events.push("remote");
      return { id: "remote-1" };
    },
    setupLocal: async (record) => {
      events.push(`local:${record.id}`);
    },
    revokeRemote: async (record) => {
      events.push(`revoke:${record.id}`);
    },
  });

  assert.deepEqual(registered, { id: "remote-1" });
  assert.deepEqual(events, ["remote", "local:remote-1"]);
});

test("passkey registration does not create local unlock when remote registration fails", async () => {
  const events = [];

  await assert.rejects(
    () =>
      commitPasskeyUnlockRegistration({
        registerRemote: async () => {
          events.push("remote");
          throw new Error("registration rejected");
        },
        setupLocal: async () => {
          events.push("local");
        },
        revokeRemote: async () => {
          events.push("revoke");
        },
      }),
    /registration rejected/,
  );

  assert.deepEqual(events, ["remote"]);
});

test("passkey registration revokes remote credential when local setup fails", async () => {
  const events = [];

  await assert.rejects(
    () =>
      commitPasskeyUnlockRegistration({
        registerRemote: async () => {
          events.push("remote");
          return { id: "remote-1" };
        },
        setupLocal: async (record) => {
          events.push(`local:${record.id}`);
          throw new Error("vault migration failed");
        },
        revokeRemote: async (record) => {
          events.push(`revoke:${record.id}`);
        },
      }),
    /vault migration failed/,
  );

  assert.deepEqual(events, ["remote", "local:remote-1", "revoke:remote-1"]);
});

test("passkey registration preserves local setup error when remote revoke also fails", async () => {
  const events = [];

  await assert.rejects(
    () =>
      commitPasskeyUnlockRegistration({
        registerRemote: async () => {
          events.push("remote");
          return { id: "remote-1" };
        },
        setupLocal: async () => {
          events.push("local");
          throw new Error("local failed");
        },
        revokeRemote: async () => {
          events.push("revoke");
          throw new Error("revoke failed");
        },
      }),
    /local failed/,
  );

  assert.deepEqual(events, ["remote", "local", "revoke"]);
});
