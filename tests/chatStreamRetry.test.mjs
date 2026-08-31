import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { subscribeToDurableChatStream } from "../lib/chat/streamSubscription.ts";
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
    undefined,
    { maxAttempts: 2, baseDelayMs: 0, jitterRatio: 0 },
  );

  assert.equal(attempts, 2);
  assert.equal(sentBodies.length, 2);
  assert.strictEqual(sentBodies[0], body);
  assert.strictEqual(sentBodies[1], body);
  assert.equal(sentBodies[0].id, sentBodies[1].id);
});

test("an early SSE EOF reconnects the same attempt from the latest sequence", async () => {
  const sentBodies = [];
  const connectionStates = [];
  let lastSequence;
  let consumeCount = 0;
  const controller = new AbortController();

  await subscribeToDurableChatStream({
    request: {
      id: "input-1",
      attempt_id: "attempt-1",
      message: "hello",
      session_id: "session-1",
    },
    getAfterSequence: () => lastSequence,
    signal: controller.signal,
    onEvent: () => {},
    onConnectionState: (state) => connectionStates.push(state),
    retryOptions: { maxAttempts: 2, baseDelayMs: 0, jitterRatio: 0 },
    transport: {
      create: async (body) => {
        sentBodies.push({ ...body });
        return new Response();
      },
      retry: async () => {
        throw new Error("retry transport should not be used for an initial run");
      },
      consume: async (_response, onEvent) => {
        consumeCount += 1;
        if (consumeCount === 1) {
          lastSequence = 7;
          onEvent({ event: "run_started", data: { run_id: "attempt-1" } });
          return;
        }
        onEvent({ event: "run_completed", data: { run_id: "attempt-1" } });
      },
    },
    isTerminalEvent: (event) => event.event === "run_completed",
  });

  assert.equal(sentBodies.length, 2);
  assert.equal(sentBodies[0].attempt_id, "attempt-1");
  assert.equal(sentBodies[1].attempt_id, "attempt-1");
  assert.equal(sentBodies[0].message, "hello");
  assert.equal(sentBodies[1].message, "hello");
  assert.equal(sentBodies[0].after_sequence, undefined);
  assert.equal(sentBodies[1].after_sequence, 7);
  assert.deepEqual(
    connectionStates.map((state) => state.state),
    ["connected", "reconnecting", "connected"],
  );
  assert.equal(connectionStates[2].reconnected, true);
});

test("retry subscriptions keep one retry identity and never resend the message", async () => {
  const retryCalls = [];
  let consumeCount = 0;
  let lastSequence = 4;

  await subscribeToDurableChatStream({
    request: {
      attempt_id: "retry-attempt-1",
      retry_of_run_id: "failed-run-1",
    },
    getAfterSequence: () => lastSequence,
    signal: new AbortController().signal,
    onEvent: () => {},
    retryOptions: { maxAttempts: 2, baseDelayMs: 0, jitterRatio: 0 },
    transport: {
      create: async () => {
        throw new Error("create transport should not be used for a retry");
      },
      retry: async (runId, body) => {
        retryCalls.push({ runId, body: { ...body } });
        return new Response();
      },
      consume: async (_response, onEvent) => {
        consumeCount += 1;
        if (consumeCount === 1) {
          lastSequence = 9;
          return;
        }
        onEvent({ event: "run_completed", data: { run_id: "retry-attempt-1" } });
      },
    },
    isTerminalEvent: (event) => event.event === "run_completed",
  });

  assert.deepEqual(retryCalls, [
    {
      runId: "failed-run-1",
      body: { attempt_id: "retry-attempt-1", after_sequence: 4 },
    },
    {
      runId: "failed-run-1",
      body: { attempt_id: "retry-attempt-1", after_sequence: 9 },
    },
  ]);
  assert.equal("message" in retryCalls[0].body, false);
});

test("only retryable HTTP statuses reconnect", async () => {
  for (const [status, expectedAttempts] of [
    [400, 1],
    [401, 1],
    [408, 2],
    [429, 2],
    [500, 2],
  ]) {
    let attempts = 0;
    const operation = subscribeToDurableChatStream({
      request: {
        id: `input-${status}`,
        attempt_id: `attempt-${status}`,
        message: "hello",
        session_id: "session-1",
      },
      signal: new AbortController().signal,
      onEvent: () => {},
      retryOptions: { maxAttempts: 2, baseDelayMs: 0, jitterRatio: 0 },
      transport: {
        create: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw Object.assign(new Error("provider error"), { status });
          }
          return new Response();
        },
        retry: async () => {
          throw new Error("unexpected retry transport");
        },
        consume: async (_response, onEvent) => {
          onEvent({ event: "run_completed", data: {} });
        },
      },
      isTerminalEvent: (event) => event.event === "run_completed",
    });

    if (expectedAttempts === 1) {
      await assert.rejects(operation, /provider error/);
    } else {
      await operation;
    }
    assert.equal(attempts, expectedAttempts, `status ${status}`);
  }
});

test("chat requests use UUIDs and route retries through the idempotent stream body", () => {
  const source = readFileSync(new URL("lib/useChatController.ts", ROOT), "utf8");
  const snapshotSource = readFileSync(
    new URL("lib/chatStreamDurability.ts", ROOT),
    "utf8",
  );
  const streamingSource = readFileSync(
    new URL("lib/chat/streaming.ts", ROOT),
    "utf8",
  );

  assert.match(
    source,
    /function generateId\(\): string \{\s*return crypto\.randomUUID\(\);\s*\}/,
  );
  assert.match(
    source,
    /getAfterSequence: \(\) => lastSequenceRef\.current/,
  );
  assert.match(source, /request: streamBody/);
  assert.match(source, /if \(!snapshot\.request\)/);
  assert.match(source, /request: snapshot\.request/);
  assert.match(
    source,
    /getAfterSequence: \(\) =>\s*lastSequenceRef\.current \|\| snapshot\.lastSequence/,
  );
  assert.match(snapshotSource, /request\?: ChatStreamSubscriptionRequest/);
  assert.match(source, /attempt_id: attemptId/);
  assert.match(source, /retry_of_run_id: retryAttempt\.runId/);
  assert.match(streamingSource, /retry: retryChatStream/);
});
