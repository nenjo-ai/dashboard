import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  artifactFolderNameError,
  artifactImportPublishPath,
  artifactImportRelativePath,
  joinArtifactCatalogPath,
} from "../lib/artifactCatalog.ts";

test("artifact imports can target a new subfolder under the current catalog path", () => {
  assert.equal(joinArtifactCatalogPath("Research", "2026", "report.pdf"), "Research/2026/report.pdf");
  assert.equal(artifactImportPublishPath(
    { name: "report.pdf" },
    { currentPath: "Research", newSubfolder: "Reviewed" },
  ), "Research/Reviewed/report.pdf");
});

test("local folder imports preserve nested relative paths", () => {
  const file = { name: "notes.md", webkitRelativePath: "Launch/Research/notes.md" };
  assert.equal(artifactImportRelativePath(file, true), "Launch/Research/notes.md");
  assert.equal(artifactImportPublishPath(file, {
    currentPath: "Projects",
    preserveFolderStructure: true,
  }), "Projects/Launch/Research/notes.md");
  assert.equal(artifactImportRelativePath(file, false), "notes.md");
});

test("folder import paths reject server-invalid path segments before uploading", () => {
  assert.equal(artifactFolderNameError("Design/Archive"), "Folder names cannot contain slashes.");
  assert.equal(artifactFolderNameError(".."), "Folder names cannot be . or ...");
  assert.throws(
    () => artifactImportRelativePath({ name: "notes.md", webkitRelativePath: "Launch/../notes.md" }, true),
    /cannot be imported/,
  );
});

test("artifact workspace exposes folder import, destination, and upward navigation", async () => {
  const [page, dialog, toolbar] = await Promise.all([
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactImportDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactBrowserToolbar.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Import folder/);
  assert.match(page, /artifactImportPublishPath/);
  assert.match(dialog, /webkitdirectory/);
  assert.match(dialog, /New subfolder/);
  assert.match(dialog, /Destination/);
  assert.match(toolbar, /Up one level/);
  assert.match(toolbar, /Artifact folder path/);
  assert.match(toolbar, /Search this folder/);
});
