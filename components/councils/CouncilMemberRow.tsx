"use client";

import { cn } from "@/lib/cn";
import { useMemo } from "react";
import type { Model } from "@/lib/types";


interface MemberRowData {
  agent_id: string;
  role: string;
}

interface CouncilMemberRowProps {
  member: MemberRowData;
  index: number;
  agents: Model[];
  disabled?: boolean;
  errors?: { agent_id?: string; role?: string };
  onChange: (index: number, field: keyof MemberRowData, value: string) => void;
  onRemove: (index: number) => void;
}

export function CouncilMemberRow({
  member,
  index,
  agents,
  disabled = false,
  errors,
  onChange,
  onRemove,
}: CouncilMemberRowProps) {
  // Get the tags (roles) for the currently selected agent
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === member.agent_id),
    [agents, member.agent_id],
  );
  const agentTags = selectedAgent?.tags ?? [];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
      {/* Agent selector */}
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Agent
        </label>
        <select
          value={member.agent_id}
          onChange={(e) => {
            onChange(index, "agent_id", e.target.value);
            // Reset role when agent changes since tags differ per agent
            onChange(index, "role", "");
          }}
          disabled={disabled}
          className={cn(
            "block w-full rounded-lg border px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-1",
            errors?.agent_id
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-deep-space-blue-500 focus:ring-deep-space-blue-500 dark:border-gray-600",
            "dark:bg-gray-800 dark:text-gray-100",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <option value="">Select agent...</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.model})
            </option>
          ))}
        </select>
        {errors?.agent_id && (
          <p className="mt-1 text-xs text-red-500">{errors.agent_id}</p>
        )}
      </div>

      {/* Role selector — populated from the selected agent's tags */}
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Role
        </label>
        <select
          value={member.role}
          onChange={(e) => onChange(index, "role", e.target.value)}
          disabled={disabled || !member.agent_id}
          className={cn(
            "block w-full rounded-lg border px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-1",
            errors?.role
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-deep-space-blue-500 focus:ring-deep-space-blue-500 dark:border-gray-600",
            "dark:bg-gray-800 dark:text-gray-100",
            (disabled || !member.agent_id) && "opacity-50 cursor-not-allowed",
          )}
        >
          <option value="">
            {!member.agent_id
              ? "Select agent first..."
              : agentTags.length === 0
                ? "No roles assigned to agent"
                : "Select role..."}
          </option>
          {agentTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </option>
          ))}
        </select>
        {errors?.role && (
          <p className="mt-1 text-xs text-red-500">{errors.role}</p>
        )}
      </div>

      {/* Remove button */}
      <div className="pt-5">
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className={cn(
            "rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors",
            "dark:hover:bg-red-950/50 dark:hover:text-red-400",
            "focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          title="Remove member"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
