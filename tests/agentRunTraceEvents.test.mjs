import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalLifecycleEventTypes,
  chatStreamEventToLifecycleEvent,
} from "../lib/agentRunTrace/adapters/chatStream.ts";
import { reduceRunTrace } from "../lib/agentRunTrace/reducer.ts";

const ROOT = new URL("..", import.meta.url);

function at(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function reduceEvents(events) {
  let trace;
  events.forEach((event, index) => {
    trace = reduceRunTrace(trace, event, { now: at(index) });
  });
  assert.ok(trace, "trace should be created");
  return trace;
}

function runStarted() {
  return {
    event_type: "RunStarted",
    data: { run_id: "run-1", session_id: "session-1", source: "chat" },
  };
}

function modelStarted() {
  return {
    event_type: "ModelRequestStarted",
    data: {
      run_id: "run-1",
      request_id: "model-1",
      provider: "xai",
      model: "grok-4",
    },
  };
}

function toolStarted() {
  return {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: "batch-1",
      call_id: "tool-1",
      tool_name: "inspect_operations",
      tool_args: { limit: 5 },
      args_summary: '{"limit":5}',
      text_preview: "Inspecting operations",
    },
  };
}

function asyncStarted(overrides = {}) {
  return {
    event_type: "AsyncOperationEvent",
    data: {
      run_id: "run-1",
      operation_id: "op-1",
      kind: "ability",
      label: "Build library",
      status: "running",
      signal: "started",
      summary: "Creating a knowledge graph",
      ...overrides,
    },
  };
}

function hookStarted() {
  return {
    event_type: "HookStarted",
    data: {
      run_id: "run-1",
      call_id: "hook-1",
      hook: "pre_response",
      hook_event: "before_send",
      source: "agent",
      raw_args: { dry_run: false },
    },
  };
}

const adapterSamples = {
  RunStarted: runStarted().data,
  RunCompleted: { run_id: "run-1", session_id: "session-1" },
  RunFailed: { run_id: "run-1", session_id: "session-1", message: "boom" },
  RunCancelled: { run_id: "run-1", session_id: "session-1" },
  Paused: { run_id: "run-1", session_id: "session-1" },
  Resumed: { run_id: "run-1", session_id: "session-1" },
  ModelRequestStarted: modelStarted().data,
  AssistantTextDelta: {
    run_id: "run-1",
    request_id: "model-1",
    delta: "Hello",
  },
  AssistantResponse: {
    run_id: "run-1",
    message: "Still working",
    status: "in_progress",
  },
  ModelRequestCompleted: { run_id: "run-1", request_id: "model-1" },
  MessageCompacted: { run_id: "run-1", messages_before: 20, messages_after: 8 },
  ToolCallStarted: toolStarted().data,
  ToolOutputDelta: {
    run_id: "run-1",
    call_id: "tool-1",
    stream: "preview",
    delta: "progress",
  },
  ToolCallCompleted: {
    run_id: "run-1",
    batch_id: "batch-1",
    call_id: "tool-1",
    success: true,
    output_preview: "done",
  },
  AsyncOperationEvent: asyncStarted().data,
  AsyncOperationTranscript: {
    run_id: "run-1",
    operation_id: "op-1",
    kind: "ability",
    label: "Build library",
    event: { kind: "tool", tool: "read_file", summary: "Read strategy" },
  },
  HookStarted: hookStarted().data,
  HookCompleted: {
    run_id: "run-1",
    call_id: "hook-1",
    success: true,
    output_preview: "approved",
  },
};

test("chat stream adapter explicitly accepts every canonical lifecycle event", () => {
  assert.deepEqual(
    Object.keys(adapterSamples).sort(),
    [...canonicalLifecycleEventTypes].sort(),
  );

  for (const eventType of canonicalLifecycleEventTypes) {
    const lifecycleEvent = chatStreamEventToLifecycleEvent({
      event_type: eventType,
      data: adapterSamples[eventType],
    });
    assert.equal(lifecycleEvent?.event_type, eventType);
  }
});

test("chat stream adapter rejects malformed hook lifecycle events", () => {
  assert.equal(
    chatStreamEventToLifecycleEvent({
      event_type: "HookStarted",
      data: { hook: "pre_response" },
    }),
    undefined,
  );
  assert.equal(
    chatStreamEventToLifecycleEvent({
      event_type: "HookCompleted",
      data: { success: true },
    }),
    undefined,
  );
});

const renderCases = [
  {
    eventType: "RunStarted",
    events: [runStarted()],
    assertTrace(trace) {
      assert.equal(trace.phase, "queued");
      assert.equal(trace.spans.length, 0);
    },
  },
  {
    eventType: "RunCompleted",
    events: [runStarted(), modelStarted(), { event_type: "RunCompleted", data: {} }],
    assertTrace(trace) {
      assert.equal(trace.phase, "completed");
      assert.equal(trace.spans[0].status, "completed");
    },
  },
  {
    eventType: "RunFailed",
    events: [runStarted(), { event_type: "RunFailed", data: { message: "boom" } }],
    assertTrace(trace) {
      assert.equal(trace.phase, "failed");
      assert.equal(trace.errorMessage, "boom");
    },
  },
  {
    eventType: "RunCancelled",
    events: [runStarted(), { event_type: "RunCancelled", data: {} }],
    assertTrace(trace) {
      assert.equal(trace.phase, "cancelled");
    },
  },
  {
    eventType: "Paused",
    events: [runStarted(), { event_type: "Paused", data: {} }],
    assertTrace(trace) {
      assert.equal(trace.phase, "paused");
      assert.equal(trace.spans.at(-1).kind, "message");
      assert.equal(trace.spans.at(-1).text, "Paused");
    },
  },
  {
    eventType: "Resumed",
    events: [
      runStarted(),
      { event_type: "Paused", data: {} },
      { event_type: "Resumed", data: {} },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "idle");
      assert.equal(trace.spans.at(-1).kind, "message");
      assert.equal(trace.spans.at(-1).text, "Resumed");
    },
  },
  {
    eventType: "ModelRequestStarted",
    events: [runStarted(), modelStarted()],
    assertTrace(trace) {
      assert.equal(trace.phase, "thinking");
      assert.equal(trace.spans.at(-1).kind, "model");
      assert.equal(trace.spans.at(-1).status, "running");
    },
  },
  {
    eventType: "AssistantTextDelta",
    events: [
      runStarted(),
      modelStarted(),
      { event_type: "AssistantTextDelta", data: { request_id: "model-1", delta: "Hello" } },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "streaming");
      assert.equal(trace.spans.at(-1).kind, "model");
      assert.equal(trace.spans.at(-1).text, "Hello");
    },
  },
  {
    eventType: "AssistantResponse",
    events: [
      runStarted(),
      {
        event_type: "AssistantResponse",
        data: { message: "Still working", status: "in_progress" },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "queued");
      assert.equal(trace.spans.length, 0);
    },
  },
  {
    eventType: "AssistantResponse:terminal",
    events: [
      runStarted(),
      toolStarted(),
      {
        event_type: "AssistantResponse",
        data: { message: "Done", status: "completed" },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "completed");
      assert.equal(trace.spans.at(-1).kind, "tool");
      assert.equal(trace.spans.at(-1).status, "completed");
    },
  },
  {
    eventType: "ModelRequestCompleted",
    events: [
      runStarted(),
      modelStarted(),
      { event_type: "ModelRequestCompleted", data: { request_id: "model-1" } },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "idle");
      assert.equal(trace.spans.at(-1).kind, "model");
      assert.equal(trace.spans.at(-1).status, "completed");
    },
  },
  {
    eventType: "MessageCompacted",
    events: [
      runStarted(),
      {
        event_type: "MessageCompacted",
        data: { messages_before: 20, messages_after: 8 },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.spans.at(-1).kind, "message");
      assert.match(trace.spans.at(-1).text, /Compacted context/);
    },
  },
  {
    eventType: "ToolCallStarted",
    events: [runStarted(), toolStarted()],
    assertTrace(trace) {
      assert.equal(trace.phase, "executing_tools");
      assert.equal(trace.spans.at(-1).kind, "tool");
      assert.equal(trace.spans.at(-1).status, "running");
    },
  },
  {
    eventType: "ToolOutputDelta",
    events: [
      runStarted(),
      toolStarted(),
      {
        event_type: "ToolOutputDelta",
        data: { call_id: "tool-1", stream: "preview", delta: "halfway" },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.spans.at(-1).kind, "tool");
      assert.equal(trace.spans.at(-1).textPreview, "Inspecting operationshalfway");
    },
  },
  {
    eventType: "ToolCallCompleted",
    events: [
      runStarted(),
      toolStarted(),
      {
        event_type: "ToolCallCompleted",
        data: { call_id: "tool-1", success: true, output_preview: "done" },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "idle");
      assert.equal(trace.spans.at(-1).kind, "tool");
      assert.equal(trace.spans.at(-1).status, "completed");
      assert.equal(trace.spans.at(-1).outputPreview, "done");
    },
  },
  {
    eventType: "AsyncOperationEvent",
    events: [runStarted(), asyncStarted()],
    assertTrace(trace) {
      assert.equal(trace.phase, "running_ability");
      assert.equal(trace.spans.at(-1).kind, "async_operation");
      assert.equal(trace.spans.at(-1).taskPreview, "Creating a knowledge graph");
    },
  },
  {
    eventType: "AsyncOperationTranscript",
    events: [
      runStarted(),
      asyncStarted(),
      {
        event_type: "AsyncOperationTranscript",
        data: {
          operation_id: "op-1",
          kind: "ability",
          label: "Build library",
          event: { kind: "tool", tool: "read_file", summary: "Read strategy" },
        },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.spans.at(-1).kind, "async_operation");
      assert.equal(trace.spans.at(-1).transcript.length, 1);
      assert.equal(trace.spans.at(-1).transcript[0].summary, "Read strategy");
    },
  },
  {
    eventType: "HookStarted",
    events: [runStarted(), hookStarted()],
    assertTrace(trace) {
      assert.equal(trace.phase, "running_hook");
      assert.equal(trace.spans.at(-1).kind, "hook");
      assert.equal(trace.spans.at(-1).status, "running");
    },
  },
  {
    eventType: "HookCompleted",
    events: [
      runStarted(),
      hookStarted(),
      {
        event_type: "HookCompleted",
        data: { call_id: "hook-1", success: true, output_preview: "approved" },
      },
    ],
    assertTrace(trace) {
      assert.equal(trace.phase, "idle");
      assert.equal(trace.spans.at(-1).kind, "hook");
      assert.equal(trace.spans.at(-1).status, "completed");
      assert.equal(trace.spans.at(-1).outputPreview, "approved");
    },
  },
];

test("every canonical lifecycle event has an explicit trace rendering outcome", () => {
  assert.deepEqual(
    renderCases
      .map((entry) => entry.eventType)
      .filter((eventType) => !eventType.includes(":"))
      .sort(),
    [...canonicalLifecycleEventTypes].sort(),
  );

  for (const entry of renderCases) {
    const trace = reduceEvents(entry.events);
    entry.assertTrace(trace);
  }
});

test("tool output deltas render to their matching preview streams", () => {
  const trace = reduceEvents([
    runStarted(),
    toolStarted(),
    {
      event_type: "ToolOutputDelta",
      data: { call_id: "tool-1", stream: "stdout", delta: "out" },
    },
    {
      event_type: "ToolOutputDelta",
      data: { call_id: "tool-1", stream: "stderr", delta: "err" },
    },
    {
      event_type: "ToolOutputDelta",
      data: { call_id: "tool-1", stream: "preview", delta: "preview" },
    },
  ]);
  const span = trace.spans.at(-1);
  assert.equal(span.kind, "tool");
  assert.equal(span.stdout, "out");
  assert.equal(span.stderr, "err");
  assert.equal(span.textPreview, "Inspecting operationspreview");
});

test("tool start creates a visible trace before RunStarted when chat session is known", () => {
  const trace = reduceRunTrace(undefined, toolStarted(), {
    defaultSessionId: "session-1",
    now: at(0),
    source: "chat",
  });

  assert.ok(trace, "trace should be created from first tool event");
  assert.equal(trace.id, "run-1");
  assert.equal(trace.sessionId, "session-1");
  assert.equal(trace.phase, "executing_tools");
  assert.equal(trace.spans.length, 1);
  assert.equal(trace.spans[0].kind, "tool");
  assert.equal(trace.spans[0].name, "inspect_operations");
  assert.equal(trace.spans[0].status, "running");
});

test("chat surfaces do not contain the legacy active-tool fallback display", () => {
  const files = [
    new URL("components/chat/ChatArea.tsx", ROOT),
    new URL("components/project/PlannerChat.tsx", ROOT),
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("TypingIndicator"), false);
    assert.equal(source.includes("ToolCallLine"), false);
    assert.equal(source.includes("formatToolCallSignature"), false);
  }
});

test("chat finalization preserves run trace until it is attached to the final message", () => {
  const source = readFileSync(new URL("lib/usePlannerChat.ts", ROOT), "utf8");

  assert.match(
    source,
    /clearLiveTurnIndicators\(\{\s*preserveRunTraceForFinalMessage: true,\s*broadcastClear: false,\s*\}\);\s*const resolvedFinalOutput[\s\S]*?const traceForFinal =[\s\S]*?runTrace: traceForFinal[\s\S]*?finishFinalizedLiveTurn\(\);/,
  );
  assert.match(
    source,
    /clearLiveTurnIndicators\(\{\s*preserveRunTraceForFinalMessage: true,\s*broadcastClear: false,\s*\}\);\s*await lifecycleQueueRef\.current;[\s\S]*?const traceForFinal =[\s\S]*?runTrace: m\.runTrace \?\? traceForFinal[\s\S]*?finishFinalizedLiveTurn\(\);/,
  );
});
