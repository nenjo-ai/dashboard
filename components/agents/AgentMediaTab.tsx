"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, RotateCcw, Save, Video, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { configureAgentModelAssignments } from "@/lib/api";
import { useAgentModelAssignments, useModels } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import {
  ASSIGNMENT_CAPABILITIES,
  modelCapabilityLabel,
  type Model,
  type ModelAssignment,
  type ModelAssignmentInput,
  type ModelCapability,
} from "@/lib/types";

interface AgentMediaTabProps {
  agentId: string;
}

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Volume2,
} as const;

function localDraft(assignments: ModelAssignment[]): ModelAssignmentInput[] {
  const draft: ModelAssignmentInput[] = [];
  const seen = new Set<string>();

  for (const assignment of assignments) {
    if (assignment.assignment_source !== "local") continue;
    if (seen.has(assignment.capability)) continue;
    seen.add(assignment.capability);
    draft.push({
      capability: assignment.capability,
      model_id: assignment.model_id,
    });
  }

  return draft;
}

function modelsForCapability(
  models: Model[],
  capability: string,
): Model[] {
  return models.filter((model) =>
    (model.capabilities ?? []).includes(capability as ModelCapability),
  );
}

function modelDisplayName(model: Model): string {
  const provider = model.model_provider.startsWith("openai-compatible:")
    ? "openai-compatible"
    : model.model_provider;
  return `${provider} / ${model.model}`;
}

export function AgentMediaTab({ agentId }: AgentMediaTabProps) {
  const { models, isLoading: modelsLoading } = useModels();
  const {
    modelAssignments,
    isLoading: assignmentsLoading,
    isError,
    mutate,
  } = useAgentModelAssignments(agentId);
  const [draft, setDraft] = useState<ModelAssignmentInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignments = useMemo(
    () => modelAssignments?.assignments ?? [],
    [modelAssignments?.assignments],
  );
  const modelList = useMemo(() => models ?? [], [models]);
  const modelById = useMemo(
    () => new Map(modelList.map((model) => [model.id, model])),
    [modelList],
  );
  const packageAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) => assignment.assignment_source !== "local",
      ),
    [assignments],
  );

  const packageByCapability = useMemo(() => {
    const map = new Map<string, ModelAssignment[]>();
    for (const assignment of packageAssignments) {
      const list = map.get(assignment.capability) ?? [];
      list.push(assignment);
      map.set(assignment.capability, list);
    }
    return map;
  }, [packageAssignments]);

  useEffect(() => {
    setDraft(localDraft(assignments));
    setDirty(false);
    setError(null);
    setSaved(false);
  }, [assignments]);

  const assignedCapabilities = useMemo(() => new Set(draft.map((item) => item.capability)), [draft]);

  const updateDraft = useCallback(
    (updater: (previous: ModelAssignmentInput[]) => ModelAssignmentInput[]) => {
      setDraft((previous) => updater(previous));
      setDirty(true);
      setSaved(false);
      setError(null);
    },
    [],
  );

  const selectModelForCapability = useCallback(
    (capability: string, modelId: string) => {
      updateDraft((previous) => {
        const withoutCapability = previous.filter(
          (item) => item.capability !== capability,
        );
        return modelId
          ? [...withoutCapability, { capability, model_id: modelId }]
          : withoutCapability;
      });
    },
    [updateDraft],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const seenCapabilities = new Set<string>();
      const payload = draft.filter((item) => {
        if (seenCapabilities.has(item.capability)) return false;
        seenCapabilities.add(item.capability);
        return true;
      });
      const next = await configureAgentModelAssignments(agentId, {
        assignments: payload.map((item) => ({
          capability: item.capability,
          model_id: item.model_id,
        })),
      });
      await mutate(next, { revalidate: false });
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save model capability assignments.",
      );
    } finally {
      setSaving(false);
    }
  }, [agentId, draft, mutate]);

  const reset = useCallback(() => {
    setDraft(localDraft(assignments));
    setDirty(false);
    setError(null);
    setSaved(false);
  }, [assignments]);

  if (modelsLoading || assignmentsLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="theme-surface-muted h-14 animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="theme-border rounded-lg border border-dashed px-4 py-6 text-center">
        <p className="text-sm text-red-500">
          Failed to load model capability assignments.
        </p>
      </div>
    );
  }

  const modelsWithAssignable = modelList.filter((model) =>
    (model.capabilities ?? []).some((cap) =>
      ASSIGNMENT_CAPABILITIES.some((option) => option.id === cap),
    ),
  );

  if (modelsWithAssignable.length === 0 && packageAssignments.length === 0) {
    return (
      <div className="theme-border rounded-lg border border-dashed px-4 py-6 text-center">
        <p className="theme-text-muted text-sm">
          No models advertise assignable capabilities yet. Add image, video, or
          audio capabilities on models in Agents → Models first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="theme-border theme-surface rounded-xl border">
        <div className="theme-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <div>
            <span className="theme-text-muted text-xs font-semibold uppercase tracking-wider">
              Model capabilities
            </span>
            <span className="theme-text-muted ml-2 text-xs">
              {assignedCapabilities.size} configured · {draft.length} model
              {draft.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={reset}
              disabled={!dirty || saving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
              isLoading={saving}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>

        <p className="theme-text-muted border-b border-gray-100 px-4 py-2 text-xs leading-5 dark:border-gray-800">
          Select the configured model each operation must use. A local selection
          overrides a package assignment; chat still uses the primary model on
          Settings.
        </p>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {ASSIGNMENT_CAPABILITIES.map((capabilityInfo) => {
            const capability = capabilityInfo.id;
            const Icon = KIND_ICON[capabilityInfo.kind];
            const assignment = draft.find((item) => item.capability === capability);
            const candidates = modelsForCapability(modelList, capability);
            const packageRows = packageByCapability.get(capability) ?? [];
            const selectedModel = assignment
              ? modelById.get(assignment.model_id)
              : undefined;

            return (
              <div key={capability} className="px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <span className="theme-text flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-gray-400" />
                      {capabilityInfo.label}
                    </span>
                    <span className="theme-text-muted mt-1 block text-xs">
                      {candidates.length === 0
                        ? "No org models advertise this capability."
                        : `${candidates.length} compatible model${candidates.length === 1 ? "" : "s"}.`}
                      {packageRows.length > 0 && (
                        <>
                          {" "}
                          Package provides{" "}
                          {packageRows
                            .map((row) => {
                              const model = modelById.get(row.model_id);
                              return model
                                ? modelDisplayName(model)
                                : row.model_id.slice(0, 8);
                            })
                            .join(", ")}
                          ; a local selection overrides it.
                        </>
                      )}
                    </span>
                  </div>

                  <Select
                    value={assignment?.model_id ?? ""}
                    onChange={(event) =>
                      selectModelForCapability(capability, event.target.value)
                    }
                    disabled={candidates.length === 0 && !assignment}
                    className="h-9 w-full lg:w-[420px]"
                    aria-label={`${capabilityInfo.label} model`}
                  >
                    <option value="">Not configured locally</option>
                    {candidates.map((model) => (
                      <option key={model.id} value={model.id}>
                        {modelDisplayName(model)}
                      </option>
                    ))}
                    {assignment &&
                      !candidates.some((model) => model.id === assignment.model_id) && (
                        <option value={assignment.model_id}>
                          {selectedModel
                            ? modelDisplayName(selectedModel)
                            : assignment.model_id}{" "}
                          (missing capability)
                        </option>
                      )}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {packageAssignments.length > 0 && (
        <section className="theme-border theme-surface rounded-xl border p-4">
          <h3 className="theme-text text-sm font-semibold">
            Package assignments
          </h3>
          <p className="theme-text-muted mt-1 text-xs">
            Managed by package installs. Local rows above replace these at
            resolve time without removing the package row.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {packageAssignments.map((assignment) => {
              const model = modelById.get(assignment.model_id);
              return (
                <span
                  key={assignment.id}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                    "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
                  )}
                >
                  {modelCapabilityLabel(assignment.capability)}
                  {" / "}
                  {model ? modelDisplayName(model) : assignment.model_id}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
      )}
    </div>
  );
}
