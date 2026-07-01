import type {
  Ability,
  AgentDefinition,
  McpServer,
  UpdateAgentRequest,
} from "./types";

export function buildCloneAgentUpdate(
  sourceAgent: Pick<AgentDefinition, "platform_scopes">,
  sourceAbilities: Pick<Ability, "name">[],
  sourceMcpServers: Pick<McpServer, "name">[],
): UpdateAgentRequest {
  return {
    platform_scopes: [...sourceAgent.platform_scopes],
    abilities: sourceAbilities.map((ability) => ability.name),
    mcp_servers: sourceMcpServers.map((server) => server.name),
  };
}
