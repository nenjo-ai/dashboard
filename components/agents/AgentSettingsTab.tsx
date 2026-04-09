"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { updateAgent, deleteAgent } from "@/lib/api";
import { useModels } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import type { AgentDefinition } from "@/lib/types";

interface AgentSettingsTabProps {
  agent: AgentDefinition;
  onUpdated: () => void;
}

export function AgentSettingsTab({ agent, onUpdated }: AgentSettingsTabProps) {
  const router = useRouter();
  const { models } = useModels();

  const [displayName, setDisplayName] = useState(agent.display_name ?? "");
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
      await updateAgent(agent.id, {
        name: name.trim() || undefined,
        display_name: displayName.trim() || undefined,
        description: description.trim() || undefined,
        color,
        model_id: modelId,
      });
      setSaved(true);
      onUpdated();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [agent.id, name, displayName, description, color, modelId, onUpdated]);

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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Agent Details
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Human-readable name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Identifier
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="machine-readable-name"
          />
          <p className="mt-1 text-xs text-gray-400">Used in templates as the role identifier.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="What this agent does..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Color
          </label>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Model Assignment */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Model
        </h3>
        <select
          value={modelId ?? ""}
          onChange={(e) => setModelId(e.target.value || null)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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

      <hr className="border-gray-200 dark:border-gray-700" />

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
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
