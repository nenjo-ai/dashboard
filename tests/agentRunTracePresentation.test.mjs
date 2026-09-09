import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTraceDuration,
  groupTraceDisplayItems,
  storedTraceActivitySummary,
  toolActivityLabel,
  toolBatchLabel,
  toolBatchProgress,
  traceActivitySummary,
  waitSequenceDuration,
  withPersistedActivityTiming,
} from "../lib/agentRunTrace/presentation.ts";

function tool(id, name, status = "completed", batchId = "batch-1") {
  return {
    kind: "tool",
    id,
    batchId,
    name,
    status,
    startedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("trace durations use calm human-readable precision", () => {
  assert.equal(
    formatTraceDuration(
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ),
    "<1s",
  );
  assert.equal(
    formatTraceDuration(
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:01.800Z",
    ),
    "1.8s",
  );
  assert.equal(
    formatTraceDuration(
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:08.000Z",
    ),
    "1m 8s",
  );
});

test("parallel tool calls are grouped by stable batch identity", () => {
  const first = tool("tool-1", "list_agents");
  const second = tool("tool-2", "list_projects");
  const later = tool("tool-3", "search_files", "running", "batch-2");
  const items = groupTraceDisplayItems([first, second, later]);

  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "tool_batch");
  assert.deepEqual(items[0].tools.map((entry) => entry.id), ["tool-1", "tool-2"]);
  assert.equal(items[1].id, "batch-2");
});

test("consecutive wait calls collapse and retain their agent previews", () => {
  const waitModel = (id, startedAt, completedAt, textPreview) => ({
    kind: "model",
    id: `model-${id}`,
    status: "completed",
    startedAt,
    completedAt,
    children: [
      {
        ...tool(`wait-${id}`, "wait", "completed", `batch-${id}`),
        startedAt,
        completedAt,
        textPreview,
      },
    ],
  });
  const items = groupTraceDisplayItems([
    waitModel(
      "1",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:10.000Z",
      "I’ll wait for the first update.",
    ),
    waitModel(
      "2",
      "2026-01-01T00:00:12.000Z",
      "2026-01-01T00:00:32.000Z",
      "No result yet, so I’ll keep waiting.",
    ),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "wait_sequence");
  assert.deepEqual(items[0].textPreviews, [
    "I’ll wait for the first update.",
    "No result yet, so I’ll keep waiting.",
  ]);
  assert.equal(waitSequenceDuration(items[0].waits), "30s");

  const interrupted = groupTraceDisplayItems([
    waitModel(
      "1",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:10.000Z",
      "I’ll wait for the first update.",
    ),
    tool("tool-1", "inspect_operations"),
    waitModel(
      "2",
      "2026-01-01T00:00:12.000Z",
      "2026-01-01T00:00:32.000Z",
      "No result yet, so I’ll keep waiting.",
    ),
  ]);
  assert.deepEqual(
    interrupted.map((item) => item.kind),
    ["span", "tool_batch", "span"],
  );
});

test("tool batches and tools use readable activity language", () => {
  const tools = [
    tool("tool-1", "list_agents"),
    tool("tool-2", "list_projects", "running"),
  ];
  assert.equal(toolBatchLabel(tools), "Queried 2 resource types");
  assert.equal(toolBatchProgress(tools), "1 of 2 complete");
  assert.equal(toolActivityLabel(tools[0]), "Listed agents");
  assert.equal(toolActivityLabel(tools[1]), "Listing projects");
  assert.equal(
    toolActivityLabel(tool("tool-3", "shell", "running", "batch-2")),
    "Running shell command",
  );
  assert.equal(
    toolActivityLabel(tool("tool-4", "shell", "completed", "batch-3")),
    "Ran shell command",
  );
  assert.equal(
    toolActivityLabel(tool("tool-5", "wait", "completed", "batch-4")),
    "Waited",
  );
});

test("collapsed activity summarizes status, work, and duration", () => {
  const summary = traceActivitySummary({
    id: "run-1",
    sessionId: "session-1",
    source: "chat",
    phase: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:02.400Z",
    spans: [
      tool("tool-1", "list_agents"),
      tool("tool-2", "list_projects"),
    ],
  });

  assert.deepEqual(summary, {
    status: "Completed",
    detail: "2 tool calls",
    duration: "2.4s",
    ariaLabel: "Activity, Completed, 2 tool calls, 2.4s",
  });
});

test("persisted activity metrics render before the S3 trace is opened", () => {
  const summary = storedTraceActivitySummary({
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:08.000Z",
    toolCallCount: 3,
    operationCount: 1,
    truncated: false,
  });

  assert.deepEqual(summary, {
    status: "Completed",
    detail: "3 tool calls · 1 operation",
    duration: "1m 8s",
    ariaLabel: "Activity, Completed, 3 tool calls · 1 operation, 1m 8s",
  });
});

test("persisted total run time remains authoritative after S3 details load", () => {
  const reconstructedTrace = {
    id: "run-1",
    sessionId: "session-1",
    source: "chat",
    phase: "completed",
    startedAt: "2026-01-01T00:14:00.000Z",
    completedAt: "2026-01-01T00:14:00.200Z",
    spans: [tool("tool-1", "list_agents")],
  };

  const trace = withPersistedActivityTiming(reconstructedTrace, {
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:14:00.000Z",
  });

  assert.equal(traceActivitySummary(trace).duration, "14m 0s");
  assert.equal(trace.spans, reconstructedTrace.spans);
});
