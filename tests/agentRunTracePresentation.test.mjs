import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTraceDuration,
  groupTraceDisplayItems,
  toolActivityLabel,
  toolBatchLabel,
  toolBatchProgress,
  traceActivitySummary,
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
