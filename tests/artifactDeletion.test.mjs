import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("artifact deletion is explicit, permission-gated, and clears stale selection", async () => {
  const [api, artifactBrowser, artifactViewer] = await Promise.all([
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactViewer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(api, /export async function deleteArtifact/);
  assert.match(api, /artifacts\/\$\{encodeURIComponent\(artifactId\)\}/);
  assert.match(api, /method: "DELETE"/);
  assert.match(artifactBrowser, /hasScope\("artifacts:write"\)/);
  assert.match(artifactBrowser, /<ConfirmDialog/);
  assert.match(artifactBrowser, /complete revision history/);
  assert.match(artifactBrowser, /revisionCount === 1/);
  assert.match(artifactBrowser, /await deleteArtifact\(selectedArtifactId\)/);
  assert.match(artifactBrowser, /evictLoadedArtifacts/);
  assert.match(artifactBrowser, /chatArtifactCacheContainsAny/);
  assert.match(artifactBrowser, /withoutDeletedArtifactDetails/);
  assert.match(artifactBrowser, /router\.replace/);
  assert.match(artifactBrowser, /await refreshArtifactCatalogs\(\)/);
  assert.match(artifactViewer, /actions\?: ReactNode/);
  assert.match(artifactViewer, /\{actions\}/);
  assert.match(artifactViewer, /artifact\?\.content\.fill\(0\)/);
});
