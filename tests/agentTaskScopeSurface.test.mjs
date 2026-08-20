import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent scope controls keep task and artifact access separate", async () => {
  const panel = await readFile(
    new URL("../components/agents/AgentPlatformScopesPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(panel, /label: "Tasks", scopes: \["tasks:read", "tasks:write"\]/);
  assert.match(
    panel,
    /label: "Artifacts", scopes: \["artifacts:read", "artifacts:write"\]/,
  );
});

test("agent scope saves keep the authoritative response and expose failures", async () => {
  const [panel, detail] = await Promise.all([
    readFile(
      new URL("../components/agents/AgentPlatformScopesPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/dashboard/agents/[id]/AgentDetailClient.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(panel, /const updatedAgent = await updateAgentPlatformScopes/);
  assert.match(panel, /await onSaved\(updatedAgent\)/);
  assert.match(panel, /setError\([\s\S]*Failed to save agent scopes/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /disabled=\{saving\}/);
  assert.match(detail, /mutateAgent\(updatedAgent, \{ revalidate: false \}\)/);
});

test("agent details do not expose an agent-specific Tasks tab", async () => {
  const [detail, mobileDetail] = await Promise.all([
    readFile(new URL("../app/dashboard/agents/[id]/AgentDetailClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/agents/MobileAgentDetail.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(detail, /AgentTaskAssignments|id: "tasks"|activeTab === "tasks"/);
  assert.doesNotMatch(mobileDetail, /\| "tasks"|activeTab === "tasks"|useTasks/);
});
