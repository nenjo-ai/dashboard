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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {agent.display_name || agent.name}
          </h1>
          {agent.display_name && (
            <span className="font-mono text-sm text-gray-400 dark:text-gray-500">
              {agent.name}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            agent.source_agent_id
              ? "bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}>
            {agent.source_agent_id ? "System" : "Custom"}
          </span>
        </div>

        {/* Model chip */}
        {assignedModel && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-600 dark:text-gray-300">
              {assignedModel.model_provider}
            </span>
            <span>/</span>
            <span>{assignedModel.model}</span>
            <span className="text-gray-400 dark:text-gray-500">
              &middot; {assignedModel.temperature}
            </span>
          </div>
        )}

        {/* Description */}
        {agent.description && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
            {agent.description}
          </p>
        )}
      </div>
    </div>
  );
}
