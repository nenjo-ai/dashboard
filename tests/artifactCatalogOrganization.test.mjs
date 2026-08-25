import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { artifactCatalogPathError } from "../lib/artifactCatalog.ts";

test("artifact catalog paths share the platform's safe relative-path rules", () => {
  assert.equal(artifactCatalogPathError("Research/2026", "folder"), null);
  assert.equal(artifactCatalogPathError("Research/report.pdf", "file"), null);
  assert.match(artifactCatalogPathError("/Research", "folder"), /relative path/);
  assert.match(artifactCatalogPathError("Research/../Secrets", "folder"), /cannot be/);
  assert.match(artifactCatalogPathError("Research/", "folder"), /relative path/);
});

test("artifact organization uses the minimal folder and catalog-entry resources", async () => {
  const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /export async function createArtifactFolder/);
  assert.match(api, /export async function updateArtifactFolder/);
  assert.match(api, /export async function deleteArtifactFolder/);
  assert.match(api, /export async function putArtifactCatalogEntry/);
  assert.match(api, /artifacts\/folders/);
  assert.match(api, /catalog-entry/);
  assert.match(api, /method: "POST"/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /method: "PUT"/);
  assert.match(api, /limit: "75"/);
  assert.match(api, /search\.set\("cursor", cursor\)/);
});

test("artifact browser exposes create, rename, move, and safe empty-folder deletion", async () => {
  const [page, dialog, toolbar] = await Promise.all([
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactPathDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactBrowserToolbar.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(toolbar, /New folder/);
  assert.match(page, /Rename or move/);
  assert.match(page, /Only empty folders can be deleted/);
  assert.match(page, />Organize</);
  assert.match(page, /useSWRInfinite/);
  assert.match(page, /Load more/);
  assert.match(dialog, /Paths are relative to Artifacts/);
  assert.match(dialog, /artifactCatalogPathError/);
});
