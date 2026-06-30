import assert from "node:assert/strict";
import test from "node:test";

import { buildRoutineDisplaySteps } from "../lib/routineStepEvents.ts";

function at(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function routine() {
  return {
    id: "routine-1",
    steps: [
      {
        id: "step-plan-id",
        slug: "plan",
        name: "plan",
        step_type: "agent",
        order_index: 0,
      },
      {
        id: "step-implement-id",
        slug: "implement",
        name: "implement",
        step_type: "agent",
        order_index: 1,
      },
    ],
  };
}

function step(overrides) {
  return {
    step_name: "plan",
    step_type: "agent",
    status: "running",
    event_type: "step_started",
    created_at: at(0),
    started_at: at(0),
    completed_at: null,
    duration_ms: null,
    data: {},
    payload: null,
    encrypted_payload: null,
    agent: null,
    ...overrides,
  };
}

test("routine display groups lifecycle rows and scoped tools under the actual routine step", () => {
  const display = buildRoutineDisplaySteps(
    [
      step({
        event_type: "step_started",
        step_name: "plan",
        step_type: "agent",
        data: { step_slug: "plan", step_run_id: "run-plan" },
      }),
      step({
        event_type: "tool_started",
        step_name: "file_write",
        step_type: "tool",
        data: {
          step_slug: "plan",
          step_run_id: "run-plan",
          tool_call_id: "tool-1",
          tool_args: '{"path":"plan.md"}',
        },
        agent: {
          agent: "planner-agent",
          agent_name: "Code Planner",
          agent_color: "#2563eb",
        },
      }),
      step({
        event_type: "tool_completed",
        step_name: "file_write",
        step_type: "tool",
        status: "passed",
        data: {
          step_slug: "plan",
          step_run_id: "run-plan",
          tool_call_id: "tool-1",
        },
      }),
      step({
        event_type: "step_completed",
        step_name: "plan",
        step_type: "",
        status: "passed",
        completed_at: at(4),
        duration_ms: 4000,
        data: { step_slug: "plan", step_run_id: "run-plan" },
      }),
    ],
    routine(),
  );

  assert.equal(display.length, 2);
  assert.equal(display[0].step.step_name, "plan");
  assert.equal(display[0].step.step_type, "agent");
  assert.equal(display[0].step.event_type, "step_completed");
  assert.equal(display[0].children.length, 1);
  assert.equal(display[0].children[0].step_name, "file_write");
  assert.equal(display[0].children[0].event_type, "tool_completed");
  assert.equal(display[1].step.step_name, "implement");
  assert.equal(display[1].step.status, "pending");
  assert.equal(display[1].step.data.placeholder, true);
});

test("routine display creates an implicit routine parent from scoped tool activity", () => {
  const display = buildRoutineDisplaySteps(
    [
      step({
        event_type: "tool_started",
        step_name: "file_read",
        step_type: "tool",
        data: {
          step_slug: "implement",
          step_run_id: "run-implement",
          tool_call_id: "tool-2",
        },
        agent: {
          agent: "implementer-agent",
          agent_name: "Code Implementer",
          agent_color: "#9333ea",
        },
      }),
    ],
    routine(),
  );

  assert.equal(display.length, 2);
  assert.equal(display[0].step.step_name, "plan");
  assert.equal(display[0].step.status, "pending");
  assert.equal(display[1].step.step_name, "implement");
  assert.equal(display[1].step.step_type, "agent");
  assert.equal(display[1].step.status, "running");
  assert.equal(display[1].children.length, 1);
  assert.equal(display[1].children[0].step_name, "file_read");
});

test("routine display promotes a placeholder parent from completed scoped tool activity", () => {
  const display = buildRoutineDisplaySteps(
    [
      step({
        event_type: "tool_completed",
        step_name: "file_write",
        step_type: "tool",
        status: "passed",
        data: {
          step_slug: "implement",
          step_run_id: "run-implement",
          tool_call_id: "tool-3",
        },
        agent: {
          agent: "implementer-agent",
          agent_name: "Code Implementer",
          agent_color: "#9333ea",
        },
      }),
    ],
    routine(),
  );

  assert.equal(display.length, 2);
  assert.equal(display[1].step.step_name, "implement");
  assert.equal(display[1].step.status, "running");
  assert.equal(display[1].step.event_type, "step_started");
  assert.equal(display[1].step.data.placeholder, undefined);
  assert.equal(display[1].children.length, 1);
  assert.equal(display[1].children[0].event_type, "tool_completed");
});

test("routine display includes routine and worktree placeholders before progress arrives", () => {
  const display = buildRoutineDisplaySteps([], routine(), {
    includeWorktreePlaceholders: true,
  });

  assert.deepEqual(
    display.map((group) => group.step.step_name),
    ["worktree_setup", "plan", "implement", "worktree_cleanup"],
  );
  assert.deepEqual(
    display.map((group) => group.step.status),
    ["pending", "pending", "pending", "pending"],
  );
});

test("routine display shows a loopback attempt on the original routine row", () => {
  const display = buildRoutineDisplaySteps(
    [
      step({
        event_type: "step_started",
        step_name: "plan",
        step_type: "agent",
        created_at: at(1),
        data: { step_slug: "plan", step_run_id: "run-plan-1" },
      }),
      step({
        event_type: "step_completed",
        step_name: "plan",
        step_type: "agent",
        status: "passed",
        created_at: at(2),
        completed_at: at(2),
        data: { step_slug: "plan", step_run_id: "run-plan-1" },
      }),
      step({
        event_type: "step_started",
        step_name: "implement",
        step_type: "agent",
        created_at: at(3),
        data: { step_slug: "implement", step_run_id: "run-implement" },
      }),
      step({
        event_type: "step_completed",
        step_name: "implement",
        step_type: "agent",
        status: "passed",
        created_at: at(4),
        completed_at: at(4),
        data: { step_slug: "implement", step_run_id: "run-implement" },
      }),
      step({
        event_type: "step_started",
        step_name: "plan",
        step_type: "agent",
        created_at: at(5),
        data: { step_slug: "plan", step_run_id: "run-plan-2" },
      }),
    ],
    routine(),
  );

  assert.deepEqual(
    display.map((group) => group.step.step_name),
    ["plan", "implement"],
  );
  assert.equal(display[0].step.status, "running");
  assert.equal(display[1].step.status, "passed");
  assert.equal(display[0].attemptLabel, "loopback attempt 2 after implement");
  assert.equal(display[0].step.data.step_run_id, "run-plan-2");
});
