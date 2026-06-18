"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Mic, RotateCcw, Save, Video, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { configureAgentMedia } from "@/lib/api";
import { useAgentMedia, useMediaCapabilities, useMediaConfig } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import {
  NATIVE_MEDIA_CAPABILITIES,
  type MediaAssignment,
  type MediaProviderConfig,
  type MediaRequirementInput,
  type NativeMediaCapability,
  type NativeMediaCapabilityInfo,
  type NativeMediaProvider,
} from "@/lib/types";

interface AgentMediaTabProps {
  agentId: string;
}

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Volume2,
  voice: Mic,
} as const;

function capabilityLabel(
  capability: NativeMediaCapability,
  catalog: NativeMediaCapabilityInfo[],
): string {
  return catalog.find((item) => item.id === capability)?.label ?? capability;
}

function capabilityKind(
  capability: NativeMediaCapability,
  catalog: NativeMediaCapabilityInfo[],
): NativeMediaCapabilityInfo["kind"] {
  return catalog.find((item) => item.id === capability)?.kind ?? "voice";
}

function providerLabel(provider: NativeMediaProvider | string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "xai") return "xAI";
  return provider;
}

function assignmentKey(assignment: MediaAssignment): string {
  return [
    assignment.capability,
    assignment.provider ?? "",
    assignment.model ?? "",
  ].join(":");
}

function localRequirements(assignments: MediaAssignment[]): MediaRequirementInput[] {
  const seen = new Set<string>();
  const requirements: MediaRequirementInput[] = [];

  for (const assignment of assignments) {
    if (assignment.assignment_source !== "local") continue;
    const key = assignmentKey(assignment);
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({
      capability: assignment.capability,
      provider: assignment.provider,
      model: assignment.model,
    });
  }

  return requirements;
}

function configuredCapabilities(
  providers: MediaProviderConfig[],
  assignments: MediaAssignment[],
): NativeMediaCapability[] {
  const capabilitySet = new Set<NativeMediaCapability>();
  for (const provider of providers) {
    for (const capability of provider.capabilities) {
      capabilitySet.add(capability);
    }
  }
  for (const assignment of assignments) {
    capabilitySet.add(assignment.capability);
  }
  return Array.from(capabilitySet);
}

function providersForCapability(
  providers: MediaProviderConfig[],
  capability: NativeMediaCapability,
): NativeMediaProvider[] {
  return Array.from(
    new Set(
      providers
        .filter((provider) => provider.capabilities.includes(capability))
        .map((provider) => provider.provider),
    ),
  );
}

function modelHints(
  providers: MediaProviderConfig[],
  capability: NativeMediaCapability,
  provider: NativeMediaProvider | null | undefined,
): string[] {
  if (!provider) return [];
  return Array.from(
    new Set(
      providers
        .filter(
          (item) =>
            item.provider === provider && item.capabilities.includes(capability),
        )
        .map((item) => item.model)
        .filter(Boolean),
    ),
  );
}

export function AgentMediaTab({ agentId }: AgentMediaTabProps) {
  const { mediaConfig, isLoading: configLoading } = useMediaConfig();
  const { mediaCapabilities } = useMediaCapabilities();
  const {
    mediaAssignments,
    isLoading: assignmentsLoading,
    isError,
    mutate,
  } = useAgentMedia(agentId);
  const [draft, setDraft] = useState<MediaRequirementInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerConfigs = useMemo(
    () => mediaConfig?.providers ?? [],
    [mediaConfig?.providers],
  );
  const assignments = useMemo(
    () => mediaAssignments?.media ?? [],
    [mediaAssignments?.media],
  );
  const capabilityCatalog = mediaCapabilities?.capabilities ?? NATIVE_MEDIA_CAPABILITIES;
  const managedAssignments = assignments.filter(
    (assignment) => assignment.assignment_source !== "local",
  );

  useEffect(() => {
    setDraft(localRequirements(assignments));
    setDirty(false);
    setError(null);
    setSaved(false);
  }, [assignments]);

  const capabilities = useMemo(
    () => configuredCapabilities(providerConfigs, assignments),
    [providerConfigs, assignments],
  );

  const assignedCapabilities = useMemo(
    () => new Set(draft.map((item) => item.capability)),
    [draft],
  );

  const updateDraft = useCallback(
    (updater: (previous: MediaRequirementInput[]) => MediaRequirementInput[]) => {
      setDraft((previous) => updater(previous));
      setDirty(true);
      setSaved(false);
      setError(null);
    },
    [],
  );

  const toggleCapability = useCallback(
    (capability: NativeMediaCapability) => {
      updateDraft((previous) => {
        const exists = previous.some((item) => item.capability === capability);
        if (exists) return previous.filter((item) => item.capability !== capability);
        return [...previous, { capability, provider: null, model: null }];
      });
    },
    [updateDraft],
  );

  const updateRequirement = useCallback(
    (
      capability: NativeMediaCapability,
      patch: Partial<MediaRequirementInput>,
    ) => {
      updateDraft((previous) =>
        previous.map((item) =>
          item.capability === capability ? { ...item, ...patch } : item,
        ),
      );
    },
    [updateDraft],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const media = draft.map((item) => ({
        capability: item.capability,
        provider: item.provider || null,
        model: item.provider ? item.model?.trim() || null : null,
      }));
      const next = await configureAgentMedia(agentId, { media });
      await mutate(next, { revalidate: false });
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save media assignments.");
    } finally {
      setSaving(false);
    }
  }, [agentId, draft, mutate]);

  const reset = useCallback(() => {
    setDraft(localRequirements(assignments));
    setDirty(false);
    setError(null);
    setSaved(false);
  }, [assignments]);

  if (configLoading || assignmentsLoading) {
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
        <p className="text-sm text-red-500">Failed to load media assignments.</p>
      </div>
    );
  }

  if (capabilities.length === 0) {
    return (
      <div className="theme-border rounded-lg border border-dashed px-4 py-6 text-center">
        <p className="theme-text-muted text-sm">
          No media providers configured. Add providers in Agents / Media first.
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
              Assign Media
            </span>
            <span className="theme-text-muted ml-2 text-xs">
              {assignedCapabilities.size} assigned
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

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {capabilities.map((capability) => {
            const kind = capabilityKind(capability, capabilityCatalog);
            const Icon = KIND_ICON[kind];
            const requirement = draft.find((item) => item.capability === capability);
            const isAssigned = !!requirement;
            const providerOptions = providersForCapability(providerConfigs, capability);
            const hints = modelHints(providerConfigs, capability, requirement?.provider);

            return (
              <div key={capability} className="px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={() => toggleCapability(capability)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-deep-space-blue-500 focus:ring-deep-space-blue-400 dark:border-gray-600"
                    />
                    <span className="min-w-0">
                      <span className="theme-text flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4 text-gray-400" />
                        {capabilityLabel(capability, capabilityCatalog)}
                      </span>
                      <span className="theme-text-muted mt-1 block text-xs">
                        Leave unpinned only when one configured provider supports this capability.
                      </span>
                    </span>
                  </label>

                  {isAssigned && requirement && (
                    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] lg:w-[520px]">
                      <Select
                        value={requirement.provider ?? ""}
                        onChange={(event) => {
                          const provider = event.target.value
                            ? (event.target.value as NativeMediaProvider)
                            : null;
                          updateRequirement(capability, {
                            provider,
                            model: null,
                          });
                        }}
                        className="h-9"
                      >
                        <option value="">Unpinned provider</option>
                        {providerOptions.map((provider) => (
                          <option key={provider} value={provider}>
                            {providerLabel(provider)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        value={requirement.model ?? ""}
                        onChange={(event) =>
                          updateRequirement(capability, {
                            model: event.target.value,
                          })
                        }
                        disabled={!requirement.provider}
                        list={`agent-media-${capability}-models`}
                        placeholder={
                          requirement.provider
                            ? "Optional model pin"
                            : "Pin provider before model"
                        }
                        className="h-9"
                      />
                      <datalist id={`agent-media-${capability}-models`}>
                        {hints.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {managedAssignments.length > 0 && (
        <section className="theme-border theme-surface rounded-xl border p-4">
          <h3 className="theme-text text-sm font-semibold">Package Assignments</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {managedAssignments.map((assignment) => (
              <span
                key={assignment.id}
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                  "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
                )}
              >
                {capabilityLabel(assignment.capability, capabilityCatalog)}
                {assignment.provider ? ` / ${providerLabel(assignment.provider)}` : ""}
                {assignment.model ? ` / ${assignment.model}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
    </div>
  );
}
