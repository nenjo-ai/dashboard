import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutionTraceGroups,
  traceEnvelopeFromPersistedEvent,
  traceEnvelopeFromRealtimeEvent,
} from "../lib/executionTraceEvents.ts";
import {
  executionRealtimeEventIsTerminal,
  EXECUTION_EVENT_TYPE,
  ExecutionEventKind,
} from "../lib/executionEvents.ts";

const routineStep = {
  step_slug: "implement",
  step_run_id: "step-run-1",
  step_name: "implement",
  step_type: "agent",
};

function persistedTraceEvent({ sequence, event }) {
  return traceEnvelopeFromPersistedEvent({
    id: `event-${sequence}`,
    org_id: "org-1",
    execution_run_id: "execution-1",
    task_id: "task-1",
    routine_step: routineStep,
    event_type: event.event_type,
    event,
    created_at: `2026-01-01T00:00:0${sequence}.000Z`,
    sequence,
  });
}

function startedEvent() {
  return {
    event_type: "ToolCallStarted",
    data: {
      run_id: "trace-run-1",
      batch_id: "batch-1",
      call_id: "tool-1",
      tool_name: "file_write",
      payload: {
        tool_args: { path: "src/app.tsx" },
        text_preview: "Writing src/app.tsx",
      },
    },
  };
}

function completedEvent() {
  return {
    event_type: "ToolCallCompleted",
    data: {
      run_id: "trace-run-1",
      batch_id: "batch-1",
      call_id: "tool-1",
      success: true,
      payload: {
        output: [
          {
            document: {
              selector: "resources.agents",
              title: "Agents",
            },
            matched: ["title"],
            score: 100,
          },
        ],
        output_preview: "Written 128 bytes",
      },
    },
  };
}

function agentTraceEvent(payload) {
  return {
    type: EXECUTION_EVENT_TYPE,
    execution_run_id: "execution-1",
    task_id: "task-1",
    event: {
      kind: ExecutionEventKind.AgentTrace,
      data: {
        routine_step: routineStep,
        payload,
      },
    },
  };
}

test("live execution trace events group by routine step run and preserve text preview", async () => {
  const start = traceEnvelopeFromRealtimeEvent(agentTraceEvent(startedEvent()));
  const done = traceEnvelopeFromRealtimeEvent(agentTraceEvent(completedEvent()));

  assert.ok(start);
  assert.ok(done);

  const groups = await buildExecutionTraceGroups([start, done]);
  const group = groups.get("step-run-1");

  assert.ok(group);
  assert.equal(group.routineStep?.step_slug, "implement");
  assert.equal(group.trace.source, "execution");
  assert.equal(group.trace.id, "trace-run-1");
  assert.equal(group.trace.spans.length, 1);
  assert.equal(group.trace.spans[0].kind, "tool");
  assert.equal(group.trace.spans[0].name, "file_write");
  assert.equal(group.trace.spans[0].textPreview, "Writing src/app.tsx");
  assert.equal(group.trace.spans[0].output[0].document.selector, "resources.agents");
  assert.equal(group.trace.spans[0].outputPreview, "Written 128 bytes");
  assert.equal(group.trace.spans[0].status, "completed");
});

test("persisted execution trace rows are sorted by sequence before reducing", async () => {
  const groups = await buildExecutionTraceGroups([
    persistedTraceEvent({ sequence: 2, event: completedEvent() }),
    persistedTraceEvent({ sequence: 1, event: startedEvent() }),
  ]);
  const trace = groups.get("step-run-1")?.trace;

  assert.ok(trace);
  assert.equal(trace.spans.length, 1);
  assert.equal(trace.spans[0].kind, "tool");
  assert.equal(trace.spans[0].status, "completed");
  assert.equal(trace.spans[0].outputPreview, "Written 128 bytes");
  assert.equal(trace.spans[0].startedAt, "2026-01-01T00:00:01.000Z");
  assert.equal(trace.spans[0].completedAt, "2026-01-01T00:00:02.000Z");
});

test("non execution trace realtime events are ignored by the trace adapter", () => {
  assert.equal(
    traceEnvelopeFromRealtimeEvent({
      type: EXECUTION_EVENT_TYPE,
      execution_run_id: "execution-1",
      event: {
        kind: ExecutionEventKind.WorkflowStep,
        data: {
          event_type: "step_started",
          step_name: "plan",
          step_type: "agent",
        },
      },
    }),
    null,
  );
});

test("only canonical lifecycle state triggers terminal execution refresh", () => {
  assert.equal(
    executionRealtimeEventIsTerminal({
      type: EXECUTION_EVENT_TYPE,
      event: { kind: ExecutionEventKind.TaskArtifacts, data: {} },
    }),
    false,
  );
  assert.equal(
    executionRealtimeEventIsTerminal({
      type: EXECUTION_EVENT_TYPE,
      event: { kind: ExecutionEventKind.AgentTrace, data: {} },
    }),
    false,
  );
  assert.equal(
    executionRealtimeEventIsTerminal({
      type: "task.execution_state",
      state: { status: "completed" },
    }),
    true,
  );
});
