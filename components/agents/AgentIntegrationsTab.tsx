"use client";

import { AgentAbilitiesPanel } from "./AgentAbilitiesPanel";
import { AgentMcpPanel } from "./AgentMcpPanel";

interface AgentIntegrationsTabProps {
  agentId: string;
}

export function AgentIntegrationsTab({ agentId }: AgentIntegrationsTabProps) {
  return (
    <div className="space-y-8">
      {/* Abilities */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Abilities
        </h3>
        <AgentAbilitiesPanel agentId={agentId} />
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* MCP Servers */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          MCP Servers
        </h3>
        <AgentMcpPanel agentId={agentId} />
      </section>
    </div>
  );
}
