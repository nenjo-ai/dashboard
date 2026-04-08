"use client";

import { useState } from "react";
import { useMcpServers, useAgentMcpServers } from "@/lib/hooks";
import { assignMcpToAgent, removeMcpFromAgent } from "@/lib/api";
import type { McpServer } from "@/lib/types";

interface AgentMcpPanelProps {
  agentId: string;
}

export function AgentMcpPanel({ agentId }: AgentMcpPanelProps) {
  const { mcpServers: allServers, isLoading: serversLoading } = useMcpServers();
  const { mcpServers: agentServers, isLoading: assignmentsLoading, mutate } = useAgentMcpServers(agentId);
  const [toggling, setToggling] = useState<string | null>(null);

  const isLoading = serversLoading || assignmentsLoading;

  // Build set of assigned server IDs
  const assignedIds = new Set((agentServers ?? []).map((s) => s.id));

  const handleToggle = async (server: McpServer) => {
    if (toggling) return;
    setToggling(server.id);
    try {
      if (assignedIds.has(server.id)) {
        await removeMcpFromAgent(agentId, server.id);
      } else {
        await assignMcpToAgent(agentId, server.id);
      }
      mutate();
    } catch {
      // Silently fail
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
          />
        ))}
      </div>
    );
  }

  // Filter out system/platform MCP — those are assigned via scopes, not direct MCP assignment
  const externalServers = allServers?.filter((s) => !s.is_system) ?? [];

  if (!externalServers.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No external MCP servers configured. Add servers in the MCP section first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {externalServers.map((server) => {
        const isAssigned = assignedIds.has(server.id);
        const isProcessing = toggling === server.id;

        return (
          <div
            key={server.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
              isAssigned
                ? "border-deep-space-blue-200 bg-deep-space-blue-50/50 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-900/20"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() => handleToggle(server)}
                disabled={isProcessing}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  isAssigned
                    ? "bg-deep-space-blue-500"
                    : "bg-gray-300 dark:bg-gray-600"
                } ${isProcessing ? "opacity-50" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                    isAssigned ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>

              {/* Server info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {server.display_name}
                  </span>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    server.transport === "stdio"
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      : "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                  }`}>
                    {server.transport}
                  </span>
                </div>
                {server.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {server.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
