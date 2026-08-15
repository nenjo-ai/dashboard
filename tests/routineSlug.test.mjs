import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRoutineSlug,
  ROUTINE_SLUG_MAX_LENGTH,
  withRoutineCreationSlug,
} from "../lib/routineSlug.ts";
import {
  buildCreateRoutineConfigureRequest,
  buildUpdateRoutineConfigureRequest,
} from "../lib/routineConfigure.ts";

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

test("routine creation places the slug in platform metadata", () => {
  assert.deepEqual(
    buildCreateRoutineConfigureRequest({
      id: "routine-id",
      name: "Release Approval",
      description: "Gate releases",
      metadata: { owner: "release-team" },
    }),
    {
      id: "routine-id",
      metadata: {
        slug: "release-approval",
        name: "Release Approval",
        description: "Gate releases",
      },
      runtime_metadata: { owner: "release-team" },
    },
  );
});

test("routine updates do not derive a new slug from a renamed routine", () => {
  assert.deepEqual(
    buildUpdateRoutineConfigureRequest("routine-id", { name: "Renamed Routine" }),
    {
      routine: "routine-id",
      metadata: { name: "Renamed Routine" },
    },
  );
});
