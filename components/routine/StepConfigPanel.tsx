"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CouncilFormModal } from "@/components/councils/CouncilFormModal";
import type { RoutineStepType, CouncilDetail, AgentDefinition } from "@/lib/types";
import { ROUTINE_STEP_TYPES, DELEGATION_STRATEGIES } from "@/lib/types";

interface StepConfigPanelProps {
  stepId: string;
  name: string;
  stepType: RoutineStepType;
  agentId: string | null;
  councilId: string | null;
  config: Record<string, unknown>;
  agents: AgentDefinition[];
  councils?: CouncilDetail[];
  onUpdate: (data: {
    name?: string;
    step_type?: RoutineStepType;
    agent_id?: string | null;
    council_id?: string;
    config?: Record<string, unknown>;
  }) => void | Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}

export function StepConfigPanel({
  stepId,
  name,
  stepType,
  agentId,
  councilId,
  config,
  agents,
  councils,
  onUpdate,
  onDelete,
  onClose,
}: StepConfigPanelProps) {
  const [localName, setLocalName] = useState(name);
  const [localStepType, setLocalStepType] = useState<RoutineStepType>(stepType);
  const [localAgentId, setLocalAgentId] = useState(agentId ?? "");
  const [localCouncilId, setLocalCouncilId] = useState(councilId ?? "");
  const [localRoleId, setLocalRoleId] = useState<string>((config?.agent_id as string) ?? agentId ?? "");
  const [localInterval, setLocalInterval] = useState<string>((config?.interval as string) ?? "60s");
  const [localTimeout, setLocalTimeout] = useState<string>((config?.timeout as string) ?? "24h");
  const [localInstructions, setLocalInstructions] = useState<string>(
    (config?.instructions as string) ?? (config?.description as string) ?? (config?.context as string) ?? "",
  );
  const [localCriteria, setLocalCriteria] = useState<string>((config?.criteria as string) ?? "");
  const [localFailureReason, setLocalFailureReason] = useState<string>((config?.failure_reason as string) ?? "");
  const [localMetadata, setLocalMetadata] = useState<string>(
    config?.metadata ? JSON.stringify(config.metadata, null, 2) : "",
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [stepSaving, setStepSaving] = useState(false);
  const [stepSaved, setStepSaved] = useState(false);
  const [councilFormOpen, setCouncilFormOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<CouncilDetail | null>(null);

  useEffect(() => {
    setLocalName(name);
    setLocalStepType(stepType);
    setLocalAgentId(agentId ?? "");
    setLocalCouncilId(councilId ?? "");
    setLocalRoleId((config?.agent_id as string) ?? agentId ?? "");
    setLocalInterval((config?.interval as string) ?? "60s");
    setLocalTimeout((config?.timeout as string) ?? "24h");
    setLocalInstructions((config?.instructions as string) ?? (config?.description as string) ?? (config?.context as string) ?? "");
    setLocalCriteria((config?.criteria as string) ?? "");
    setLocalFailureReason((config?.failure_reason as string) ?? "");
    setLocalMetadata(config?.metadata ? JSON.stringify(config.metadata, null, 2) : "");
    setMetadataError(null);
    setStepSaved(false);
  }, [stepId, name, stepType, agentId, councilId, config]);

  const selectedCouncil = useMemo(
    () => councils?.find((council) => council.id === localCouncilId),
    [councils, localCouncilId],
  );

  const strategyInfo = useMemo(
    () =>
      selectedCouncil
        ? DELEGATION_STRATEGIES.find((strategy) => strategy.id === selectedCouncil.delegation_strategy)
        : null,
    [selectedCouncil],
  );

  const handleSave = async () => {
    setStepSaving(true);
    setStepSaved(false);

    const parsedConfig: Record<string, unknown> = { ...config };

    if (localStepType === "agent" || localStepType === "gate" || localStepType === "cron") {
      if (localRoleId) {
        parsedConfig.agent_id = localRoleId;
      } else {
        delete parsedConfig.agent_id;
      }
    } else {
      delete parsedConfig.agent_id;
    }

    if (localStepType === "cron") {
      parsedConfig.interval = localInterval || "60s";
      parsedConfig.timeout = localTimeout || "24h";
    } else {
      delete parsedConfig.interval;
      delete parsedConfig.timeout;
    }

    if (localStepType === "agent" || localStepType === "gate" || localStepType === "council" || localStepType === "cron") {
      if (localInstructions.trim()) {
        parsedConfig.instructions = localInstructions.trim();
      } else {
        delete parsedConfig.instructions;
      }
    } else {
      delete parsedConfig.instructions;
    }
    delete parsedConfig.description;
    delete parsedConfig.context;
    delete parsedConfig.max_turns;

    if (localStepType === "gate") {
      if (localCriteria.trim()) {
        parsedConfig.criteria = localCriteria.trim();
      } else {
        delete parsedConfig.criteria;
      }
    } else {
      delete parsedConfig.criteria;
    }

    if (localStepType === "terminal_fail") {
      parsedConfig.failure_reason = localFailureReason || "Routine terminated with failure";
    } else {
      delete parsedConfig.failure_reason;
    }

    if (localMetadata.trim()) {
      try {
        parsedConfig.metadata = JSON.parse(localMetadata);
        setMetadataError(null);
      } catch {
        setMetadataError("Invalid JSON");
        setStepSaving(false);
        return;
      }
    } else {
      delete parsedConfig.metadata;
    }

    try {
      await onUpdate({
        name: localName !== name ? localName : undefined,
        step_type: localStepType !== stepType ? localStepType : undefined,
        agent_id:
          localStepType === "council" || localStepType === "terminal" || localStepType === "terminal_fail"
            ? undefined
            : localAgentId !== (agentId ?? "")
              ? localAgentId || undefined
              : undefined,
        council_id:
          localStepType === "council"
            ? localCouncilId !== (councilId ?? "")
              ? localCouncilId || undefined
              : undefined
            : undefined,
        config: parsedConfig,
      });
      setStepSaved(true);
      setTimeout(() => setStepSaved(false), 2000);
    } finally {
      setStepSaving(false);
    }
  };

  const handleEditCouncil = () => {
    if (!selectedCouncil) return;
    setEditingCouncil(selectedCouncil);
    setCouncilFormOpen(true);
  };

  const handleCreateCouncil = () => {
    setEditingCouncil(null);
    setCouncilFormOpen(true);
  };

  return (
    <>
      <div className="absolute inset-0 z-10 md:relative md:inset-auto w-full md:w-80 border-l-0 md:border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Configure Step</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Step Name</label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              placeholder="Step name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Step Type</label>
            <select
              value={localStepType}
              onChange={(e) => setLocalStepType(e.target.value as RoutineStepType)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {ROUTINE_STEP_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {localStepType === "council" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Council</label>
                <select
                  value={localCouncilId}
                  onChange={(e) => setLocalCouncilId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">Select a council…</option>
                  {councils?.map((council) => (
                    <option key={council.id} value={council.id}>
                      {council.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCouncil && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-purple-100 text-purple-600 text-xs font-bold dark:bg-purple-900/50 dark:text-purple-300">
                      ⚑
                    </span>
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">{selectedCouncil.name}</span>
                  </div>

                  {selectedCouncil.description && (
                    <p className="text-xs text-purple-700 dark:text-purple-300">{selectedCouncil.description}</p>
                  )}

                  <div className="space-y-1 text-xs text-purple-600 dark:text-purple-400">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Leader:</span>
                      <span>{selectedCouncil.leader_agent?.name ?? "Unknown"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Strategy:</span>
                      <span>{strategyInfo?.label ?? selectedCouncil.delegation_strategy}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Members:</span>
                      <span>{selectedCouncil.members?.length ?? 0}</span>
                    </div>
                  </div>

                  {strategyInfo && (
                    <p className="text-[11px] text-purple-500 dark:text-purple-400 italic">{strategyInfo.description}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleEditCouncil}
                    className="w-full mt-1 rounded-sm border border-purple-300 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 transition-colors dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/50"
                  >
                    Edit Council
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleCreateCouncil}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create New Council
              </button>

              {(!councils || councils.length === 0) && !selectedCouncil && (
                <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  No councils available. Create one to use as a routine step.
                </p>
              )}
            </>
          )}

          {localStepType === "council" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Step Instructions</label>
                <textarea
                  value={localInstructions}
                  onChange={(e) => setLocalInstructions(e.target.value)}
                  rows={4}
                  placeholder="Instructions for this council step."
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>

            </>
          )}

          {(localStepType === "agent" || localStepType === "gate" || localStepType === "cron") && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Agent</label>
                <select
                  value={localAgentId}
                  onChange={(e) => {
                    setLocalAgentId(e.target.value);
                    setLocalRoleId(e.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">Select an agent…</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {localAgentId && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {agents.find((agent) => agent.id === localAgentId)?.description ?? ""}
                  </p>
                )}
              </div>

              {localStepType === "gate" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gate Criteria</label>
                    <textarea
                      value={localCriteria}
                      onChange={(e) => setLocalCriteria(e.target.value)}
                      rows={3}
                      placeholder="Describe what must be true for this gate to pass."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>

                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    Gate steps produce pass/fail outcomes. Use edge settings to cap retry loops.
                  </p>
                </>
              )}

              {localStepType === "cron" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Interval</label>
                    <input
                      type="text"
                      value={localInterval}
                      onChange={(e) => setLocalInterval(e.target.value)}
                      placeholder="60s"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      How often the agent runs. Examples: 30s, 5m, 1h
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Timeout</label>
                    <input
                      type="text"
                      value={localTimeout}
                      onChange={(e) => setLocalTimeout(e.target.value)}
                      placeholder="24h"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      Maximum total runtime before the step fails. Examples: 1h, 24h, 2d
                    </p>
                  </div>

                  <p className="text-xs text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg px-3 py-2">
                    Cron steps run an agent on a recurring interval. The agent signals completion by including
                    {" "}
                    <code className="font-mono text-[11px]">CRON_DONE:PASS</code>
                    {" "}
                    or
                    {" "}
                    <code className="font-mono text-[11px]">CRON_DONE:FAIL</code>
                    {" "}
                    in its output.
                  </p>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Step Instructions</label>
                <textarea
                  value={localInstructions}
                  onChange={(e) => setLocalInstructions(e.target.value)}
                  rows={4}
                  placeholder="Task-specific instructions for this step."
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Step Metadata (JSON)
                </label>
                <textarea
                  value={localMetadata}
                  onChange={(e) => {
                    setLocalMetadata(e.target.value);
                    setMetadataError(null);
                  }}
                  rows={3}
                  placeholder='{"require_human_review": true}'
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-mono text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-1 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 ${
                    metadataError
                      ? "border-red-400 focus:border-red-400 focus:ring-red-400"
                      : "border-gray-300 focus:border-deep-space-blue-400 focus:ring-deep-space-blue-400 dark:border-gray-600"
                  }`}
                />
                {metadataError && <p className="mt-1 text-[10px] text-red-500">{metadataError}</p>}
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Arbitrary JSON passed to the agent via {"{{ step.metadata }}"} template variable.
                </p>
              </div>
            </>
          )}

          {localStepType === "terminal_fail" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Failure Reason</label>
              <textarea
                value={localFailureReason}
                onChange={(e) => setLocalFailureReason(e.target.value)}
                rows={3}
                placeholder="Routine terminated with failure"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                The reason shown when the routine reaches this terminal failure node.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <Button onClick={handleSave} size="sm" className="w-full" disabled={stepSaving || stepSaved}>
            {stepSaving ? "Applying…" : stepSaved ? "Applied" : "Apply"}
          </Button>
          <Button onClick={onDelete} variant="danger" size="sm" className="w-full">
            Delete Step
          </Button>
        </div>
      </div>

      <CouncilFormModal
        open={councilFormOpen}
        onClose={() => {
          setCouncilFormOpen(false);
          setEditingCouncil(null);
        }}
        onSaved={() => {
          setCouncilFormOpen(false);
          setEditingCouncil(null);
        }}
        council={editingCouncil}
      />
    </>
  );
}
