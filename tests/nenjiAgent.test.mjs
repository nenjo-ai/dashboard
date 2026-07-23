import assert from "node:assert/strict";
import test from "node:test";
import {
  findNenjiAgent,
  isNenjiAgent,
  nenjiAgentSlug,
  parseVersionedSlugSuffix,
} from "../lib/nenjiAgent.ts";

function agent(partial) {
  return {
    id: partial.id ?? "id",
    slug: partial.slug,
    name: partial.name ?? "Agent",
    description: null,
    created_by: null,
    is_system: false,
    color: "#000",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
    source_agent_id: null,
    prompt_locked: false,
    platform_scopes: [],
    model_id: null,
    source_type: partial.source_type ?? "package",
    read_only: true,
    metadata: partial.metadata ?? {},
  };
}

test("parseVersionedSlugSuffix reads legacy nenji-v1_1_0 style slugs", () => {
  assert.deepEqual(parseVersionedSlugSuffix("nenji-v1_1_0"), [1, 1, 0]);
  assert.deepEqual(parseVersionedSlugSuffix("nenjo-ai-nenji"), []);
  assert.deepEqual(parseVersionedSlugSuffix("nenji"), []);
  assert.deepEqual(parseVersionedSlugSuffix("other-v2_0_0"), [2, 0, 0]);
});

test("isNenjiAgent matches scoped, legacy, and package identities", () => {
  assert.equal(isNenjiAgent(agent({ slug: "nenji", name: "Nenji" })), true);
  assert.equal(isNenjiAgent(agent({ slug: "nenjo-ai-nenji", name: "Nenji" })), true);
  assert.equal(isNenjiAgent(agent({ slug: "nenji-v1_1_0", name: "Nenji" })), true);
  assert.equal(isNenjiAgent(agent({ slug: "helper", name: "nenji" })), true);
  assert.equal(
    isNenjiAgent(
      agent({
        slug: "custom",
        name: "Custom",
        metadata: { package: "@nenjo-ai/nenji", package_version: "1.1.0" },
      }),
    ),
    true,
  );
  assert.equal(isNenjiAgent(agent({ slug: "builder", name: "Builder" })), false);
});

test("findNenjiAgent prefers package agent with metadata version", () => {
  const older = agent({
    id: "old",
    slug: "nenjo-ai-nenji",
    name: "Nenji",
    source_type: "package",
    metadata: { package: "@nenjo-ai/nenji", package_version: "1.0.0" },
  });
  const newer = agent({
    id: "new",
    slug: "nenjo-ai-nenji",
    name: "Nenji",
    source_type: "package",
    metadata: { package: "@nenjo-ai/nenji", package_version: "1.1.0" },
    updated_at: "2026-06-01T00:00:00Z",
  });
  // Same stable slug should not appear twice in practice; prefer higher metadata version.
  const picked = findNenjiAgent([older, newer]);
  assert.equal(picked?.id, "new");
  assert.equal(nenjiAgentSlug(picked), "nenjo-ai-nenji");
});

test("findNenjiAgent prefers scoped stable slug over legacy bare", () => {
  const legacy = agent({
    id: "legacy",
    slug: "nenji",
    name: "Nenji",
    source_type: "package",
    metadata: { package: "@nenjo-ai/nenji", package_version: "1.0.0" },
  });
  const scoped = agent({
    id: "scoped",
    slug: "nenjo-ai-nenji",
    name: "Nenji",
    source_type: "package",
    metadata: { package: "@nenjo-ai/nenji", package_version: "1.0.0" },
  });
  assert.equal(findNenjiAgent([legacy, scoped])?.id, "scoped");
});

test("findNenjiAgent still finds legacy unversioned slug", () => {
  const legacy = agent({
    id: "legacy",
    slug: "nenji",
    name: "Nenji",
    source_type: "native",
  });
  assert.equal(findNenjiAgent([legacy])?.id, "legacy");
  assert.equal(nenjiAgentSlug(legacy), "nenji");
});

test("findNenjiAgent prefers package over native when both match", () => {
  const native = agent({
    id: "native",
    slug: "nenji",
    name: "Nenji",
    source_type: "native",
  });
  const packaged = agent({
    id: "pkg",
    slug: "nenjo-ai-nenji",
    name: "Nenji",
    source_type: "package",
  });
  assert.equal(findNenjiAgent([native, packaged])?.id, "pkg");
});
