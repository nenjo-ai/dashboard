"use client";

import { useState } from "react";
import { useAgents } from "@/lib/hooks";
import {
  createAgent,
  deleteAgent,
  fetchAgentAbilities,
  fetchAgentMcpServers,
  fetchAgentPrompt,
  updateAgent,
  updateAgentPrompt,
} from "@/lib/api";
import { buildCloneAgentUpdate } from "@/lib/agentClone";
import { AgentCard } from "./AgentCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { AGENT_COLOR_PALETTE } from "@/lib/agent-colors";
import type { AgentDefinition } from "@/lib/types";
import { Plus } from "lucide-react";

export function AgentsSection() {
  const { agents, isLoading, isError, mutate } = useAgents();

  // Create agent form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentColor, setNewAgentColor] = useState<string>(AGENT_COLOR_PALETTE[0]);
  const [cloneFromId, setCloneFromId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AgentDefinition | null>(null);

  const handleDeleteAgent = (agent: AgentDefinition) => {
    if (deletingId) return;
    setConfirmDeleteAgent(agent);
  };

  const executeDeleteAgent = async () => {
    if (!confirmDeleteAgent) return;
    setDeletingId(confirmDeleteAgent.id);
    try {
      await deleteAgent(confirmDeleteAgent.id);
      mutate();
    } catch {
      // TODO: toast
    } finally {
      setDeletingId(null);
      setConfirmDeleteAgent(null);
    }
  };

  const handleCloneFrom = (agentId: string) => {
    setCloneFromId(agentId);
    if (!agentId) return;
    const source = agents?.find((r) => r.id === agentId);
    if (!source) return;
    setNewAgentDescription(source.description ?? "");
    setNewAgentColor(source.color);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) return;
    try {
      setCreating(true);
      const sourceAgent = cloneFromId ? agents?.find((r) => r.id === cloneFromId) : null;
      const created = await createAgent({
        name: newAgentName.trim(),
        description: newAgentDescription.trim() || undefined,
        color: newAgentColor,
        model_id: sourceAgent?.model_id ?? undefined,
      });
      if (sourceAgent) {
        const [sourcePromptConfig, sourceAbilities, sourceMcpServers] =
          await Promise.all([
            fetchAgentPrompt(sourceAgent.id),
            fetchAgentAbilities(sourceAgent.id),
            fetchAgentMcpServers(sourceAgent.id),
          ]);
        await Promise.all([
          updateAgent(
            created.id,
            buildCloneAgentUpdate(
              sourceAgent,
              sourceAbilities,
              sourceMcpServers,
            ),
          ),
          updateAgentPrompt(created.id, sourcePromptConfig),
        ]);
      }
      setNewAgentName("");
      setNewAgentDescription("");
      setNewAgentColor(AGENT_COLOR_PALETTE[0]);
      setCloneFromId("");
      setShowCreateForm(false);
      mutate();
    } catch {
      // TODO: toast
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="theme-border theme-surface rounded-xl border p-5 shadow-xs"
            >
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
        <svg
          className="h-10 w-10 text-flag-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Failed to load agents
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="theme-border theme-surface flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16">
        <div className="rounded-full bg-deep-space-blue-50 p-4 dark:bg-deep-space-blue-900/50">
          <svg
            className="h-10 w-10 text-deep-space-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          No agents yet
        </h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
          Agents define how your AI behaves. Create agents in settings to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setShowCreateForm((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          New agent
        </Button>
      </div>

      {/* Create agent form */}
      {showCreateForm && (
        <div className="mb-4 rounded-xl border border-deep-space-blue-200 bg-deep-space-blue-50/50 p-4 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-950/30">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Clone From
              </label>
              <select
                value={cloneFromId}
                onChange={(e) => handleCloneFrom(e.target.value)}
                className="theme-border theme-surface w-full rounded-lg border px-3 py-1.5 text-sm text-gray-900 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100"
              >
                <option value="">Start from scratch</option>
                {agents?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Agent Name
              </label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g., lead_developer"
                className="theme-border theme-surface w-full rounded-lg border px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              <input
                type="text"
                value={newAgentDescription}
                onChange={(e) => setNewAgentDescription(e.target.value)}
                placeholder="What does this agent do?"
                className="theme-border theme-surface w-full rounded-lg border px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Color
              </label>
              <ColorSwatchPicker
                value={newAgentColor}
                onChange={setNewAgentColor}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewAgentName("");
                  setNewAgentDescription("");
                  setNewAgentColor(AGENT_COLOR_PALETTE[0]);
                  setCloneFromId("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!newAgentName.trim() || creating}
                onClick={handleCreateAgent}
              >
                {creating ? "Creating..." : "Create Agent"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onDelete={handleDeleteAgent}
            isDeleting={deletingId === agent.id}
            onRefresh={mutate}
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteAgent}
        onClose={() => setConfirmDeleteAgent(null)}
        onConfirm={executeDeleteAgent}
        title="Delete Agent"
        message={`Delete agent "${confirmDeleteAgent?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={!!deletingId}
      />
    </div>
  );
}
