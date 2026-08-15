import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("artifact library uploads files directly into the current folder", async () => {
  const [api, artifactBrowser, attachmentComposer] = await Promise.all([
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactAttachmentComposer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(api, /interface UploadArtifactOptions/);
  assert.match(api, /publishPath\?: string/);
  assert.match(api, /publish_path: options\.publishPath \?\? null/);
  assert.match(attachmentComposer, /uploadArtifact\(attachment\.file, activeOrgId, \{ signal: controller\.signal \}\)/);

  assert.match(artifactBrowser, /hasScope\("artifacts:write"\)/);
  assert.match(artifactBrowser, /type="file"/);
  assert.match(artifactBrowser, /multiple/);
  assert.match(artifactBrowser, /Promise\.allSettled/);
  assert.match(artifactBrowser, /publishPath: uploadPath \? `\$\{uploadPath\}\/\$\{file\.name\}` : file\.name/);
  assert.match(artifactBrowser, /await refreshCatalog\(\)/);
  assert.match(artifactBrowser, /navigate\(uploadPath, uploaded\[0\]\.id\)/);
  assert.match(artifactBrowser, /Upload artifacts/);
});
