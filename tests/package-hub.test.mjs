import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortPackages,
  groupPackageResources,
  summarizePackageResources,
} from "../lib/packageHub.ts";

const packages = [
  {
    id: "commands",
    kind: "command",
    name: "commands",
    display_name: "Commands",
    description: "Reusable command workflows",
    latest_version: "1.0.0",
    metadata: {},
    synced_at: "2026-08-20T00:00:00.000Z",
    source_path: "packages/commands",
  },
  {
    id: "research",
    kind: "knowledge",
    name: "research",
    display_name: "Research Graph",
    description: "Connected research context",
    latest_version: "2.0.0",
    metadata: {},
    synced_at: "2026-08-24T00:00:00.000Z",
    source_path: "knowledge/research",
  },
  {
    id: "agent",
    kind: "agent",
    name: "analyst",
    display_name: "Analyst",
    description: "Research and reporting agent",
    latest_version: null,
    metadata: {},
    synced_at: null,
    source_path: "agents/analyst",
  },
];

test("package catalog search checks names, descriptions, paths, and types", () => {
  assert.deepEqual(
    filterAndSortPackages(packages, "research", "all", "relevance").map(
      (pkg) => pkg.id,
    ),
    ["research", "agent"],
  );
  assert.deepEqual(
    filterAndSortPackages(packages, "knowledge/", "all", "relevance").map(
      (pkg) => pkg.id,
    ),
    ["research"],
  );
});

test("package catalog applies type filters and stable display sorting", () => {
  assert.deepEqual(
    filterAndSortPackages(packages, "", "agent", "name").map(
      (pkg) => pkg.id,
    ),
    ["agent"],
  );
  assert.deepEqual(
    filterAndSortPackages(packages, "", "all", "recent").map(
      (pkg) => pkg.id,
    ),
    ["research", "commands", "agent"],
  );
  assert.equal(packages[0].id, "commands", "sorting must not mutate SWR data");
});

function resource(id, type, name, path = `packages/${name}`) {
  return {
    id,
    org_id: "org-1",
    package_install_id: "install-1",
    package_source_id: "source-1",
    source_path: path,
    resource_type: type,
    resource_name: name,
    resource_id: id,
    resource_version: null,
    source_hash: "hash",
    install_state: "installed",
    metadata: {},
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:00:00.000Z",
  };
}

const resources = [
  resource("ability-2", "ability", "write_report"),
  resource("graph-1", "knowledge_pack", "research_graph"),
  resource("ability-1", "ability", "collect_sources"),
  resource("mcp-1", "mcp_server", "github"),
];

test("installed package resources are normalized, grouped, and sorted", () => {
  const groups = groupPackageResources(resources);

  assert.deepEqual(
    groups.map((group) => [group.type, group.resources.map((item) => item.resource_name)]),
    [
      ["ability", ["collect_sources", "write_report"]],
      ["knowledge", ["research_graph"]],
      ["mcp", ["github"]],
    ],
  );
});

test("resource search and summaries use the same authoritative grouping", () => {
  assert.deepEqual(
    groupPackageResources(resources, "report").flatMap((group) =>
      group.resources.map((item) => item.resource_name),
    ),
    ["write_report"],
  );
  assert.equal(
    summarizePackageResources(resources),
    "2 abilities · 1 knowledge graph · 1 MCP server",
  );
});
