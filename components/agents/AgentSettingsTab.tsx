"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { updateAgent, deleteAgent, agentsUrl } from "@/lib/api";
import { useModels } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import type { AgentDefinition } from "@/lib/types";

interface AgentSettingsTabProps {
  agent: AgentDefinition;
  onUpdated: (agent?: AgentDefinition) => void;
}

export function AgentSettingsTab({ agent, onUpdated }: AgentSettingsTabProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { models } = useModels();

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [color, setColor] = useState(agent.color);
  const [modelId, setModelId] = useState<string | null>(agent.model_id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    <div className="max-w-2xl space-y-8">
      {/* Metadata */}
      <section className="space-y-4">
        <h3 className="theme-text text-sm font-semibold">
          Agent Details
        </h3>

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
      </section>

      <hr className="theme-border" />

      {/* Model Assignment */}
      <section className="space-y-4">
        <h3 className="theme-text text-sm font-semibold">
          Model
        </h3>
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
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || saved}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </Button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>

      <hr className="theme-border" />

      {/* Danger Zone */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
          Danger Zone
        </h3>
        {!confirmDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete Agent
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {deleting ? "Deleting..." : "Confirm Delete"}
            </Button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="theme-text-muted text-sm transition-colors hover:[color:var(--app-text)]"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
