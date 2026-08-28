"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { updateAgent, deleteAgent, agentsUrl } from "@/lib/api";
import { agentSettingsHaveChanges } from "@/lib/agentWorkspace";
import { Button } from "@/components/ui/Button";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import type { AgentDefinition, Model } from "@/lib/types";

interface AgentSettingsTabProps {
  agent: AgentDefinition;
  models?: Model[];
  onUpdated: (agent?: AgentDefinition) => void;
}

export function AgentSettingsTab({ agent, models, onUpdated }: AgentSettingsTabProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [color, setColor] = useState(agent.color);
  const [modelId, setModelId] = useState<string | null>(agent.model_id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = agentSettingsHaveChanges(agent, { name, description, color, modelId });

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updatedAgent = await updateAgent(agent.id, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        color,
        model_id: modelId,
      });
      setSaved(true);
      onUpdated(updatedAgent);
      void mutate(agentsUrl());
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [agent.id, name, description, color, modelId, mutate, onUpdated]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteAgent(agent.id);
      router.push("/dashboard/agents");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete agent");
      setDeleting(false);
    }
  }, [agent.id, router]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Metadata */}
      <section className="theme-surface theme-border space-y-5 rounded-2xl border p-5 sm:p-6">
        <div>
          <h2 className="theme-text text-base font-semibold">Identity and model</h2>
          <p className="theme-text-muted mt-1 text-sm">Update the workspace-facing profile and primary chat model.</p>
        </div>

        <div>
          <label className="theme-text mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="theme-border theme-surface theme-text w-full rounded-lg border px-3 py-2 text-sm focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20"
            placeholder="Human-readable name"
          />
        </div>

        <div>
          <label className="theme-text mb-1 block text-sm font-medium">
            Slug
          </label>
          <input
            type="text"
            value={agent.slug ?? ""}
            readOnly
            className="theme-border theme-surface theme-text w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20"
            placeholder="stable-agent-slug"
          />
          <p className="theme-text-muted mt-1 text-xs">Stable agent-facing reference.</p>
        </div>

        <div>
          <label className="theme-text mb-1 block text-sm font-medium">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="theme-border theme-surface theme-text w-full rounded-lg border px-3 py-2 text-sm focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20"
            placeholder="What this agent does..."
          />
        </div>

        <div>
          <label className="theme-text mb-1 block text-sm font-medium">
            Color
          </label>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>

        <div className="theme-border border-t pt-5">
          <label className="theme-text mb-1 block text-sm font-medium">
            Primary model
          </label>
          <select
            value={modelId ?? ""}
            onChange={(e) => setModelId(e.target.value || null)}
            className="theme-border theme-surface theme-text w-full rounded-lg border px-3 py-2 text-sm focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20"
          >
            <option value="">No model assigned</option>
            {models?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.model_provider} / {m.model} ({m.temperature})
              </option>
            ))}
          </select>
          <p className="theme-text-muted mt-1 text-xs">Used for chat and standard agent execution. Media operations are assigned separately under Capabilities.</p>
        </div>

        <div className="theme-border flex flex-wrap items-center gap-3 border-t pt-5">
          <Button disabled={!dirty || saved} isLoading={saving} onClick={handleSave}>
            {saving ? "Saving" : saved ? "Saved" : "Save changes"}
          </Button>
          {saved ? <span className="text-sm text-emerald-600 dark:text-emerald-300" aria-live="polite">Changes saved.</span> : null}
          {error ? <span className="text-sm text-red-500" role="alert">{error}</span> : null}
        </div>
      </section>

      {/* Danger Zone */}
      <section className="h-fit rounded-2xl border border-red-200/80 bg-red-50/50 p-5 dark:border-red-400/20 dark:bg-red-400/[0.06]">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Danger zone</h2>
        <p className="mt-1 text-xs leading-5 text-red-600/80 dark:text-red-300/70">Deleting an agent removes its assignments and cannot be undone.</p>
        {!confirmDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 text-red-600 hover:bg-red-100 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-400/10"
          >
            Delete Agent
          </Button>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {deleting ? "Deleting" : "Confirm delete"}
            </Button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="theme-text-muted text-sm transition-colors hover:[color:var(--app-text)]"
            >
              Keep agent
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
