import type { AgentDefinition } from "@/lib/types";

export type AgentWorkspaceFilter = "all" | "ready" | "needs_model" | "custom" | "managed";
export type AgentWorkspaceSort = "updated" | "name";

export interface AgentWorkspaceSummary {
  agents: number;
  ready: number;
  custom: number;
  managed: number;
}

export function agentIsManaged(agent: AgentDefinition): boolean {
  return agent.source_type === "package" || agent.read_only || Boolean(agent.metadata?.install);
}

export function agentSourceLabel(agent: AgentDefinition): "Managed" | "System" | "Derived" | "Custom" {
  if (agentIsManaged(agent)) return "Managed";
  if (agent.is_system) return "System";
  if (agent.source_agent_id) return "Derived";
  return "Custom";
}

/** Derive the visible collection from the authoritative agent list without mutating SWR data. */
export function filterAndSortAgents(
  agents: AgentDefinition[],
  query: string,
  filter: AgentWorkspaceFilter,
  sort: AgentWorkspaceSort,
): AgentDefinition[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = agents.filter((agent) => {
    const matchesQuery = !normalizedQuery || [
      agent.name,
      agent.slug ?? "",
      agent.description ?? "",
      agent.model_name ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));

    if (!matchesQuery) return false;
    if (filter === "ready") return Boolean(agent.model_id);
    if (filter === "needs_model") return !agent.model_id;
    if (filter === "custom") return !agentIsManaged(agent);
    if (filter === "managed") return agentIsManaged(agent);
    return true;
  });

  return filtered.sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

export function summarizeAgentWorkspace(agents: AgentDefinition[]): AgentWorkspaceSummary {
  return agents.reduce<AgentWorkspaceSummary>(
    (summary, agent) => {
      const managed = agentIsManaged(agent);
      return {
        agents: summary.agents + 1,
        ready: summary.ready + (agent.model_id ? 1 : 0),
        custom: summary.custom + (managed ? 0 : 1),
        managed: summary.managed + (managed ? 1 : 0),
      };
    },
    { agents: 0, ready: 0, custom: 0, managed: 0 },
  );
}

export function agentSettingsHaveChanges(
  agent: AgentDefinition,
  draft: { name: string; description: string; color: string; modelId: string | null },
): boolean {
  return (
    draft.name.trim() !== agent.name ||
    draft.description.trim() !== (agent.description ?? "") ||
    draft.color !== agent.color ||
    draft.modelId !== agent.model_id
  );
}
