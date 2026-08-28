import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  agentIsManaged,
  agentSettingsHaveChanges,
  agentSourceLabel,
  filterAndSortAgents,
  summarizeAgentWorkspace,
} from "../lib/agentWorkspace.ts";

function agent(overrides = {}) {
  return {
    id: "agent-1",
    name: "Workspace analyst",
    slug: "workspace-analyst",
    description: "Investigates workspace changes",
    color: "#355cff",
    model_id: "model-1",
    model_name: "Ornith",
    platform_scopes: [],
    read_only: false,
    is_system: false,
    source_agent_id: null,
    source_type: null,
    metadata: null,
    updated_at: "2026-08-25T12:00:00Z",
    ...overrides,
  };
}

test("package-backed agents are identified as managed without a source agent id", () => {
  const managed = agent({ source_type: "package", source_agent_id: null });

  assert.equal(agentIsManaged(managed), true);
  assert.equal(agentSourceLabel(managed), "Managed");
});

test("agent workspace filtering searches relevant fields and preserves source order", () => {
  const original = [
    agent({ id: "older", name: "Beta", model_id: null, updated_at: "2026-08-20T12:00:00Z" }),
    agent({ id: "newer", name: "Alpha", source_type: "package", updated_at: "2026-08-25T12:00:00Z" }),
  ];

  assert.deepEqual(filterAndSortAgents(original, "alpha", "all", "updated").map(({ id }) => id), ["newer"]);
  assert.deepEqual(filterAndSortAgents(original, "", "needs_model", "name").map(({ id }) => id), ["older"]);
  assert.deepEqual(filterAndSortAgents(original, "", "managed", "updated").map(({ id }) => id), ["newer"]);
  assert.deepEqual(original.map(({ id }) => id), ["older", "newer"]);
});

test("agent workspace summary separates model readiness from source ownership", () => {
  const summary = summarizeAgentWorkspace([
    agent(),
    agent({ id: "managed", source_type: "package", model_id: null }),
  ]);

  assert.deepEqual(summary, { agents: 2, ready: 1, custom: 1, managed: 1 });
});

test("agent settings dirty state normalizes user-editable text", () => {
  const source = agent({ description: null, model_id: null });

  assert.equal(agentSettingsHaveChanges(source, { name: " Workspace analyst ", description: "", color: "#355cff", modelId: null }), false);
  assert.equal(agentSettingsHaveChanges(source, { name: "Renamed", description: "", color: "#355cff", modelId: null }), true);
});

test("agent cards stay request-free and agent details expose overview and activity without a Tasks tab", async () => {
  const [card, listPage, detail, promptEditor] = await Promise.all([
    readFile(new URL("../components/agents/AgentCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/agents/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/agents/[id]/AgentDetailClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/agents/AgentPromptEditor.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(card, /useAgentAbilities|useAgentDomains|useModels/);
  assert.match(card, /<Link/);
  assert.match(listPage, /dynamic\(/);
  assert.match(listPage, /Agent studio/);
  assert.match(detail, /id: "overview"/);
  assert.match(detail, /id: "activity"/);
  assert.doesNotMatch(detail, /id: "tasks"|animate-spin/);
  assert.match(promptEditor, /collapseCodeSections/);
  assert.match(promptEditor, /showFallbackContent=\{false\}/);
});
