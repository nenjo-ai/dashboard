import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("artifact library uploads files directly into the current folder", async () => {
  const [api, artifactBrowser, attachmentComposer, importDialog] = await Promise.all([
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../components/artifacts/ArtifactAttachmentComposer.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../components/artifacts/ArtifactImportDialog.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(api, /interface UploadArtifactOptions/);
  assert.match(api, /publishPath\?: string/);
  assert.match(api, /publish_path: options\.publishPath \?\? null/);
  assert.match(api, /\["csv", "text\/csv"\]/);
  assert.match(
    api,
    /new TextDecoder\("utf-8", \{ fatal: true \}\)\.decode\(plaintext\)/,
  );
  assert.match(
    api,
    /const mediaType = artifactUploadMediaType\(file, plaintext\)/,
  );
  assert.match(api, /media_type: mediaType/);
  assert.match(api, /artifact\.media_type !== mediaType/);
  assert.match(
    attachmentComposer,
    /uploadArtifact\(attachment\.file, activeOrgId, \{\s*signal: controller\.signal,?\s*\}\)/,
  );

  assert.match(artifactBrowser, /hasScope\("artifacts:write"\)/);
  assert.match(importDialog, /type="file"/);
  assert.match(importDialog, /multiple/);
  assert.match(artifactBrowser, /Promise\.allSettled/);
  assert.match(
    artifactBrowser,
    /publishPath: artifactImportPublishPath/,
  );
  assert.match(artifactBrowser, /preserveFolderStructure/);
  assert.match(artifactBrowser, /await refreshArtifactCatalogs\(\)/);
  assert.match(artifactBrowser, /navigate\(parentPath\(uploaded\[0\]\.publishPath\), uploaded\[0\]\.artifact\.id\)/);
  assert.match(artifactBrowser, /Upload artifacts/);
  assert.match(artifactBrowser, /Import folder/);
});
