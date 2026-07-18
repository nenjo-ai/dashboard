import assert from "node:assert/strict";
import test from "node:test";

import {
  executionStatusMayChangeTask,
  partitionTasksByDispatch,
  scheduledTaskControl,
  scheduledTaskStateLabel,
  taskCategoryIsRunnable,
  taskEditorHasChanges,
  taskExecutionIsActive,
} from "../lib/taskLifecycle.ts";

test("Todo and In Progress are the only runnable task categories", () => {
  assert.equal(taskCategoryIsRunnable("unstarted"), true);
  assert.equal(taskCategoryIsRunnable("started"), true);
  assert.equal(taskCategoryIsRunnable("backlog"), false);
  assert.equal(taskCategoryIsRunnable("completed"), false);
  assert.equal(taskCategoryIsRunnable("canceled"), false);
});

test("task lists separate server-derived manual and scheduled dispatch", () => {
  const manual = { id: "manual", dispatch: { mode: "manual" } };
  const queued = { id: "queued", dispatch: { mode: "scheduled", state: "queued" } };
  const paused = { id: "paused", dispatch: { mode: "scheduled", state: "paused" } };
  const running = { id: "running", dispatch: { mode: "scheduled", state: "running" } };
  const partitioned = partitionTasksByDispatch([manual, queued, paused, running]);

  assert.deepEqual(partitioned.manual.map((task) => task.id), ["manual"]);
  assert.deepEqual(partitioned.scheduled.map((task) => task.id), ["queued", "paused", "running"]);
  assert.equal(scheduledTaskStateLabel(queued), "Queued");
  assert.equal(scheduledTaskStateLabel(paused), "Paused");
  assert.equal(scheduledTaskStateLabel(running), "Running");
});

test("queued execution remains active and visible to the task detail", () => {
  for (const status of ["pending", "queued", "running", "paused"]) {
    assert.equal(taskExecutionIsActive(status), true);
  }
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.equal(taskExecutionIsActive(status), false);
  }
});

test("worker running and terminal states refresh task workflow state", () => {
  assert.equal(executionStatusMayChangeTask("queued"), false);
  assert.equal(executionStatusMayChangeTask("running"), true);
  assert.equal(executionStatusMayChangeTask("completed"), true);
});

test("scheduled task controls only pause queued schedules and resume paused schedules", () => {
  assert.equal(scheduledTaskControl(true, "queued"), "pause");
  assert.equal(scheduledTaskControl(false, "queued"), "resume");
  assert.equal(scheduledTaskControl(false, "paused"), "resume");
  assert.equal(scheduledTaskControl(true, "paused"), null);
  assert.equal(scheduledTaskControl(false, "running"), null);
  assert.equal(scheduledTaskControl(true, "running"), null);
  assert.equal(scheduledTaskControl(true, undefined), null);
});

test("task editor only becomes dirty when persisted fields change", () => {
  const task = {
    title: "Review alerts",
    instructions: "Summarize failures",
    status: { id: "todo" },
    priority: "medium",
    project_id: null,
    assignee_user_id: "user-1",
    execution_target: { type: "agent", id: "agent-1" },
    labels: [{ id: "ops" }, { id: "daily" }],
  };
  const draft = {
    title: "Review alerts",
    instructions: "Summarize failures",
    statusId: "todo",
    priority: "medium",
    projectId: "",
    target: "agent:agent-1",
    labelIds: ["daily", "ops"],
  };

  assert.equal(taskEditorHasChanges(task, draft), false);
  assert.equal(taskEditorHasChanges(task, { ...draft, title: "Review alerts " }), false);
  assert.equal(taskEditorHasChanges(task, { ...draft, priority: "high" }), true);
  assert.equal(taskEditorHasChanges(task, { ...draft, labelIds: ["ops"] }), true);
});
