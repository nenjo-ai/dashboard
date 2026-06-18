import assert from "node:assert/strict";
import test from "node:test";

import { reduceRunTrace } from "../lib/agentRunTrace/reducer.ts";
import {
  chronologicalSpans,
  currentCycleSpans,
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
  providerNative = false,
  provider,
}) {
  return {
    event_type: "ToolCallStarted",
    data: {
      run_id: "run-1",
      batch_id: batchId,
      call_id: callId,
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

test("live trace still hides older non-provider tool batches", () => {
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

  assert.deepEqual(visibleToolNames(trace), ["second_tool"]);
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
