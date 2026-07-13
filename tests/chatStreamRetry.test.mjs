import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { consumeChatStreamWithRetry } from "../lib/chatStreamRetry.ts";

const ROOT = new URL("..", import.meta.url);

test("chat stream retry reuses the original request body", async () => {
  const body = { id: "79fd0e03-c8f7-4b0d-9b54-03ae9b8e91cf", message: "hello" };
  const sentBodies = [];
  let attempts = 0;

  await consumeChatStreamWithRetry(
    async () => {
      attempts += 1;
      sentBodies.push(body);
      return new Response();
    },
    async () => {
      if (attempts === 1) {
        throw new TypeError("stream connection dropped");
      }
    },
  );

  assert.equal(attempts, 2);
  assert.equal(sentBodies.length, 2);
  assert.strictEqual(sentBodies[0], body);
  assert.strictEqual(sentBodies[1], body);
  assert.equal(sentBodies[0].id, sentBodies[1].id);
});

test("chat requests use UUIDs and route retries through the idempotent stream body", () => {
  const source = readFileSync(new URL("lib/usePlannerChat.ts", ROOT), "utf8");
  const snapshotSource = readFileSync(
    new URL("lib/chatStreamDurability.ts", ROOT),
    "utf8",
  );

  assert.match(source, /function generateId\(\): string \{\s*return crypto\.randomUUID\(\);\s*\}/);
  assert.match(source, /\(\) => createChatStream\(streamBody, controller\.signal\)/);
  assert.match(source, /consumeChatStreamWithRetry\(/);
  assert.match(source, /request: streamBody/);
  assert.match(source, /if \(!snapshot\.request\)/);
  assert.match(
    source,
    /\(\) => createChatStream\(snapshot\.request!, restoreController!\.signal\)/,
  );
  assert.match(snapshotSource, /request\?: ChatStreamRequest/);
});
