"use client";

import { useMemo, useState } from "react";
import { useAgents, useProjects } from "@/lib/hooks";
import type { AgentDefinition, Project } from "@/lib/types";
import { cn } from "@/lib/cn";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileNewChatSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (projectId: string | null, agentId: string, agentName: string) => void | Promise<void>;
}

export function MobileNewChatSheet({
  open,
  onClose,
  onCreate,
}: MobileNewChatSheetProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { agents } = useAgents();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const allProjects = useMemo<Project[]>(() => {
    return projects ?? [];
  }, [projects]);

  const availableAgents = useMemo(
    () => agents?.filter((agent: AgentDefinition) => agent.model_id) ?? [],
    [agents],
  );

  const selectedAgent = availableAgents.find((agent) => agent.id === selectedAgentId);

  return (
    <MobileBottomSheet open={open} onClose={onClose} title="New Chat">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Project
          </label>
          {projectsLoading ? (
            <div className="h-11 animate-pulse rounded-2xl border border-black/10 bg-[#f5f7fb] dark:border-white/10 dark:bg-[#05070b]" />
          ) : (
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="w-full rounded-2xl border border-black/10 bg-[#f5f7fb] px-4 py-3 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-white/10 dark:bg-[#05070b] dark:text-gray-100"
            >
              <option value="">General</option>
              {allProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Agent
          </label>
          <select
            value={selectedAgentId ?? ""}
            onChange={(e) => setSelectedAgentId(e.target.value || null)}
            className="w-full rounded-2xl border border-black/10 bg-[#f5f7fb] px-4 py-3 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-white/10 dark:bg-[#05070b] dark:text-gray-100"
          >
            <option value="">Select an agent...</option>
            {availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.display_name || agent.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <MobileTouchButton
            onPress={onClose}
            className="flex-1 rounded-2xl border border-black/10 bg-transparent px-4 py-3 text-sm font-medium text-gray-700 dark:border-white/10 dark:text-gray-300"
          >
            Cancel
          </MobileTouchButton>
          <MobileTouchButton
            onPress={() => {
              if (!selectedAgentId || !selectedAgent) return;
              void onCreate(selectedProjectId, selectedAgentId, selectedAgent.name);
            }}
            disabled={!selectedAgentId}
            className={cn(
              "flex-1 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors",
              selectedAgentId
                ? "border-black/10 bg-transparent text-gray-900 dark:border-white/10 dark:text-gray-100"
                : "border-black/10 bg-transparent text-gray-400 dark:border-white/10 dark:text-gray-500",
            )}
          >
            Create
          </MobileTouchButton>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
