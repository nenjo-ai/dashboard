"use client";

import { useState, useMemo } from "react";
import { useProjects, useAgents, useSystemProject } from "@/lib/hooks";
import type { AgentDefinition, Project } from "@/lib/types";
import { cn } from "@/lib/cn";

interface NewChatModalProps {
  onClose: () => void;
  onCreate: (projectId: string, agentId: string, agentName: string) => void;
}

export function NewChatModal({ onClose, onCreate }: NewChatModalProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { project: systemProject } = useSystemProject();
  const { agents } = useAgents();

  const allProjects = useMemo<Project[]>(() => {
    const list: Project[] = [];
    if (systemProject) list.push(systemProject);
    if (projects) list.push(...projects);
    return list;
  }, [projects, systemProject]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const availableAgents = useMemo(
    () => agents?.filter((a: AgentDefinition) => a.model_id) ?? [],
    [agents],
  );

  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId);

  const handleCreate = () => {
    if (!selectedProjectId || !selectedAgentId || !selectedAgent) return;
    onCreate(selectedProjectId, selectedAgentId, selectedAgent.name);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
          New Chat
        </h3>

        {/* Project select */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Project
          </label>
          {projectsLoading ? (
            <div className="h-9 animate-pulse rounded-md bg-gray-100 dark:bg-gray-700" />
          ) : (
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select a project...</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.is_system ? "General" : p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Agent select */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Agent
          </label>
          <select
            value={selectedAgentId ?? ""}
            onChange={(e) => setSelectedAgentId(e.target.value || null)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select an agent...</option>
            {availableAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedProjectId || !selectedAgentId}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors",
              selectedProjectId && selectedAgentId
                ? "bg-deep-space-blue-500 hover:bg-deep-space-blue-600"
                : "cursor-not-allowed bg-gray-300 dark:bg-gray-600",
            )}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
