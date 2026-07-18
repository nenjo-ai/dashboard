import assert from "node:assert/strict";
import test from "node:test";

import { reduceRunTrace } from "../lib/agentRunTrace/reducer.ts";
import {
  chatDisplaySpans,
  chronologicalSpans,
  currentCycleSpans,
  filterHistorySpans,
  visibleAsyncOperationResultPreview,
  visibleHistoryTranscriptEntries,
} from "../lib/agentRunTrace/visibility.ts";

function reduceEvents(events) {
  let trace;
  events.forEach((event, index) => {
    trace = reduceRunTrace(trace, event, {
      now: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    });
  });
  assert.ok(trace, "trace should be created");
  return trace;
}

function runStarted() {
  return {
    event_type: "RunStarted",
    data: {
      run_id: "run-1",
      session_id: "session-1",
      source: "chat",
    },
  };
}

function modelTurn() {
  return [
    {
      event_type: "ModelRequestStarted",
      data: {
        run_id: "run-1",
        request_id: "model-1",
        model: "grok-4",
      },
    },
    {
      event_type: "ModelRequestCompleted",
      data: {
        run_id: "run-1",
        request_id: "model-1",
      },
    },
  ];
}

function modelStarted() {
  return {
    event_type: "ModelRequestStarted",
    data: {
      run_id: "run-1",
      request_id: "model-1",
      model: "grok-4",
    },
  };
}

function toolStarted({
  callId,
  batchId,
  name,
  parentCallId,
  providerNative = false,
  provider,
}) {
  return {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: batchId,
      call_id: callId,
      parent_call_id: parentCallId,
      tool_name: name,
      tool_args: "{}",
      text_preview: providerNative ? `Running ${name}` : undefined,
      provider_native: providerNative,
      tool_origin: providerNative ? "provider" : undefined,
      provider,
    },
  };
}

function toolCompleted({
  callId,
  batchId,
  success = true,
  output,
  providerNative = false,
  provider,
}) {
  return {
    event_type: "ToolCallCompleted",
    data: {
      run_id: "run-1",
      batch_id: batchId,
      call_id: callId,
      success,
      output,
      output_preview: success ? "done" : undefined,
      error_preview: success ? undefined : "failed",
      provider_native: providerNative,
      tool_origin: providerNative ? "provider" : undefined,
      provider,
    },
  };
}

function visibleToolNames(trace) {
  return currentCycleSpans(chronologicalSpans(trace.spans))
    .filter((span) => span.kind === "tool")
    .map((span) => span.name);
}

test("live trace shows provider-native web_search as soon as start event arrives", () => {
  const trace = reduceEvents([
    runStarted(),
    ...modelTurn(),
    toolStarted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      name: "web_search",
      providerNative: true,
      provider: "xai",
    }),
  ]);

  const visible = currentCycleSpans(chronologicalSpans(trace.spans));
  const span = visible.find((candidate) => candidate.id === "provider-call-1");
  assert.equal(span?.kind, "tool");
  assert.equal(span.name, "web_search");
  assert.equal(span.status, "running");
  assert.equal(span.providerNative, true);
});

test("live trace shows provider-native web_search while model request is still running", () => {
  const trace = reduceEvents([
    runStarted(),
    modelStarted(),
    toolStarted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      name: "web_search",
      providerNative: true,
      provider: "xai",
    }),
  ]);

  assert.deepEqual(visibleToolNames(trace), ["web_search"]);
});

test("live trace keeps provider-native web_search visible after a later tool batch", () => {
  const trace = reduceEvents([
    runStarted(),
    ...modelTurn(),
    toolStarted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      name: "web_search",
      providerNative: true,
      provider: "xai",
    }),
    toolCompleted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      providerNative: true,
      provider: "xai",
    }),
    toolStarted({
      callId: "local-call-1",
      batchId: "local-batch-1",
      name: "inspect_operations",
    }),
    toolCompleted({
      callId: "local-call-1",
      batchId: "local-batch-1",
    }),
  ]);

  assert.deepEqual(visibleToolNames(trace), ["web_search", "inspect_operations"]);
});

test("live trace stacks completed tool batches from the current turn", () => {
  const trace = reduceEvents([
    runStarted(),
    ...modelTurn(),
    toolStarted({
      callId: "local-call-1",
      batchId: "local-batch-1",
      name: "first_tool",
    }),
    toolCompleted({
      callId: "local-call-1",
      batchId: "local-batch-1",
    }),
    toolStarted({
      callId: "local-call-2",
      batchId: "local-batch-2",
      name: "second_tool",
    }),
    toolCompleted({
      callId: "local-call-2",
      batchId: "local-batch-2",
    }),
  ]);

  assert.deepEqual(visibleToolNames(trace), ["first_tool", "second_tool"]);
});

test("live trace keeps assistant text above model-attached tool calls", () => {
  const trace = reduceEvents([
    runStarted(),
    modelStarted(),
    {
      event_type: "AssistantTextDelta",
      data: {
        run_id: "run-1",
        request_id: "model-1",
        delta: "I will inspect the project first.",
      },
    },
    toolStarted({
      callId: "local-call-1",
      batchId: "local-batch-1",
      parentCallId: "model-1",
      name: "inspect_operations",
    }),
    toolCompleted({
      callId: "local-call-1",
      batchId: "local-batch-1",
    }),
    {
      event_type: "ModelRequestCompleted",
      data: {
        run_id: "run-1",
        request_id: "model-1",
      },
    },
  ]);

  const visible = currentCycleSpans(chronologicalSpans(trace.spans));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].kind, "model");
  assert.equal(visible[0].text, "I will inspect the project first.");
  assert.deepEqual(
    visible[0].children.map((span) => `${span.kind}:${span.name}:${span.status}`),
    ["tool:inspect_operations:completed"],
  );
});

test("chat display groups top-level tool calls under the preceding text preview", () => {
  const trace = reduceEvents([
    runStarted(),
    modelStarted(),
    {
      event_type: "AssistantTextDelta",
      data: {
        run_id: "run-1",
        request_id: "model-1",
        delta: "I will inspect the project first.",
      },
    },
    {
      event_type: "ModelRequestCompleted",
      data: {
        run_id: "run-1",
        request_id: "model-1",
      },
    },
    toolStarted({
      callId: "local-call-1",
      batchId: "local-batch-1",
      name: "file_read",
    }),
    {
      event_type: "ToolCallCompleted",
      data: {
        run_id: "run-1",
        batch_id: "local-batch-1",
        call_id: "local-call-1",
        success: false,
        error_preview: "not found",
      },
    },
    toolStarted({
      callId: "local-call-2",
      batchId: "local-batch-2",
      name: "list_agents",
    }),
    toolCompleted({
      callId: "local-call-2",
      batchId: "local-batch-2",
    }),
  ]);

  const display = chatDisplaySpans(currentCycleSpans(chronologicalSpans(trace.spans)));
  assert.equal(display.length, 1);
  assert.equal(display[0].kind, "model");
  assert.equal(display[0].text, "I will inspect the project first.");
  assert.deepEqual(
    display[0].children.map((span) => `${span.kind}:${span.name}:${span.status}`),
    ["tool:file_read:failed", "tool:list_agents:completed"],
  );
});

test("chat display hides respond_to_user tool calls", () => {
  const display = chatDisplaySpans([
    {
      kind: "model",
      id: "model-1",
      status: "completed",
      text: "Ready to respond.",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      children: [
        {
          kind: "tool",
          id: "respond-child",
          status: "completed",
          name: "respond_to_user",
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:03.000Z",
        },
      ],
    },
    {
      kind: "tool",
      id: "respond-top-level",
      status: "completed",
      name: "respond_to_user",
      startedAt: "2026-01-01T00:00:04.000Z",
      completedAt: "2026-01-01T00:00:05.000Z",
    },
    {
      kind: "tool",
      id: "read-doc",
      status: "completed",
      name: "read_knowledge_doc",
      startedAt: "2026-01-01T00:00:06.000Z",
      completedAt: "2026-01-01T00:00:07.000Z",
    },
  ]);

  assert.equal(display.length, 1);
  assert.equal(display[0].kind, "model");
  assert.deepEqual(
    display[0].children.map((span) => span.kind === "tool" ? span.name : span.kind),
    ["read_knowledge_doc"],
  );
});

test("chat display groups async operation child tools under child text previews", () => {
  const display = chatDisplaySpans([
    {
      kind: "async_operation",
      id: "ability-1",
      status: "running",
      operationKind: "ability",
      label: "research",
      signal: "started",
      transcript: [],
      children: [
        {
          kind: "model",
          id: "ability-model-1",
          status: "completed",
          text: "I will inspect the workspace first.",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          children: [],
        },
        {
          kind: "tool",
          id: "ability-tool-1",
          status: "failed",
          name: "file_read",
          textPreview: "I will inspect the workspace first.",
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:03.000Z",
        },
        {
          kind: "tool",
          id: "ability-tool-2",
          status: "completed",
          name: "list_agents",
          textPreview: "I will inspect the workspace first.",
          startedAt: "2026-01-01T00:00:04.000Z",
          completedAt: "2026-01-01T00:00:05.000Z",
        },
        {
          kind: "tool",
          id: "ability-tool-3",
          status: "completed",
          name: "respond_to_user",
          startedAt: "2026-01-01T00:00:06.000Z",
          completedAt: "2026-01-01T00:00:07.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);

  assert.equal(display.length, 1);
  assert.equal(display[0].kind, "async_operation");
  assert.equal(display[0].children.length, 1);
  assert.equal(display[0].children[0].kind, "model");
  assert.equal(display[0].children[0].text, "I will inspect the workspace first.");
  assert.deepEqual(
    display[0].children[0].children.map(
      (span) => `${span.kind}:${span.name}:${span.status}`,
    ),
    ["tool:file_read:failed", "tool:list_agents:completed"],
  );
});

test("async operation result preview is hidden when child model already shows it", () => {
  const span = {
    kind: "async_operation",
    id: "ability-1",
    status: "completed",
    operationKind: "ability",
    label: "create-agent",
    signal: "completed",
    resultPreview: "All fields verified. The agent was created successfully.",
    transcript: [],
    children: [
      {
        kind: "model",
        id: "ability-model-1",
        status: "completed",
        text: "All fields verified.\nThe agent was created successfully.",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        children: [],
      },
    ],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
  };

  assert.equal(visibleAsyncOperationResultPreview(span), undefined);
});

test("async operation result preview is kept when no child model shows it", () => {
  const span = {
    kind: "async_operation",
    id: "sub-agent-1",
    status: "completed",
    operationKind: "sub_agent",
    label: "research-agent",
    signal: "completed",
    resultPreview: "Research completed with three recommendations.",
    transcript: [],
    children: [
      {
        kind: "tool",
        id: "read-doc",
        status: "completed",
        name: "read_knowledge_doc",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
      },
    ],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:02.000Z",
  };

  assert.equal(
    visibleAsyncOperationResultPreview(span),
    "Research completed with three recommendations.",
  );
});

test("reducer preserves provider-native metadata on completed tool spans", () => {
  const trace = reduceEvents([
    runStarted(),
    ...modelTurn(),
    toolStarted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      name: "x_search",
      providerNative: true,
      provider: "xai",
    }),
    toolCompleted({
      callId: "provider-call-1",
      batchId: "provider-batch-1",
      providerNative: true,
      provider: "xai",
    }),
  ]);

  const span = trace.spans.find((candidate) => candidate.id === "provider-call-1");
  assert.equal(span?.kind, "tool");
  assert.equal(span.providerNative, true);
  assert.equal(span.provider, "xai");
  assert.equal(span.name, "x_search");
  assert.equal(span.status, "completed");
});

test("reducer preserves structured tool output on completed tool spans", () => {
  const trace = reduceEvents([
    runStarted(),
    ...modelTurn(),
    toolStarted({
      callId: "search-call-1",
      batchId: "search-batch-1",
      name: "search_knowledge",
    }),
    toolCompleted({
      callId: "search-call-1",
      batchId: "search-batch-1",
      output: [
        {
          document: {
            selector: "classification.workflow_patterns",
            title: "Workflow Pattern Classification",
          },
          matched: ["title"],
          score: 7795,
        },
      ],
    }),
  ]);

  const span = trace.spans.find((candidate) => candidate.id === "search-call-1");
  assert.equal(span?.kind, "tool");
  assert.equal(span.output?.[0]?.document?.selector, "classification.workflow_patterns");
});

test("history trace hides raw transcript echo rows while keeping named child tools", () => {
  const history = filterHistorySpans([
    {
      kind: "async_operation",
      id: "ability-1",
      status: "completed",
      operationKind: "ability",
      label: "deep-research-routine",
      signal: "completed",
      transcript: [],
      children: [
        {
          kind: "message",
          id: "assistant-message-1",
          status: "completed",
          role: "assistant",
          text: 'assistant_message {"content":"","tool_calls":[]}',
          startedAt: "2026-01-01T00:00:01.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
        },
        {
          kind: "tool",
          id: "call-configure",
          status: "completed",
          name: "configure_routine",
          startedAt: "2026-01-01T00:00:02.000Z",
          completedAt: "2026-01-01T00:00:03.000Z",
        },
        {
          kind: "tool",
          id: "provider-echo-tool",
          status: "completed",
          name: "tool",
          providerNative: true,
          startedAt: "2026-01-01T00:00:04.000Z",
          completedAt: "2026-01-01T00:00:05.000Z",
        },
      ],
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:06.000Z",
    },
  ]);

  assert.equal(history.length, 1);
  const [span] = history;
  assert.equal(span.kind, "async_operation");
  assert.deepEqual(
    span.children.map((child) => child.kind === "tool" ? child.name : child.text),
    ["configure_routine"],
  );
});

test("history trace keeps a provider tool when no named sibling replaces it", () => {
  const history = filterHistorySpans([
    {
      kind: "tool",
      id: "provider-tool-only",
      status: "completed",
      name: "tool",
      providerNative: true,
      textPreview: "Searching the web",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
    },
  ]);

  assert.equal(history.length, 1);
  assert.equal(history[0].id, "provider-tool-only");
});

test("history trace keeps completed model spans with assistant text or child tools", () => {
  const history = filterHistorySpans([
    {
      kind: "model",
      id: "empty-model",
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      children: [],
    },
    {
      kind: "model",
      id: "model-with-work",
      status: "completed",
      text: "I will inspect the project first.",
      startedAt: "2026-01-01T00:00:02.000Z",
      completedAt: "2026-01-01T00:00:05.000Z",
      children: [
        {
          kind: "tool",
          id: "call-inspect",
          status: "completed",
          name: "inspect_operations",
          startedAt: "2026-01-01T00:00:03.000Z",
          completedAt: "2026-01-01T00:00:04.000Z",
        },
      ],
    },
  ]);

  assert.equal(history.length, 1);
  assert.equal(history[0].kind, "model");
  assert.equal(history[0].id, "model-with-work");
  assert.equal(history[0].children.length, 1);
});

test("history transcript hides duplicate tool entries only when child spans exist", () => {
  const span = {
    kind: "async_operation",
    id: "ability-1",
    status: "completed",
    operationKind: "ability",
    label: "deep-research-routine",
    signal: "completed",
    transcript: [
      {
        kind: "assistant_message",
        summary: '{"content":"","tool_calls":[]}',
      },
      {
        kind: "tool_call",
        tool: "configure_routine",
        summary: '{"graph":{"edges":[]}}',
      },
      {
        kind: "tool_result",
        tool: "configure_routine",
        success: true,
        summary: '{"routine":{}}',
      },
      {
        kind: "error",
        summary: "network unavailable",
      },
    ],
    children: [
      {
        kind: "tool",
        id: "call-configure",
        status: "completed",
        name: "configure_routine",
        startedAt: "2026-01-01T00:00:02.000Z",
        completedAt: "2026-01-01T00:00:03.000Z",
      },
    ],
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:06.000Z",
  };

  assert.deepEqual(
    visibleHistoryTranscriptEntries(span).map((entry) => entry.kind),
    ["error"],
  );

  assert.deepEqual(
    visibleHistoryTranscriptEntries({ ...span, children: [] }).map(
      (entry) => entry.kind,
    ),
    ["assistant_message", "tool_call", "tool_result", "error"],
  );
});
