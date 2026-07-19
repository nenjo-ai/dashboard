import assert from "node:assert/strict";
import test from "node:test";

import { reduceRunTrace } from "../lib/agentRunTrace/reducer.ts";

import {
  assistantActivityInputMessageId,
  createSerialChatWorkQueue,
  isVoiceInputDisabled,
  lifecycleRunIdentity,
  lifecycleTraceBase,
  resolveAssistantMessageIdentity,
  retainedLiveChatRunTrace,
  shouldShowChatCancelControl,
  shouldShowLiveToolPreview,
  visibleLiveChatRunTrace,
} from "../lib/chatInterfaceState.ts";

test("voice input availability does not depend on an agent model assignment", () => {
  assert.equal(
    isVoiceInputDisabled({
      voiceInputAvailable: true,
      hasSession: true,
      isAgentTarget: true,
      isDomainPending: false,
      hasActiveTurn: false,
      hasPendingCommand: false,
      hasPendingDomain: false,
    }),
    false,
  );
});

test("voice input remains disabled by chat and browser constraints", () => {
  const available = {
    voiceInputAvailable: true,
    hasSession: true,
    isAgentTarget: true,
    isDomainPending: false,
    hasActiveTurn: false,
    hasPendingCommand: false,
    hasPendingDomain: false,
  };

  for (const constraint of [
    { voiceInputAvailable: false },
    { hasSession: false },
    { isAgentTarget: false },
    { isDomainPending: true },
    { hasActiveTurn: true },
    { hasPendingCommand: true },
    { hasPendingDomain: true },
  ]) {
    assert.equal(
      isVoiceInputDisabled({ ...available, ...constraint }),
      true,
    );
  }
});

test("assistant activity hydrates through its durable input message", () => {
  assert.equal(
    assistantActivityInputMessageId({
      role: "assistant",
      replyToMessageId: "input-message",
    }),
    "input-message",
  );
  assert.equal(
    assistantActivityInputMessageId({
      role: "user",
      replyToMessageId: "input-message",
    }),
    undefined,
  );
});

test("completed assistant messages retain the worker-owned persisted UUID", () => {
  assert.deepEqual(
    resolveAssistantMessageIdentity({
      localResponseId: "temporary-response",
      workerMessageId: "durable-worker-message",
      fallbackId: "fallback",
    }),
    {
      renderId: "temporary-response",
      persistedId: "durable-worker-message",
    },
  );
});

test("plaintext assistant messages fall back to their rendered identity", () => {
  assert.deepEqual(
    resolveAssistantMessageIdentity({
      fallbackId: "fallback",
    }),
    {
      renderId: "fallback",
      persistedId: undefined,
    },
  );
});

test("chat stream work remains ordered and drain waits for final attachment", async () => {
  const order = [];
  const queue = createSerialChatWorkQueue((error) => {
    throw error;
  });

  queue.enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push("lifecycle");
  });
  queue.enqueue(async () => {
    order.push("envelope-linked");
  });

  assert.deepEqual(order, []);
  await queue.drain();
  assert.deepEqual(order, ["lifecycle", "envelope-linked"]);
});

test("chat stream work continues after one malformed event", async () => {
  const errors = [];
  const order = [];
  const queue = createSerialChatWorkQueue((error) => errors.push(error));

  queue.enqueue(() => {
    throw new Error("malformed event");
  });
  queue.enqueue(() => {
    order.push("finalized");
  });

  await queue.drain();
  assert.equal(errors.length, 1);
  assert.deepEqual(order, ["finalized"]);
});

function runningToolTrace() {
  return {
    id: "run-1",
    sessionId: "session-1",
    source: "chat",
    phase: "executing_tools",
    startedAt: "2026-01-01T00:00:00.000Z",
    spans: [
      {
        kind: "tool",
        id: "tool-1",
        status: "running",
        name: "inspect_operations",
        startedAt: "2026-01-01T00:00:01.000Z",
      },
    ],
  };
}

function completedTrace() {
  return {
    ...runningToolTrace(),
    phase: "completed",
    completedAt: "2026-01-01T00:00:02.000Z",
    spans: [
      {
        ...runningToolTrace().spans[0],
        status: "completed",
        completedAt: "2026-01-01T00:00:02.000Z",
      },
    ],
  };
}

test("chat interface shows live tool preview while a tool trace is active", () => {
  const trace = runningToolTrace();

  assert.equal(visibleLiveChatRunTrace(trace), trace);
  assert.equal(shouldShowLiveToolPreview(trace), true);
  assert.equal(
    shouldShowChatCancelControl({ isTyping: false, activeRunTrace: trace }),
    true,
  );
});

test("chat interface hides live preview and cancel control after terminal completion", () => {
  const trace = completedTrace();

  assert.equal(visibleLiveChatRunTrace(trace), undefined);
  assert.equal(shouldShowLiveToolPreview(trace), false);
  assert.equal(
    shouldShowChatCancelControl({ isTyping: false, activeRunTrace: trace }),
    false,
  );
});

test("terminal run trace suppresses stale typing cancel control", () => {
  assert.equal(
    shouldShowChatCancelControl({
      isTyping: true,
      activeRunTrace: completedTrace(),
    }),
    false,
  );
});

test("chat interface still shows cancel while awaiting first stream event", () => {
  assert.equal(
    shouldShowChatCancelControl({
      isTyping: true,
      activeRunTrace: undefined,
    }),
    true,
  );
});

test("suppressed or finalized traces are not retained as live work", () => {
  const trace = runningToolTrace();

  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: true,
      finalized: false,
    }),
    undefined,
  );
  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: false,
      finalized: true,
    }),
    undefined,
  );
  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: false,
      finalized: false,
    }),
    trace,
  );
});

test("trailing completion events reuse the last trace from the same run", () => {
  const lastTrace = runningToolTrace();
  const base = lifecycleTraceBase({
    activeTrace: undefined,
    lastTrace,
    eventRunId: "run-1",
  });
  const completed = reduceRunTrace(
    base,
    {
      event_type: "RunCompleted",
      data: { run_id: "run-1", session_id: "session-1" },
    },
    { now: "2026-01-01T00:00:02.000Z" },
  );

  assert.equal(base, lastTrace);
  assert.equal(completed?.phase, "completed");
  assert.equal(completed?.spans.length, 1);
  assert.equal(completed?.spans[0].name, "inspect_operations");
  assert.equal(
    lifecycleTraceBase({
      activeTrace: undefined,
      lastTrace,
      eventRunId: "run-2",
    }),
    undefined,
  );
});

test("chat lifecycle identity falls back to the trace or request without run_id", () => {
  assert.equal(
    lifecycleRunIdentity(undefined, undefined, "trace-run", "request-run"),
    "trace-run",
  );
  assert.equal(
    lifecycleRunIdentity(undefined, undefined, undefined, "request-run"),
    "request-run",
  );
});
