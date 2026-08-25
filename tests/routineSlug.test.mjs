import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRoutineSlug,
  ROUTINE_SLUG_MAX_LENGTH,
  withRoutineCreationSlug,
} from "../lib/routineSlug.ts";
import { buildRoutineGraphConfigureRequest } from "../lib/routineConfigure.ts";

test("routine slugs mirror the Rust derivation rules", () => {
  assert.equal(deriveRoutineSlug("Release Approval"), "release-approval");
  assert.equal(deriveRoutineSlug("  Core__ Pack--v2!  "), "core_pack-v2");
  assert.equal(deriveRoutineSlug("Crème brûlée"), "crme-brle");
});

test("routine slugs have a valid fallback and platform length boundary", () => {
  assert.equal(deriveRoutineSlug("🎉 !!!"), "slug");
  assert.equal(
    deriveRoutineSlug(`${"a".repeat(ROUTINE_SLUG_MAX_LENGTH)} trailing`),
    "a".repeat(ROUTINE_SLUG_MAX_LENGTH),
  );
  assert.equal(
    deriveRoutineSlug(`${"a".repeat(ROUTINE_SLUG_MAX_LENGTH - 1)} `),
    "a".repeat(ROUTINE_SLUG_MAX_LENGTH - 1),
  );
});

test("routine creation derives a slug without mutating the request", () => {
  const request = { name: "Release Approval", description: "Gate releases" };

  assert.deepEqual(withRoutineCreationSlug(request), {
    ...request,
    slug: "release-approval",
  });
  assert.equal("slug" in request, false);
});

test("routine creation preserves and trims an explicit slug", () => {
  assert.deepEqual(
    withRoutineCreationSlug({ name: "Display Name", slug: "  stable_identity  " }),
    { name: "Display Name", slug: "stable_identity" },
  );
});

test("routine graph configure request uses the canonical flat shape", () => {
  const steps = [{
    slug: "done",
    name: "Done",
    step_type: "terminal",
    order_index: 0,
  }];
  const edges = [{
    source_step: "review",
    target_step: "implement",
    condition: "on_fail",
    purpose: "Return findings for rework",
    handoff_instructions: "Include required fixes",
    handoff_schema: { type: "object", additionalProperties: false },
    max_retries: 2,
  }];
  assert.deepEqual(
    buildRoutineGraphConfigureRequest({
      slug: "release-approval",
      name: "Release Approval",
      description: "Gate releases",
      project_id: null,
      entry_steps: ["done"],
      steps,
      edges,
    }, steps),
    {
      slug: "release-approval",
      name: "Release Approval",
      description: "Gate releases",
      project_id: null,
      entry_steps: ["done"],
      steps,
      edges,
    },
  );
});

test("routine graph configure request does not expose legacy metadata wrappers", () => {
  const request = buildRoutineGraphConfigureRequest({
    slug: "stable-routine",
    name: "Renamed Routine",
    description: null,
    project_id: null,
    entry_steps: ["done"],
    steps: [],
    edges: [],
  }, []);

  for (const removed of ["routine", "metadata", "runtime_metadata", "graph", "is_active", "max_retries"]) {
    assert.equal(removed in request, false);
  }
});
