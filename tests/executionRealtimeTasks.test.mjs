import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeExecutionRealtimeEventIntoTasks,
  replayExecutionRealtimeEventsIntoTasks,
  splitReplayableExecutionRealtimeEvents,
  taskStepFromRealtimeEvent,
} from "../lib/executionRealtimeTasks.ts";
import { EXECUTION_EVENT_TYPE, ExecutionEventKind } from "../lib/executionEvents.ts";
import { buildRoutineDisplaySteps } from "../lib/routineStepEvents.ts";

function task(overrides = {}) {
  return {
    id: "task-1",
    title: "Implement OAuth",
    slug: "implement-oauth",
    status: "assigned",
    routine_id: "routine-1",
    current_step: null,
    steps: [],
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function routine() {
  return {
    id: "routine-1",
    steps: [
      {
        id: "step-implement-id",
        slug: "implement",
        name: "implement",
        step_type: "agent",
        order_index: 0,
      },
    ],
  };
}

function workflowStepEvent(step) {
  const workflow = {
    event_type: step.event_type,
    step_name: step.step_name,
    step_type: step.step_type,
    duration_ms: step.duration_ms,
    data: step.data ?? {},
    payload: step.payload,
    encrypted_payload: step.encrypted_payload,
    agent: step.agent ?? step.data?.agent,
  };

  return {
    type: EXECUTION_EVENT_TYPE,
    execution_run_id: step.execution_run_id ?? "execution-1",
    task_id: step.task_id,
    created_at: step.created_at,
    event: {
      kind: ExecutionEventKind.WorkflowStep,
      data: workflow,
    },
  };
}

function taskCompletedEvent(event) {
  return {
    type: EXECUTION_EVENT_TYPE,
    execution_run_id: event.execution_run_id ?? "execution-1",
    task_id: event.task_id,
    created_at: event.created_at ?? event.completed_at,
    event: {
      kind: ExecutionEventKind.TaskCompleted,
      data: {
        success: event.success,
        error: event.error,
        merge_error: event.merge_error,
        total_input_tokens: event.total_input_tokens ?? 0,
        total_output_tokens: event.total_output_tokens ?? 0,
      },
    },
  };
}

test("workflow step event is converted to visible task progress", () => {
  const step = taskStepFromRealtimeEvent(
    workflowStepEvent({
      task_id: "task-1",
      event_type: "step_started",
      step_name: "implement",
      step_type: "agent",
      created_at: "2026-01-01T00:00:00.000Z",
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        agent: {
          agent: "code-implementer",
          agent_name: "Code Implementer",
          agent_color: "#2563eb",
        },
      },
    }),
    "2026-01-01T00:00:01.000Z",
  );

  assert.equal(step?.step_name, "implement");
  assert.equal(step?.status, "running");
  assert.equal(step?.agent?.agent_name, "Code Implementer");
});

test("workflow step event updates the visible task list immediately", () => {
  const updated = mergeExecutionRealtimeEventIntoTasks(
    [task()],
    workflowStepEvent({
      task_id: "task-1",
      event_type: "step_started",
      step_name: "plan",
      step_type: "agent",
      created_at: "2026-01-01T00:00:00.000Z",
      data: { step_slug: "plan", step_run_id: "run-plan" },
    }),
  );

  assert.equal(updated?.[0].status, "in_progress");
  assert.equal(updated?.[0].steps.length, 1);
  assert.equal(updated?.[0].steps[0].step_name, "plan");
  assert.equal(updated?.[0].current_step?.step_name, "plan");
});

test("early workflow step event can be replayed after task hydration", () => {
  const earlyEvent = workflowStepEvent({
    task_id: "task-1",
    event_type: "step_started",
    step_name: "plan",
    step_type: "agent",
    created_at: "2026-01-01T00:00:00.000Z",
    data: { step_slug: "plan", step_run_id: "run-plan" },
  });

  const beforeHydration = splitReplayableExecutionRealtimeEvents(undefined, [
    earlyEvent,
  ]);
  assert.equal(beforeHydration.replayable.length, 0);
  assert.equal(beforeHydration.pending.length, 1);

  const afterHydration = splitReplayableExecutionRealtimeEvents([task()], [
    earlyEvent,
  ]);
  assert.equal(afterHydration.replayable.length, 1);
  assert.equal(afterHydration.pending.length, 0);

  const updated = replayExecutionRealtimeEventsIntoTasks(
    [task()],
    afterHydration.replayable,
  );

  assert.equal(updated?.[0].status, "in_progress");
  assert.equal(updated?.[0].current_step?.step_name, "plan");
  assert.equal(updated?.[0].steps[0].event_type, "step_started");
});

test("task completed event updates task status without dropping steps", () => {
  const updated = mergeExecutionRealtimeEventIntoTasks(
    [
      task({
        status: "in_progress",
        steps: [
          {
            step_name: "plan",
            step_type: "agent",
            status: "running",
            event_type: "step_started",
            created_at: "2026-01-01T00:00:00.000Z",
            started_at: "2026-01-01T00:00:00.000Z",
            completed_at: null,
            duration_ms: null,
            data: {},
            payload: null,
            encrypted_payload: null,
            agent: null,
          },
        ],
      }),
    ],
    taskCompletedEvent({
      task_id: "task-1",
      success: true,
      completed_at: "2026-01-01T00:00:03.000Z",
    }),
  );

  assert.equal(updated?.[0].status, "done");
  assert.equal(updated?.[0].current_step, null);
  assert.equal(updated?.[0].steps.length, 1);
});

test("scoped tool event updates current step to the parent routine step", () => {
  const updated = mergeExecutionRealtimeEventIntoTasks(
    [task({ status: "in_progress" })],
    workflowStepEvent({
      task_id: "task-1",
      event_type: "tool_started",
      step_name: "file_write",
      step_type: "tool",
      created_at: "2026-01-01T00:00:01.000Z",
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        tool_call_id: "tool-1",
      },
    }),
  );

  assert.equal(updated?.[0].current_step?.step_name, "implement");
  assert.equal(updated?.[0].current_step?.step_type, "agent");
  assert.equal(updated?.[0].steps[0].step_name, "file_write");
});

test("tool completion updates the matching realtime tool row", () => {
  const events = [
    workflowStepEvent({
      task_id: "task-1",
      event_type: "step_started",
      step_name: "implement",
      step_type: "agent",
      created_at: "2026-01-01T00:00:00.000Z",
      data: { step_slug: "implement", step_run_id: "run-implement" },
    }),
    workflowStepEvent({
      task_id: "task-1",
      event_type: "tool_started",
      step_name: "file_write",
      step_type: "tool",
      created_at: "2026-01-01T00:00:01.000Z",
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        tool_call_id: "tool-1",
      },
    }),
    workflowStepEvent({
      task_id: "task-1",
      event_type: "tool_completed",
      step_name: "file_write",
      step_type: "tool",
      created_at: "2026-01-01T00:00:02.000Z",
      duration_ms: 1000,
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        tool_call_id: "tool-1",
      },
    }),
  ];

  const updated = replayExecutionRealtimeEventsIntoTasks(
    [task({ status: "in_progress" })],
    events,
  );

  assert.equal(updated?.[0].steps.length, 2);
  assert.equal(updated?.[0].steps[0].step_name, "implement");
  assert.equal(updated?.[0].steps[0].event_type, "step_started");
  assert.equal(updated?.[0].steps[1].step_name, "file_write");
  assert.equal(updated?.[0].steps[1].event_type, "tool_completed");
  assert.equal(updated?.[0].steps[1].status, "passed");
  assert.equal(updated?.[0].current_step?.step_name, "implement");

  const display = buildRoutineDisplaySteps(updated?.[0].steps ?? [], routine());
  assert.equal(display.length, 1);
  assert.equal(display[0].step.step_name, "implement");
  assert.equal(display[0].step.status, "running");
  assert.equal(display[0].children.length, 1);
  assert.equal(display[0].children[0].step_name, "file_write");
  assert.equal(display[0].children[0].event_type, "tool_completed");
  assert.equal(display[0].children[0].status, "passed");
});

test("batched tool completion updates the matching realtime tool batch row", () => {
  const events = [
    workflowStepEvent({
      task_id: "task-1",
      event_type: "tool_started",
      step_name: "tool_batch",
      step_type: "tool",
      created_at: "2026-01-01T00:00:01.000Z",
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        tool_names: ["file_read", "file_write"],
        tool_call_ids: ["tool-1", "tool-2"],
      },
    }),
    workflowStepEvent({
      task_id: "task-1",
      event_type: "tool_completed",
      step_name: "tool_batch",
      step_type: "tool",
      created_at: "2026-01-01T00:00:02.000Z",
      data: {
        step_slug: "implement",
        step_run_id: "run-implement",
        tool_names: ["file_read", "file_write"],
        tool_call_ids: ["tool-1", "tool-2"],
      },
    }),
  ];

  const updated = replayExecutionRealtimeEventsIntoTasks(
    [task({ status: "in_progress" })],
    events,
  );

  assert.equal(updated?.[0].steps.length, 1);
  assert.equal(updated?.[0].steps[0].event_type, "tool_completed");
  assert.equal(updated?.[0].steps[0].status, "passed");

  const display = buildRoutineDisplaySteps(updated?.[0].steps ?? [], routine());
  assert.equal(display[0].children.length, 2);
  assert.deepEqual(
    display[0].children.map((child) => child.event_type),
    ["tool_completed", "tool_completed"],
  );
});

test("completed parent step clears stale current step badge", () => {
  const updated = mergeExecutionRealtimeEventIntoTasks(
    [
      task({
        status: "in_progress",
        current_step: {
          step_name: "plan",
          step_type: "agent",
          status: "running",
          event_type: "step_started",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ],
    workflowStepEvent({
      task_id: "task-1",
      event_type: "step_completed",
      step_name: "plan",
      step_type: "agent",
      created_at: "2026-01-01T00:00:02.000Z",
      data: { step_slug: "plan", step_run_id: "run-plan" },
    }),
  );

  assert.equal(updated?.[0].current_step, null);
  assert.equal(updated?.[0].steps[0].status, "passed");
});

test("started event after a terminal step run is kept as a new visible attempt", () => {
  const updated = mergeExecutionRealtimeEventIntoTasks(
    [
      task({
        status: "in_progress",
        steps: [
          {
            step_name: "review_gate",
            step_type: "gate",
            status: "passed",
            event_type: "step_completed",
            created_at: "2026-01-01T00:00:02.000Z",
            started_at: "2026-01-01T00:00:00.000Z",
            completed_at: "2026-01-01T00:00:02.000Z",
            duration_ms: 2000,
            data: { step_slug: "review_gate", step_run_id: "run-review" },
            payload: null,
            encrypted_payload: null,
            agent: null,
          },
        ],
      }),
    ],
    workflowStepEvent({
      task_id: "task-1",
      event_type: "step_started",
      step_name: "review_gate",
      step_type: "gate",
      created_at: "2026-01-01T00:00:05.000Z",
      data: { step_slug: "review_gate", step_run_id: "run-review" },
    }),
  );

  assert.equal(updated?.[0].steps.length, 2);
  assert.equal(updated?.[0].steps[0].status, "passed");
  assert.equal(updated?.[0].steps[1].status, "running");
  assert.equal(updated?.[0].current_step?.step_name, "review_gate");
});
