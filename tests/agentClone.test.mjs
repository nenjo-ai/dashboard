import assert from "node:assert/strict";
import test from "node:test";

import { buildCloneAgentUpdate } from "../lib/agentClone.ts";

test("agent clone update copies scopes, abilities, and MCP assignments", () => {
  const sourceAgent = {
    platform_scopes: ["agents:read", "routines:write"],
  };
  const update = buildCloneAgentUpdate(
    sourceAgent,
    [{ name: "build_routine" }, { name: "review_code" }],
    [{ name: "github" }, { name: "linear" }],
  );

  assert.deepEqual(update, {
    platform_scopes: ["agents:read", "routines:write"],
    abilities: ["build_routine", "review_code"],
    mcp_servers: ["github", "linear"],
  });
});

test("agent clone update does not reuse mutable source arrays", () => {
  const sourceAgent = {
    platform_scopes: ["agents:read"],
  };
  const update = buildCloneAgentUpdate(sourceAgent, [], []);

  sourceAgent.platform_scopes.push("agents:write");

  assert.deepEqual(update.platform_scopes, ["agents:read"]);
});
