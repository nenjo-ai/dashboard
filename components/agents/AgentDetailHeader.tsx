"use client";

import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import type { AgentDefinition, Model } from "@/lib/types";

interface AgentDetailHeaderProps {
  agent: AgentDefinition;
  models?: Model[];
}

export function AgentDetailHeader({ agent, models }: AgentDetailHeaderProps) {
  const assignedModel = models?.find((m) => m.id === agent.model_id);

  return (
    <div className="flex items-start gap-4">
      <RoleIdenticon roleId={agent.id} color={agent.color} size={48} roleName={agent.name} />

      <div className="min-w-0 flex-1">
        {/* Name row */}
        <div className="flex items-center gap-2.5">
          <h1 className="theme-text text-xl font-semibold">
            {agent.display_name || agent.name}
          </h1>
          {agent.display_name && (
            <span className="theme-text-muted font-mono text-sm">
              {agent.name}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            agent.source_agent_id
              ? "bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-400"
              : "theme-surface-muted theme-text-muted"
          }`}>
            {agent.source_agent_id ? "System" : "Custom"}
          </span>
        </div>

        {/* Model chip */}
        {assignedModel && (
          <div className="theme-text-muted mt-1 flex items-center gap-1.5 text-xs">
            <span className="theme-text font-medium">
              {assignedModel.model_provider}
            </span>
            <span>/</span>
            <span>{assignedModel.model}</span>
            <span className="theme-text-muted">
              &middot; {assignedModel.temperature}
            </span>
          </div>
        )}

        {/* Description */}
        {agent.description && (
          <p className="theme-text-muted mt-1.5 line-clamp-2 text-sm">
            {agent.description}
          </p>
        )}
      </div>
    </div>
  );
}
