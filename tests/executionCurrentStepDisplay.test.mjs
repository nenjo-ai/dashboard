import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutionCurrentStepBadge } from "../components/project/ExecutionCurrentStep.ts";
import { currentExecutionTaskStep } from "../lib/routineStepEvents.ts";

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

function task(overrides) {
  return {
    id: "task-1",
    title: "Implement OAuth",
    slug: "implement-oauth",
    status: "running",
    routine_id: "routine-1",
    current_step: null,
    steps: [],
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function step(overrides) {
  return {
    step_name: "implement",
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

test("current step display prefers backend current_step and renders the row badge", () => {
  const current = currentExecutionTaskStep(
    task({
      current_step: {
        step_name: "implement",
        step_type: "agent",
        status: "running",
        event_type: "step_started",
        created_at: at(1),
        agent: {
          agent: "code-implementer",
          agent_name: "Code Implementer",
          agent_color: "#2563eb",
        },
      },
    }),
    routine(),
  );

  assert.equal(current?.step_name, "implement");
  assert.equal(current?.agent_name, "Code Implementer");

  const markup = renderToStaticMarkup(
    createElement(ExecutionCurrentStepBadge, { step: current }),
  );
  assert.match(markup, /Current step/);
  assert.match(markup, /implement/);
  assert.match(markup, /Code Implementer/);
});

test("current step display derives the routine step from scoped tool activity", () => {
  const current = currentExecutionTaskStep(
    task({
      steps: [
        step({
          event_type: "tool_started",
          step_name: "file_write",
          step_type: "tool",
          data: {
            step_slug: "implement",
            step_run_id: "run-implement",
            tool_call_id: "tool-1",
          },
          agent: {
            agent: "code-implementer",
            agent_name: "Code Implementer",
            agent_color: "#2563eb",
          },
        }),
      ],
    }),
    routine(),
  );

  assert.equal(current?.step_name, "implement");
  assert.equal(current?.step_type, "agent");
  assert.equal(current?.status, "running");

  const markup = renderToStaticMarkup(
    createElement(ExecutionCurrentStepBadge, { step: current }),
  );
  assert.match(markup, /Current step/);
  assert.match(markup, /implement/);
});

test("current step display hides for terminal tasks", () => {
  const current = currentExecutionTaskStep(
    task({
      status: "completed",
      current_step: {
        step_name: "done",
        step_type: "terminal",
        status: "passed",
        event_type: "step_completed",
        created_at: at(2),
      },
    }),
    routine(),
  );

  assert.equal(current, null);
  assert.equal(
    renderToStaticMarkup(createElement(ExecutionCurrentStepBadge, { step: current })),
    "",
  );
});

test("current step display ignores pending routine placeholders", () => {
  const current = currentExecutionTaskStep(
    task({
      status: "queued",
      steps: [],
    }),
    routine(),
  );

  assert.equal(current, null);
});
