import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OFFICIAL_NENJO_PACKAGE_SOURCE,
  officialNenjoPackageReference,
} from "../lib/officialNenjoPackageSource.ts";

test("fresh onboarding installs official packages from the configured reference", () => {
  assert.deepEqual(OFFICIAL_NENJO_PACKAGE_SOURCE.metadata.source, {
    kind: "git",
    url: "https://github.com/nenjo-ai/packages.git",
    reference: officialNenjoPackageReference(),
    manifest_path: "packages.yaml",
  });
});

test("onboarding package reference defaults to main and accepts an override", () => {
  assert.equal(officialNenjoPackageReference(undefined), "main");
  assert.equal(
    officialNenjoPackageReference("feat/human-review-and-artifacts"),
    "feat/human-review-and-artifacts",
  );
  assert.equal(officialNenjoPackageReference("   "), "main");
});

test("Packages page does not recreate a deleted official package source", async () => {
  const page = await readFile(
    new URL("../app/dashboard/packages/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(page, /ensureOfficialNenjoPackageSource/);
});
