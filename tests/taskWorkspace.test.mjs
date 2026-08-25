import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { selectTaskWorkspaceTasks, summarizeTaskWorkspace } from "../lib/taskWorkspace.ts";

const task = (id, overrides = {}) => ({
  id,
  identifier: id.toUpperCase(),
  title: id,
  project_slug: null,
  labels: [],
  status: { category: "unstarted" },
  dispatch: { mode: "manual" },
  updated_at: "2026-08-24T12:00:00.000Z",
  ...overrides,
});

test("task workspace summary keeps lifecycle signals explicit", () => {
  const summary = summarizeTaskWorkspace([
    task("ready"),
    task("active", { status: { category: "started" } }),
    task("scheduled", { dispatch: { mode: "scheduled", state: "queued" } }),
    task("running", { status: { category: "started" }, dispatch: { mode: "scheduled", state: "running" } }),
    task("done", { status: { category: "completed" } }),
  ]);

  assert.deepEqual(summary, {
    totalCount: 5,
    inProgressCount: 2,
    readyCount: 2,
    scheduledCount: 2,
    completedCount: 1,
  });
});

test("task workspace view searches across stable row metadata and prioritizes live work", () => {
  const tasks = [
    task("manual-old", { title: "Review API", updated_at: "2026-08-20T12:00:00.000Z" }),
    task("manual-new", { title: "Write docs", project_slug: "launch", labels: [{ name: "API" }], updated_at: "2026-08-24T12:00:00.000Z" }),
    task("scheduled", { title: "Nightly check", dispatch: { mode: "scheduled", state: "queued" } }),
    task("running", { title: "Agent sync", dispatch: { mode: "scheduled", state: "running" } }),
  ];

  assert.deepEqual(selectTaskWorkspaceTasks(tasks, "scheduled", "").map(({ id }) => id), ["running", "scheduled"]);
  assert.deepEqual(selectTaskWorkspaceTasks(tasks, "all", "api").map(({ id }) => id), ["manual-new", "manual-old"]);
  assert.deepEqual(selectTaskWorkspaceTasks(tasks, "manual", "launch").map(({ id }) => id), ["manual-new"]);
});

test("task detail owns one active trace and keeps schedule settings mounted", async () => {
  const [source, masthead] = await Promise.all([
    readFile(new URL("../components/tasks/TaskDetailClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/tasks/TaskMasthead.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /historicalRuns = executions\?\.filter\(\(run\) => run\.id !== activeRun\?\.id\)/);
  assert.match(source, /<TaskActiveRun/);
  assert.match(source, /<TaskExecutionHistory executions=\{historicalRuns\}/);
  assert.match(source, /settingsVisited/);
  assert.match(source, /Unsaved changes/);
  assert.match(masthead, /Save & run/);
});
