import type {
  Ability,
  AgentDefinition,
  McpServer,
  UpdateAgentRequest,
} from "./types";

export function buildCloneAgentUpdate(
  sourceAgent: Pick<AgentDefinition, "platform_scopes">,
  sourceAbilities: Pick<Ability, "slug">[],
  sourceMcpServers: Pick<McpServer, "slug">[],
): UpdateAgentRequest {
  return {
    platform_scopes: [...sourceAgent.platform_scopes],
    abilities: sourceAbilities.map((ability) => ability.slug),
    mcp_servers: sourceMcpServers.map((server) => server.slug),
  };
}
