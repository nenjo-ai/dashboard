import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filterAndSortRoutines,
  summarizeRoutineWorkspace,
} from "../lib/routineWorkspace.ts";

function routine(overrides) {
  return {
    id: overrides.id,
    project_id: null,
    slug: overrides.slug,
    name: overrides.name,
    description: overrides.description ?? null,
    is_default: false,
    step_count: overrides.step_count ?? 0,
    entry_steps: [],
    last_run_at: overrides.last_run_at ?? null,
    next_run_at: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: overrides.updated_at,
  };
}

const routines = [
  routine({ id: "review", slug: "review-code", name: "Code review", description: "Review pull requests", step_count: 4, updated_at: "2026-08-22T00:00:00.000Z" }),
  routine({ id: "release", slug: "release-check", name: "Release check", description: "Verify a deployment", step_count: 2, updated_at: "2026-08-24T00:00:00.000Z", last_run_at: "2026-08-25T00:00:00.000Z" }),
  routine({ id: "brief", slug: "daily-brief", name: "Daily brief", description: "Summarize current work", step_count: 4, updated_at: "2026-08-23T00:00:00.000Z" }),
];

test("routine workspace search covers names, descriptions, and stable slugs", () => {
  assert.deepEqual(filterAndSortRoutines(routines, "pull request", "updated").map((item) => item.id), ["review"]);
  assert.deepEqual(filterAndSortRoutines(routines, "daily-brief", "updated").map((item) => item.id), ["brief"]);
});

test("routine sorting is deterministic and never mutates SWR data", () => {
  assert.deepEqual(filterAndSortRoutines(routines, "", "updated").map((item) => item.id), ["release", "brief", "review"]);
  assert.deepEqual(filterAndSortRoutines(routines, "", "name").map((item) => item.id), ["review", "brief", "release"]);
  assert.deepEqual(filterAndSortRoutines(routines, "", "steps").map((item) => item.id), ["review", "brief", "release"]);
  assert.equal(routines[0].id, "review");
});

test("routine workspace summary derives from the authoritative collection", () => {
  assert.deepEqual(summarizeRoutineWorkspace(routines), {
    routines: 3,
    steps: 10,
    previouslyRun: 1,
  });
});

test("routine detail keeps workflow, activity, and tasks on explicit URL tabs", async () => {
  const detail = await readFile(new URL("../app/dashboard/routines/[id]/RoutineDetailClient.tsx", import.meta.url), "utf8");
  assert.match(detail, /\["workflow", "activity", "tasks"\]/);
  assert.match(detail, /useTabParam<RoutineTab>/);
  assert.match(detail, /activeTab === "workflow"/);
  assert.match(detail, /activeTab === "activity"/);
  assert.match(detail, /activeTab === "tasks"/);
});

test("workflow saving uses the shared calm progress indicator", async () => {
  const editor = await readFile(new URL("../components/routine/RoutineEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /isLoading=\{saving\}/);
  assert.doesNotMatch(editor, /animate-spin/);
  assert.match(editor, /aria-live="polite"/);
});
