"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentDefinition } from "@/lib/types";
import { useAgentDomains, useAgentAbilities, useModels } from "@/lib/hooks";
import { updateAgent } from "@/lib/api";
import { Globe } from "lucide-react";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

interface AgentCardProps {
  agent: AgentDefinition;
  onDelete?: (agent: AgentDefinition) => void;
  isDeleting?: boolean;
  onRefresh?: () => void;
}

export function AgentCard({ agent, onDelete, isDeleting, onRefresh }: AgentCardProps) {
  const { agentDomains } = useAgentDomains(agent.id);
  const { abilities: agentAbilities } = useAgentAbilities(agent.id);
  const { models } = useModels();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const [editName, setEditName] = useState(agent.name);
  const [editDisplayName, setEditDisplayName] = useState(agent.display_name ?? "");
  const [editDescription, setEditDescription] = useState(agent.description ?? "");
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const domainCount = agentDomains?.filter((m) => m.enabled).length ?? 0;
  const abilityCount = agentAbilities?.length ?? 0;

  const assignedModel = models?.find((m) => m.id === agent.model_id);

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  // Reset edit form when agent changes
  useEffect(() => {
    setEditName(agent.name);
    setEditDisplayName(agent.display_name ?? "");
    setEditDescription(agent.description ?? "");
  }, [agent]);

  const handleAssignModel = async (modelId: string | null) => {
    setAssigning(true);
    try {
      await updateAgent(agent.id, { model_id: modelId });
      onRefresh?.();
    } catch (e) {
      console.error("Failed to assign model:", e);
    } finally {
      setAssigning(false);
      setPickerOpen(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateAgent(agent.id, {
        name: editName.trim(),
        display_name: editDisplayName.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      setEditing(false);
      onRefresh?.();
    } catch (e) {
      console.error("Failed to update agent:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditName(agent.name);
    setEditDisplayName(agent.display_name ?? "");
    setEditDescription(agent.description ?? "");
  };

  return (
    <div
      onClick={(e) => {
        // Don't navigate when clicking interactive elements
        const target = e.target as HTMLElement;
        if (target.closest("button, select, input, textarea")) return;
        if (editing) return;
        router.push(`/dashboard/agents/${agent.id}`);
      }}
      className="theme-border theme-surface flex h-full cursor-pointer flex-col rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <RoleIdenticon roleId={agent.id} color={agent.color} size={40} className="shrink-0 mt-0.5" roleName={agent.name} />
          {editing ? (
            /* Edit mode */
            <div className="flex-1 space-y-2">
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Display Name</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="e.g., Lead Developer"
                  className="theme-border theme-surface w-full rounded-md border px-2.5 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Role (identifier)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g., lead_developer"
                  className="theme-border theme-surface w-full rounded-md border px-2.5 py-1 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What does this agent do?"
                  className="theme-border theme-surface w-full rounded-md border px-2.5 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={handleCancelEdit}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:[background:var(--app-hover)] dark:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="rounded-md bg-deep-space-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-deep-space-blue-700 disabled:opacity-50 dark:bg-deep-space-blue-500 dark:hover:bg-deep-space-blue-600"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            /* Display mode */
            <div className="flex-1">
              {agent.display_name && (
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {agent.display_name}
                </h3>
              )}
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs ${agent.display_name ? "text-gray-400 dark:text-gray-500" : "font-semibold text-gray-900 dark:text-gray-100"}`}>
                  {agent.name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    agent.source_agent_id
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                      : "theme-surface-muted theme-text-muted"
                  }`}
                >
                  {agent.source_agent_id ? "System" : "Custom"}
                </span>
              </div>
              {agent.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {agent.description}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Edit button */}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-gray-300 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300"
              title="Edit agent"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          {/* Delete button */}
          {onDelete && agent.name !== "system" && !editing && (
            <button
              onClick={() => onDelete(agent)}
              disabled={isDeleting}
              className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-flag-red-500 disabled:opacity-50 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
              title="Delete agent"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Model assignment + stats + buttons — pushed to bottom */}
      {!editing && (
        <div className="mt-auto pt-3">
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              disabled={assigning}
              className="w-full flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left transition-all hover:border-solid group/model
                theme-border hover:border-deep-space-blue-300 dark:hover:border-deep-space-blue-500"
            >
              {assignedModel ? (
                <>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-deep-space-blue-50 dark:bg-deep-space-blue-900/40">
                    <svg className="h-3.5 w-3.5 text-deep-space-blue-500 dark:text-deep-space-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
                      {assignedModel.model}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      {assignedModel.model_provider} &middot; temp {assignedModel.temperature.toFixed(1)}
                    </p>
                  </div>
                  <svg className="h-3.5 w-3.5 text-gray-300 group-hover/model:text-gray-500 dark:text-gray-600 dark:group-hover/model:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                  </svg>
                </>
              ) : (
                <>
                  <div className="theme-border flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed">
                    <svg className="h-3 w-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Assign a model
                  </span>
                </>
              )}
            </button>

            {/* Dropdown picker */}
            {pickerOpen && models && (
              <div className="theme-border theme-surface absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg">
                {assignedModel && (
                  <button
                    onClick={() => handleAssignModel(null)}
                    className="theme-border flex w-full items-center gap-2 border-b px-3 py-2 text-xs text-gray-400 hover:[background:var(--app-hover)]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unassign model
                  </button>
                )}
                {models.map((m) => {
                  const isCurrent = m.id === agent.model_id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleAssignModel(m.id)}
                      disabled={isCurrent}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                        ${isCurrent
                          ? "bg-deep-space-blue-50 dark:bg-deep-space-blue-900/30 cursor-default"
                          : "hover:[background:var(--app-hover)]"
                        }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isCurrent ? "text-deep-space-blue-600 dark:text-deep-space-blue-300" : "text-gray-700 dark:text-gray-200"}`}>
                          {m.model}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {m.model_provider} &middot; temp {m.temperature.toFixed(1)}
                        </p>
                      </div>
                      {isCurrent && (
                        <svg className="h-3.5 w-3.5 shrink-0 text-deep-space-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                {models.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">
                    No models configured yet
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <div className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              <span>{domainCount} {domainCount === 1 ? "domain" : "domains"}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              <span>{abilityCount} {abilityCount === 1 ? "ability" : "abilities"}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>{agent.platform_scopes?.length ?? 0} {(agent.platform_scopes?.length ?? 0) === 1 ? "scope" : "scopes"}</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
