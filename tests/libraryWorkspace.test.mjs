import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isLibraryKnowledgeGraph,
  knowledgeGraphSourceLabel,
  selectKnowledgeGraphs,
  summarizeKnowledgeGraphs,
} from "../lib/libraryWorkspace.ts";

const graph = (id, overrides = {}) => ({
  id,
  slug: id,
  name: id,
  description: null,
  selector: null,
  source_type: "uploaded",
  is_system: false,
  updated_at: "2026-08-24T12:00:00.000Z",
  version: null,
  ...overrides,
});

test("Library graphs exclude package and system resources without changing backend types", () => {
  assert.equal(isLibraryKnowledgeGraph(graph("workspace")), true);
  assert.equal(isLibraryKnowledgeGraph(graph("github", { source_type: "github" })), true);
  assert.equal(isLibraryKnowledgeGraph(graph("package", { source_type: "package" })), false);
  assert.equal(isLibraryKnowledgeGraph(graph("system", { is_system: true })), false);
  assert.equal(knowledgeGraphSourceLabel(graph("workspace")), "Workspace");
  assert.equal(knowledgeGraphSourceLabel(graph("managed", { source_type: "github" })), "Source managed");
});

test("graph pulse separates workspace and managed sources", () => {
  const now = new Date("2026-08-24T12:00:00.000Z").getTime();
  assert.deepEqual(summarizeKnowledgeGraphs([
    graph("recent"),
    graph("managed", { source_type: "github", updated_at: "2026-08-01T12:00:00.000Z" }),
  ], now), {
    totalCount: 2,
    workspaceCount: 1,
    managedCount: 1,
    recentlyUpdatedCount: 1,
  });
});

test("graph search covers names, descriptions, selectors, and source filters", () => {
  const graphs = [
    graph("product", { name: "Product model", description: "Canonical entities", selector: "lib:product" }),
    graph("policies", { name: "Policies", source_type: "github", version: "2.0.0" }),
  ];
  assert.deepEqual(selectKnowledgeGraphs(graphs, "canonical", "all").map(({ id }) => id), ["product"]);
  assert.deepEqual(selectKnowledgeGraphs(graphs, "2.0", "managed").map(({ id }) => id), ["policies"]);
  assert.deepEqual(selectKnowledgeGraphs(graphs, "", "workspace").map(({ id }) => id), ["product"]);
});

test("Library exposes dedicated overview, graph, graph-detail, and artifact workspaces", async () => {
  const [overview, tabs, graphIndex, graphDetail, artifacts, artifactToolbar] = await Promise.all([
    readFile(new URL("../app/dashboard/library/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/library/LibraryTabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/library/KnowledgeGraphIndexClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/library/KnowledgeGraphDetailClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactBrowserToolbar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(overview, /Knowledge workspace/);
  assert.match(tabs, /Knowledge Graphs/);
  assert.match(tabs, /\/dashboard\/library\/graphs/);
  assert.match(graphIndex, /Search knowledge graphs/);
  assert.match(graphDetail, /label: "Documents"/);
  assert.match(graphDetail, /label: "Map"/);
  assert.match(graphDetail, /dynamic\(\(\) => import\("@\/components\/knowledge\/KnowledgeSection"\)/);
  assert.match(artifactToolbar, /Search this folder/);
  assert.match(artifacts, /Artifact workspace/);
  for (const source of [overview, tabs, graphIndex, graphDetail]) {
    assert.doesNotMatch(source, /Knowledge Packs|knowledge pack/);
  }
});
