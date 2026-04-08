"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CouncilFormModal } from "@/components/councils/CouncilFormModal";
import type { RoutineStepType, CouncilDetail, AgentDefinition, Lambda } from "@/lib/types";
import { ROUTINE_STEP_TYPES, DELEGATION_STRATEGIES, LAMBDA_INTERPRETERS } from "@/lib/types";
import { fetchAgents, fetchLambdas } from "@/lib/api";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepConfigPanelProps {
  stepId: string;
  name: string;
  stepType: RoutineStepType;
  agentId: string | null;
  councilId: string | null;
  lambdaId?: string | null;
  config: Record<string, unknown>;
  agents: AgentDefinition[];
  councils?: CouncilDetail[];
  onUpdate: (data: {
    name?: string;
    step_type?: RoutineStepType;
    agent_id?: string | null;
    council_id?: string;
    lambda_id?: string | null;
    config?: Record<string, unknown>;
  }) => void | Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepConfigPanel({
  stepId,
  name,
  stepType,
  agentId,
  councilId,
  lambdaId,
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
  const [localLambdaId, setLocalLambdaId] = useState(lambdaId ?? "");
  const [localRoleId, setLocalRoleId] = useState<string>((config?.agent_id as string) ?? "");
  const [localInterval, setLocalInterval] = useState<string>((config?.interval as string) ?? "60s");
  const [localTimeout, setLocalTimeout] = useState<string>((config?.timeout as string) ?? "24h");
  const [localLambdaTimeout, setLocalLambdaTimeout] = useState<string>((config?.timeout as string) ?? "5m");
  const [roles, setRoles] = useState<AgentDefinition[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [lambdas, setLambdas] = useState<Lambda[]>([]);
  const [loadingLambdas, setLoadingLambdas] = useState(true);
  // Cron mode: "agent" (default) or "lambda" — inferred from whether lambda_id is set
  const [localCronMode, setLocalCronMode] = useState<"agent" | "lambda">(
    lambdaId && stepType === "cron" ? "lambda" : "agent"
  );
  const [localCronLambdaId, setLocalCronLambdaId] = useState<string>(
    stepType === "cron" ? (lambdaId ?? (config?.lambda_id as string) ?? "") : ""
  );
  const [localFailureReason, setLocalFailureReason] = useState<string>(
    (config?.failure_reason as string) ?? ""
  );
  const [localMetadata, setLocalMetadata] = useState<string>(
    config?.metadata ? JSON.stringify(config.metadata, null, 2) : ""
  );
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [stepSaving, setStepSaving] = useState(false);
  const [stepSaved, setStepSaved] = useState(false);

  // Council form modal state
  const [councilFormOpen, setCouncilFormOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<CouncilDetail | null>(null);

  // Load roles from API
  useEffect(() => {
    async function loadRoles() {
      try {
        const data = await fetchAgents();
        setRoles(data);
      } catch (e) {
        console.error("Failed to load roles:", e);
      } finally {
        setLoadingRoles(false);
      }
    }
    loadRoles();
  }, []);

  // Load lambdas from API
  useEffect(() => {
    async function loadLambdas() {
      try {
        const data = await fetchLambdas();
        setLambdas(data);
      } catch (e) {
        console.error("Failed to load lambdas:", e);
      } finally {
        setLoadingLambdas(false);
      }
    }
    loadLambdas();
  }, []);

  // Sync when selection changes
  useEffect(() => {
    setLocalName(name);
    setLocalStepType(stepType);
    setLocalAgentId(agentId ?? "");
    setLocalCouncilId(councilId ?? "");
    setLocalLambdaId(lambdaId ?? "");
    setLocalRoleId((config?.agent_id as string) ?? "");
    setLocalInterval((config?.interval as string) ?? "60s");
    setLocalTimeout((config?.timeout as string) ?? "24h");
    setLocalLambdaTimeout((config?.timeout as string) ?? "5m");
    setLocalCronMode(lambdaId && stepType === "cron" ? "lambda" : "agent");
    setLocalCronLambdaId(stepType === "cron" ? (lambdaId ?? (config?.lambda_id as string) ?? "") : "");
    setLocalFailureReason((config?.failure_reason as string) ?? "");
    setLocalMetadata(config?.metadata ? JSON.stringify(config.metadata, null, 2) : "");
    setMetadataError(null);
    setStepSaved(false);
  }, [stepId, name, stepType, agentId, councilId, lambdaId, config]);

  // Find the selected council for preview
  const selectedCouncil = useMemo(
    () => councils?.find((c) => c.id === localCouncilId),
    [councils, localCouncilId],
  );

  // Find the strategy description
  const strategyInfo = useMemo(
    () => selectedCouncil
      ? DELEGATION_STRATEGIES.find((s) => s.id === selectedCouncil.delegation_strategy)
      : null,
    [selectedCouncil],
  );

  const handleSave = async () => {
    setStepSaving(true);
    setStepSaved(false);
    // Build config with agent_id
    const parsedConfig: Record<string, unknown> = { ...config };
    if (localStepType === "agent" || localStepType === "gate" || localStepType === "cron") {
      if (localRoleId) {
        parsedConfig.agent_id = localRoleId;
      } else {
        delete parsedConfig.agent_id;
      }
    }
    if (localStepType === "cron") {
      parsedConfig.interval = localInterval || "60s";
      parsedConfig.timeout = localTimeout || "24h";
      if (localCronMode === "lambda" && localCronLambdaId) {
        parsedConfig.lambda_id = localCronLambdaId;
      } else {
        delete parsedConfig.lambda_id;
      }
    }
    if (localStepType === "lambda") {
      parsedConfig.timeout = localLambdaTimeout || "5m";
    }
    if (localStepType === "terminal_fail") {
      parsedConfig.failure_reason = localFailureReason || "Routine terminated with failure";
    }

    // Parse and include metadata JSON if present
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
        // For council steps, clear agent_id; for agent steps, clear council_id
        agent_id: localStepType === "council" || localStepType === "lambda"
          ? undefined
          : localAgentId !== (agentId ?? "") ? localAgentId || undefined : undefined,
        council_id: localStepType === "council"
          ? localCouncilId !== (councilId ?? "") ? localCouncilId || undefined : undefined
          : undefined,
        lambda_id: localStepType === "lambda"
          ? localLambdaId || null
          : localStepType === "cron" && localCronMode === "lambda"
            ? localCronLambdaId || null
            : null,
        config: parsedConfig,
      });
      setStepSaved(true);
      setTimeout(() => setStepSaved(false), 2000);
    } catch {
      // Error is handled by the parent
    } finally {
      setStepSaving(false);
    }
  };

  const handleEditCouncil = () => {
    if (selectedCouncil) {
      setEditingCouncil(selectedCouncil);
      setCouncilFormOpen(true);
    }
  };

  const handleCreateCouncil = () => {
    setEditingCouncil(null);
    setCouncilFormOpen(true);
  };

  const handleCouncilSaved = () => {
    // The parent will re-fetch councils via SWR, so we just close the modal
    setCouncilFormOpen(false);
    setEditingCouncil(null);
  };

  return (
    <>
      <div className="absolute inset-0 z-10 md:relative md:inset-auto w-full md:w-80 border-l-0 md:border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Configure Step
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Step Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Step Name
            </label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              placeholder="Step name"
            />
          </div>

          {/* Step Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Step Type
            </label>
            <select
              value={localStepType}
              onChange={(e) => setLocalStepType(e.target.value as RoutineStepType)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {ROUTINE_STEP_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Council Selection (for council steps) */}
          {localStepType === "council" && (
            <>
              {/* Council Selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Council
                </label>
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

              {/* Council Preview */}
              {selectedCouncil && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-purple-100 text-purple-600 text-xs font-bold dark:bg-purple-900/50 dark:text-purple-300">
                      ⚑
                    </span>
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      {selectedCouncil.name}
                    </span>
                  </div>

                  {selectedCouncil.description && (
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      {selectedCouncil.description}
                    </p>
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
                    <p className="text-[11px] text-purple-500 dark:text-purple-400 italic">
                      {strategyInfo.description}
                    </p>
                  )}

                  {/* Edit Council button */}
                  <button
                    type="button"
                    onClick={handleEditCouncil}
                    className="w-full mt-1 rounded-sm border border-purple-300 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50 transition-colors dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/50"
                  >
                    Edit Council
                  </button>
                </div>
              )}

              {/* Create New Council link */}
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

          {/* Role Selection (for agent, gate, and cron steps) */}
          {/* Failure Reason (for terminal_fail steps) */}
          {localStepType === "terminal_fail" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Failure Reason
              </label>
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
              <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                This step marks the routine as failed. Connect it to a gate or cron fail output to handle error cases.
              </p>
            </div>
          )}

          {/* Lambda Selection */}
          {localStepType === "lambda" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Lambda
                </label>
                {loadingLambdas ? (
                  <div className="h-10 animate-pulse bg-gray-200 rounded-sm dark:bg-gray-700"></div>
                ) : (
                  <select
                    value={localLambdaId}
                    onChange={(e) => setLocalLambdaId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Select a lambda...</option>
                    {lambdas.map((lambda) => (
                      <option key={lambda.id} value={lambda.id}>
                        {lambda.name} ({lambda.interpreter})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Lambda Preview */}
              {localLambdaId && (() => {
                const selectedLambda = lambdas.find((l) => l.id === localLambdaId);
                if (!selectedLambda) return null;
                return (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-orange-100 text-orange-600 text-xs font-bold dark:bg-orange-900/50 dark:text-orange-300">
                        {"\u03BB"}
                      </span>
                      <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        {selectedLambda.name}
                      </span>
                    </div>
                    {selectedLambda.description && (
                      <p className="text-xs text-orange-700 dark:text-orange-300">
                        {selectedLambda.description}
                      </p>
                    )}
                    <div className="space-y-1 text-xs text-orange-600 dark:text-orange-400">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Path:</span>
                        <span className="font-mono">{selectedLambda.path}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Interpreter:</span>
                        <span>{LAMBDA_INTERPRETERS.find((i) => i.id === selectedLambda.interpreter)?.label ?? selectedLambda.interpreter}</span>
                      </div>
                    </div>
                    {/* Body preview (first 5 lines) */}
                    <pre className="mt-2 max-h-24 overflow-auto rounded-sm bg-orange-100 dark:bg-orange-900/40 p-2 text-[11px] font-mono text-orange-800 dark:text-orange-200">
                      {selectedLambda.body.split("\n").slice(0, 8).join("\n")}
                      {selectedLambda.body.split("\n").length > 8 ? "\n..." : ""}
                    </pre>
                  </div>
                );
              })()}

              {/* Timeout */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Timeout
                </label>
                <input
                  type="text"
                  value={localLambdaTimeout}
                  onChange={(e) => setLocalLambdaTimeout(e.target.value)}
                  placeholder="5m"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Maximum execution time. Examples: 30s, 5m, 1h
                </p>
              </div>

              <p className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-2">
                Lambda steps execute deterministic scripts without an LLM. Exit code 0 = pass, non-zero = fail — use pass/fail edges to branch the routine based on the result. Context is injected via NENJO_* environment variables.
              </p>

              {(!lambdas || lambdas.length === 0) && !loadingLambdas && (
                <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  No lambdas available. Create one in the Lambdas section below.
                </p>
              )}
            </>
          )}

          {(localStepType === "agent" || localStepType === "gate" || localStepType === "cron") && (
            <>
              {/* Agent selection for agent/gate/cron steps */}
              {!(localStepType === "cron" && localCronMode === "lambda") && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Agent
                  </label>
                  <select
                    value={localAgentId}
                    onChange={(e) => setLocalAgentId(e.target.value)}
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
                      {agents.find((a) => a.id === localAgentId)?.description ?? ""}
                    </p>
                  )}
                </div>
              )}

              {localStepType === "gate" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  Gate steps produce pass/fail outcomes. Use edge conditions to route the flow based on the result.
                </p>
              )}

              {localStepType === "cron" && (
                <>
                  {/* Cron Mode Toggle */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Execution Mode
                    </label>
                    <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setLocalCronMode("agent")}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                          localCronMode === "agent"
                            ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200"
                            : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                        }`}
                      >
                        Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalCronMode("lambda")}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                          localCronMode === "lambda"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200"
                            : "bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                        }`}
                      >
                        Lambda
                      </button>
                    </div>
                  </div>

                  {/* Lambda selector for cron+lambda mode */}
                  {localCronMode === "lambda" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Lambda
                        </label>
                        {loadingLambdas ? (
                          <div className="h-10 animate-pulse bg-gray-200 rounded-sm dark:bg-gray-700"></div>
                        ) : (
                          <select
                            value={localCronLambdaId}
                            onChange={(e) => setLocalCronLambdaId(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value="">Select a lambda...</option>
                            {lambdas.map((lambda) => (
                              <option key={lambda.id} value={lambda.id}>
                                {lambda.name} ({lambda.interpreter})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Lambda Preview */}
                      {localCronLambdaId && (() => {
                        const selectedLambda = lambdas.find((l) => l.id === localCronLambdaId);
                        if (!selectedLambda) return null;
                        return (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-orange-100 text-orange-600 text-xs font-bold dark:bg-orange-900/50 dark:text-orange-300">
                                {"\u03BB"}
                              </span>
                              <span className="text-sm font-medium text-orange-900 dark:text-orange-100">
                                {selectedLambda.name}
                              </span>
                            </div>
                            {selectedLambda.description && (
                              <p className="text-xs text-orange-700 dark:text-orange-300">
                                {selectedLambda.description}
                              </p>
                            )}
                            <div className="space-y-1 text-xs text-orange-600 dark:text-orange-400">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">Path:</span>
                                <span className="font-mono">{selectedLambda.path}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-medium">Interpreter:</span>
                                <span>{LAMBDA_INTERPRETERS.find((i) => i.id === selectedLambda.interpreter)?.label ?? selectedLambda.interpreter}</span>
                              </div>
                            </div>
                            <pre className="mt-2 max-h-24 overflow-auto rounded-sm bg-orange-100 dark:bg-orange-900/40 p-2 text-[11px] font-mono text-orange-800 dark:text-orange-200">
                              {selectedLambda.body.split("\n").slice(0, 8).join("\n")}
                              {selectedLambda.body.split("\n").length > 8 ? "\n..." : ""}
                            </pre>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* Interval */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Interval
                    </label>
                    <input
                      type="text"
                      value={localInterval}
                      onChange={(e) => setLocalInterval(e.target.value)}
                      placeholder="60s"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      How often the {localCronMode === "lambda" ? "script" : "agent"} runs. Examples: 30s, 5m, 1h
                    </p>
                  </div>

                  {/* Timeout */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Timeout
                    </label>
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
                    {localCronMode === "lambda"
                      ? <>Cron+lambda runs a script on a recurring interval. The script signals completion by printing <code className="font-mono text-[11px]">CRON_DONE:PASS</code> or <code className="font-mono text-[11px]">CRON_DONE:FAIL</code> to stdout. Context is injected via NENJO_* environment variables.</>
                      : <>Cron steps run an agent on a recurring interval. The agent signals completion by including <code className="font-mono text-[11px]">CRON_DONE:PASS</code> or <code className="font-mono text-[11px]">CRON_DONE:FAIL</code> in its output.</>
                    }
                  </p>
                </>
              )}

              {/* Step Metadata (JSON) — available for agent, gate, and cron */}
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
                {metadataError && (
                  <p className="mt-1 text-[10px] text-red-500">{metadataError}</p>
                )}
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Arbitrary JSON passed to the agent via {"{{ step.metadata }}"} template variable.
                </p>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <Button onClick={handleSave} size="sm" className="w-full" disabled={stepSaving || stepSaved}>
            {stepSaving ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Applying…
              </>
            ) : stepSaved ? (
              <>
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Applied
              </>
            ) : (
              "Apply"
            )}
          </Button>
          <Button onClick={onDelete} variant="danger" size="sm" className="w-full">
            Delete Step
          </Button>
        </div>
      </div>

      {/* Council Form Modal */}
      <CouncilFormModal
        open={councilFormOpen}
        onClose={() => {
          setCouncilFormOpen(false);
          setEditingCouncil(null);
        }}
        onSaved={handleCouncilSaved}
        council={editingCouncil}
      />
    </>
  );
}
