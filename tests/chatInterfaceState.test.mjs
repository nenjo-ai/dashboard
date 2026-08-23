import assert from "node:assert/strict";
import test from "node:test";

import { reduceRunTrace } from "../lib/agentRunTrace/reducer.ts";

import {
  assistantActivityInputMessageId,
  clearSnapshotAppliesToResponse,
  compactDuplicateChatMessages,
  createSerialChatWorkQueue,
  isVoiceInputDisabled,
  lifecycleRunIdentity,
  lifecycleTraceBase,
  preferredChatRunTrace,
  resolveAssistantMessageIdentity,
  retainedLiveChatRunTrace,
  scheduledDraftBelongsToResponse,
  settledAssistantActivityTrace,
  shouldShowChatHistoryLoader,
  shouldShowChatRunStatusNotice,
  shouldPersistChatActivityEvent,
  shouldShowChatCancelControl,
  shouldShowLiveToolPreview,
  upsertLiveAssistantDraft,
  visibleLiveAssistantContent,
  visibleLiveChatRunTrace,
  withLiveChatActivityPreview,
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
    assert.equal(isVoiceInputDisabled({ ...available, ...constraint }), true);
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

test("one live assistant message owns both response text and activity", () => {
  const trace = runningToolTrace();
  const first = upsertLiveAssistantDraft([], {
    id: "response-1",
    content: "",
    runStatus: "connecting",
    replyToMessageId: "input-1",
    runTrace: trace,
    runEnvelopeId: "run-1",
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  const streamed = upsertLiveAssistantDraft(first, {
    id: "response-1",
    content: "The answer",
    runStatus: "generating",
    replyToMessageId: "input-1",
    runTrace: trace,
    runEnvelopeId: "run-1",
    timestamp: "2026-01-01T00:00:01.000Z",
  });

  assert.equal(streamed.length, 1);
  assert.equal(streamed[0].content, "The answer");
  assert.equal(streamed[0].runTrace, trace);
  assert.equal(streamed[0].isLiveDraft, true);
});

test("a queued draft paint is invalid after finalization or a later turn", () => {
  assert.equal(
    scheduledDraftBelongsToResponse("response-1", "response-1"),
    true,
  );
  assert.equal(scheduledDraftBelongsToResponse("response-1", null), false);
  assert.equal(
    scheduledDraftBelongsToResponse("response-1", "response-2"),
    false,
  );
});

test("a delayed snapshot clear cannot invalidate a newer response", () => {
  assert.equal(
    clearSnapshotAppliesToResponse("response-1", "response-1"),
    true,
  );
  assert.equal(
    clearSnapshotAppliesToResponse("response-1", "response-2"),
    false,
  );
  assert.equal(clearSnapshotAppliesToResponse(undefined, "response-2"), false);
  assert.equal(clearSnapshotAppliesToResponse(undefined, null), true);
});

test("history loading never hides an optimistic first turn", () => {
  assert.equal(shouldShowChatHistoryLoader(true, 0), true);
  assert.equal(shouldShowChatHistoryLoader(true, 1), false);
  assert.equal(shouldShowChatHistoryLoader(false, 0), false);
});

test("completed activity wins over a stale running trace", () => {
  const running = runningToolTrace();
  const completed = completedTrace();

  assert.equal(preferredChatRunTrace(running, completed), completed);
  assert.equal(preferredChatRunTrace(completed, running), completed);
});

test("a finalized assistant message cannot display running activity", () => {
  const running = runningToolTrace();
  const settled = settledAssistantActivityTrace(
    {
      id: "response-1",
      role: "assistant",
      content: "Done",
      timestamp: "2026-01-01T00:00:02.000Z",
      runStatus: "completed",
      isLiveDraft: false,
    },
    running,
  );

  assert.equal(settled.phase, "completed");
  assert.equal(settled.spans[0].status, "completed");
  assert.equal(running.phase, "executing_tools");
  assert.equal(running.spans[0].status, "running");
});

test("live response display removes only trailing stream whitespace", () => {
  assert.equal(
    visibleLiveAssistantContent("First preview\n\nFollow up\n\n\n"),
    "First preview\n\nFollow up",
  );
  assert.equal(
    visibleLiveAssistantContent("\nFirst preview"),
    "\nFirst preview",
  );
});

test("tool narration moves from the live response body into activity", () => {
  const trace = {
    ...runningToolTrace(),
    spans: [
      {
        ...runningToolTrace().spans[0],
        batchId: "batch-1",
        textPreview: "I’ll query your platform resources.",
      },
    ],
  };

  assert.equal(
    visibleLiveAssistantContent(
      "I’ll query your platform resources.\n\nHere are the results.",
      trace,
    ),
    "Here are the results.",
  );
  assert.equal(
    visibleLiveAssistantContent(
      "I’ll query your platform resources.\n\n\n",
      trace,
    ),
    "",
  );
});

test("top-level local tool calls receive the exact in-memory activity preview", () => {
  const event = {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: "batch-1",
      call_id: "tool-1",
      tool_name: "list_agents",
      text_preview: "bounded worker preview",
    },
  };
  const enriched = withLiveChatActivityPreview(
    event,
    "I’ll query your platform resources.\n\n",
  );

  assert.notEqual(enriched, event);
  assert.equal(
    enriched.data.text_preview,
    "I’ll query your platform resources.",
  );
  assert.equal(event.data.text_preview, "bounded worker preview");
});

test("provider and nested tool previews keep their original ownership", () => {
  const providerEvent = {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: "batch-1",
      call_id: "tool-1",
      tool_name: "web_search",
      provider_native: true,
    },
  };
  const nestedEvent = {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: "batch-2",
      call_id: "tool-2",
      parent_call_id: "ability-1",
      tool_name: "file_read",
    },
  };

  assert.equal(
    withLiveChatActivityPreview(providerEvent, "Final response"),
    providerEvent,
  );
  assert.equal(
    withLiveChatActivityPreview(nestedEvent, "Final response"),
    nestedEvent,
  );
});

test("ordinary progress does not render a second status notice", () => {
  assert.equal(shouldShowChatRunStatusNotice("connecting"), false);
  assert.equal(shouldShowChatRunStatusNotice("generating"), false);
  assert.equal(shouldShowChatRunStatusNotice("using_tool"), false);
  assert.equal(shouldShowChatRunStatusNotice("retrying"), true);
  assert.equal(shouldShowChatRunStatusNotice("failed"), true);
  assert.equal(shouldShowChatRunStatusNotice("cancelled"), true);
});

test("a late activity-only draft collapses into the finalized assistant card", () => {
  const finalTrace = completedTrace();
  const orphanTrace = runningToolTrace();
  const compacted = compactDuplicateChatMessages([
    {
      id: "temporary-response",
      persistedId: "durable-response",
      replyToMessageId: "input-1",
      role: "assistant",
      content: "The completed response",
      timestamp: "2026-01-01T00:00:02.000Z",
      runEnvelopeId: "run-1",
      runTrace: finalTrace,
      runStatus: "completed",
      isLiveDraft: false,
    },
    {
      id: "late-animation-frame",
      role: "assistant",
      content: "",
      timestamp: "2026-01-01T00:00:03.000Z",
      runEnvelopeId: "run-1",
      runTrace: orphanTrace,
      runStatus: "generating",
      isLiveDraft: true,
    },
  ]);

  assert.equal(compacted.length, 1);
  assert.equal(compacted[0].content, "The completed response");
  assert.equal(compacted[0].persistedId, "durable-response");
  assert.equal(compacted[0].runTrace, finalTrace);
  assert.equal(compacted[0].runStatus, "completed");
  assert.equal(compacted[0].isLiveDraft, false);
  assert.equal(compacted[0].timestamp, "2026-01-01T00:00:02.000Z");
});

test("a finalized assistant card rejects a late draft update with the same ID", () => {
  const finalTrace = completedTrace();
  const finalized = {
    id: "temporary-response",
    persistedId: "durable-response",
    replyToMessageId: "input-1",
    role: "assistant",
    content: "The completed response",
    timestamp: "2026-01-01T00:00:02.000Z",
    runEnvelopeId: "run-1",
    runTrace: finalTrace,
    runStatus: "completed",
    isLiveDraft: false,
  };
  const messages = upsertLiveAssistantDraft([finalized], {
    id: "temporary-response",
    content: "",
    runStatus: "generating",
    runEnvelopeId: "run-1",
    runTrace: runningToolTrace(),
    timestamp: "2026-01-01T00:00:03.000Z",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0], finalized);
});

test("assistant turn correlation survives persisted and live event reordering", () => {
  const compacted = compactDuplicateChatMessages([
    {
      id: "temporary-response",
      replyToMessageId: "input-1",
      role: "assistant",
      content: "Partial",
      timestamp: "2026-01-01T00:00:01.000Z",
      runTrace: runningToolTrace(),
      runStatus: "generating",
      isLiveDraft: true,
    },
    {
      id: "durable-response",
      persistedId: "durable-response",
      replyToMessageId: "input-1",
      role: "assistant",
      content: "Final response",
      timestamp: "2026-01-01T00:00:02.000Z",
    },
  ]);

  assert.equal(compacted.length, 1);
  assert.equal(compacted[0].id, "temporary-response");
  assert.equal(compacted[0].persistedId, "durable-response");
  assert.equal(compacted[0].content, "Final response");
  assert.equal(compacted[0].isLiveDraft, false);
});

test("local chat activity excludes transcript token and reasoning deltas", () => {
  assert.equal(
    shouldPersistChatActivityEvent({
      event_type: "AssistantTextDelta",
      data: { request_id: "model-1", delta: "answer" },
    }),
    false,
  );
  assert.equal(
    shouldPersistChatActivityEvent({
      event_type: "AssistantReasoningDelta",
      data: { request_id: "model-1", delta: "reasoning" },
    }),
    false,
  );
  assert.equal(
    shouldPersistChatActivityEvent({
      event_type: "ToolCallStarted",
      data: {
        run_id: "run-1",
        call_id: "tool-1",
        tool_name: "inspect_operations",
      },
    }),
    true,
  );
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
