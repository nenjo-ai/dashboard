"use client";

import { useMemo, useState } from "react";
import { useAgents, useProjects, useSystemProject } from "@/lib/hooks";
import type { AgentDefinition, Project } from "@/lib/types";
import { cn } from "@/lib/cn";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileNewChatSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (projectId: string, agentId: string, agentName: string) => void | Promise<void>;
}

export function MobileNewChatSheet({
  open,
  onClose,
  onCreate,
}: MobileNewChatSheetProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { project: systemProject } = useSystemProject();
  const { agents } = useAgents();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const allProjects = useMemo<Project[]>(() => {
    const list: Project[] = [];
    if (systemProject) list.push(systemProject);
    if (projects) list.push(...projects);
    return list;
  }, [projects, systemProject]);

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
            <div className="h-11 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ) : (
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select a project...</option>
              {allProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.is_system ? "General" : project.name}
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
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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
            className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            Cancel
          </MobileTouchButton>
          <MobileTouchButton
            onPress={() => {
              if (!selectedProjectId || !selectedAgentId || !selectedAgent) return;
              void onCreate(selectedProjectId, selectedAgentId, selectedAgent.name);
            }}
            disabled={!selectedProjectId || !selectedAgentId}
            className={cn(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white",
              selectedProjectId && selectedAgentId
                ? "bg-deep-space-blue-500"
                : "bg-gray-300 dark:bg-gray-700",
            )}
          >
            Create
          </MobileTouchButton>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
