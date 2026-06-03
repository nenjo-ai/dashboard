"use client";

import { useState, useMemo } from "react";
import { useProjects, useAgents, useCouncils } from "@/lib/hooks";
import type { AgentDefinition, CouncilDetail, Project } from "@/lib/types";
import { cn } from "@/lib/cn";

interface NewChatModalProps {
  onClose: () => void;
  onCreate: (
    projectId: string | null,
    targetId: string,
    targetName: string,
    targetType: "agent" | "council",
  ) => void;
}

export function NewChatModal({ onClose, onCreate }: NewChatModalProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { agents } = useAgents();
  const { councils } = useCouncils();

  const allProjects = useMemo<Project[]>(() => {
    return projects ?? [];
  }, [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"agent" | "council">("agent");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedCouncilId, setSelectedCouncilId] = useState<string | null>(null);

  const availableAgents = useMemo(
    () => agents?.filter((a: AgentDefinition) => a.model_id) ?? [],
    [agents],
  );

  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId);
  const availableCouncils = councils ?? [];
  const selectedCouncil = availableCouncils.find((c: CouncilDetail) => c.id === selectedCouncilId);

  const handleCreate = () => {
    if (targetType === "agent") {
      if (!selectedAgentId || !selectedAgent) return;
      onCreate(selectedProjectId, selectedAgentId, selectedAgent.name, "agent");
      return;
    }
    if (!selectedCouncilId || !selectedCouncil) return;
    onCreate(selectedProjectId, selectedCouncilId, selectedCouncil.name, "council");
  };
  const canCreate = targetType === "agent" ? Boolean(selectedAgentId) : Boolean(selectedCouncilId);

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
              <option value="">General</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 rounded-md border border-gray-200 p-0.5 text-xs dark:border-gray-700">
          {(["agent", "council"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTargetType(type)}
              className={cn(
                "rounded-sm px-3 py-1.5 font-medium capitalize transition-colors",
                targetType === type
                  ? "bg-deep-space-blue-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Agent select */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            {targetType === "agent" ? "Agent" : "Council"}
          </label>
          {targetType === "agent" ? (
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
          ) : (
            <select
              value={selectedCouncilId ?? ""}
              onChange={(e) => setSelectedCouncilId(e.target.value || null)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select a council...</option>
              {availableCouncils.map((c: CouncilDetail) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
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
            disabled={!canCreate}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors",
              canCreate
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
