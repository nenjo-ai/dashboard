"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { triggerRoutine, updateRoutine, fetchExecutions, sendExecutionCommand } from "@/lib/api";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import { useExecutionTasks } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { decryptContentPayload } from "@/lib/cryptoContent";
import type { EncryptedPayload, ExecutionDetails, ExecutionTask, RoutineDetail, RoutineTrigger, TaskStepProgress } from "@/lib/types";
import { ROUTINE_TRIGGERS } from "@/lib/types";
import useSWR from "swr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CronStatus = "stopped" | "running";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable description of a schedule string */
function describeSchedule(schedule: string): string {
  if (!schedule) return "Not configured";
  // Simple intervals like "30s", "5m", "1h", "2d"
  const match = schedule.match(/^(\d+)(s|m|h|d)$/);
  if (match) {
    const [, n, unit] = match;
    const labels: Record<string, string> = { s: "second", m: "minute", h: "hour", d: "day" };
    const label = labels[unit] ?? unit;
    return `Every ${n} ${label}${Number(n) > 1 ? "s" : ""}`;
  }
  // Looks like a cron expression
  if (schedule.includes(" ") || schedule.includes("*")) {
    return schedule;
  }
  return schedule;
}

function browserTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function scheduleMetadata(
  metadata: Record<string, unknown>,
  schedule: string,
  timezone: string,
): Record<string, unknown> {
  return {
    ...metadata,
    schedule,
    timezone: timezone.trim() || browserTimezone(),
  };
}

/** Trigger label from type */
function triggerLabel(trigger: string): string {
  return ROUTINE_TRIGGERS.find((t) => t.id === trigger)?.label ?? trigger;
}

function routineSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "routine"
  );
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

function executionDuration(exec: ExecutionDetails): number | null {
  const startedAt = exec.started_at ? new Date(exec.started_at).getTime() : null;
  const endedAt = exec.completed_at ?? exec.cancelled_at;
  const completedAt = endedAt ? new Date(endedAt).getTime() : null;
  if (startedAt == null || completedAt == null) return null;
  const duration = completedAt - startedAt;
  return duration > 0 ? duration : null;
}

function executionCycleNumber(execution: ExecutionDetails, fallback: number): number {
  const cycle = execution.config?.cycle;
  return typeof cycle === "number" && Number.isFinite(cycle) ? cycle : fallback;
}

function stepTokens(step: TaskStepProgress): { input: number; output: number; total: number } {
  const data = step.data;
  const metrics = data?.metrics as Record<string, unknown> | undefined;
  const input =
    (typeof metrics?.input_tokens === "number" ? metrics.input_tokens : 0) +
    (typeof data?.input_tokens === "number" ? data.input_tokens : 0);
  const output =
    (typeof metrics?.output_tokens === "number" ? metrics.output_tokens : 0) +
    (typeof data?.output_tokens === "number" ? data.output_tokens : 0);
  return { input, output, total: input + output };
}

function aggregateRunTokens(tasks: ExecutionTask[] | undefined): { input: number; output: number; total: number } {
  if (!tasks) return { input: 0, output: 0, total: 0 };
  let input = 0;
  let output = 0;
  for (const task of tasks) {
    for (const step of task.steps ?? []) {
      const tokens = stepTokens(step);
      input += tokens.input;
      output += tokens.output;
    }
  }
  return { input, output, total: input + output };
}

function stepStatusVariant(step: TaskStepProgress): "completed" | "failed" | "running" | "default" {
  if (step.status === "failed" || step.event_type === "step_failed" || step.event_type === "failed") return "failed";
  if (step.status === "running" || step.event_type === "step_started" || step.event_type === "running") return "running";
  if (step.status === "passed" || step.event_type === "step_completed" || step.event_type === "completed") return "completed";
  return "default";
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

type StepPayloadData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStringFields(data: Record<string, unknown> | undefined): StepPayloadData {
  if (!data) return {};
  const extracted: StepPayloadData = {};
  for (const key of ["error", "warning"]) {
    if (typeof data[key] === "string" && String(data[key]).trim().length > 0) {
      extracted[key] = data[key];
    }
  }
  return extracted;
}

async function resolveStepPayload(
  data: Record<string, unknown> | undefined,
  directPayload?: Record<string, unknown> | null,
  directEncryptedPayload?: EncryptedPayload | null,
): Promise<StepPayloadData | null> {
  if (!data && !directPayload && !directEncryptedPayload) return null;

  const resolved: StepPayloadData = {
    ...extractStringFields(data),
  };

  if (directPayload) {
    Object.assign(resolved, directPayload);
  }

  if (directEncryptedPayload) {
    try {
      const decrypted = await decryptContentPayload(directEncryptedPayload);
      if (decrypted) {
        const parsed = JSON.parse(decrypted) as unknown;
        if (isRecord(parsed)) {
          Object.assign(resolved, parsed);
        }
      }
    } catch (error) {
      console.warn("Failed to decrypt cron execution step payload", {
        objectId: directEncryptedPayload.object_id,
        objectType: directEncryptedPayload.object_type,
        keyVersion: directEncryptedPayload.key_version,
        error,
      });
    }
  }

  return Object.keys(resolved).length > 0 ? resolved : null;
}

function getResolvedText(
  payload: StepPayloadData | null | undefined,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stepOutput(step: TaskStepProgress): string | null {
  const data = step.data as Record<string, unknown> | undefined;
  const payload = step.payload as Record<string, unknown> | undefined;
  const result = data?.result as Record<string, unknown> | undefined;
  const output =
    stringField(payload?.output_preview) ??
    stringField(payload?.final_output) ??
    stringField(payload?.output) ??
    stringField(payload?.result_preview) ??
    stringField(data?.output_preview) ??
    stringField(data?.final_output) ??
    stringField(data?.output) ??
    stringField(result?.output) ??
    stringField(result?.final_output);
  return typeof output === "string" && output.trim() ? output : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed != null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function passVerdictOutput(step: TaskStepProgress): string | null {
  if (step.step_type !== "tool" || step.step_name !== "pass_verdict") return null;

  const data = step.data as Record<string, unknown> | undefined;
  const payload = step.payload as Record<string, unknown> | undefined;
  const args = parseJsonObject(data?.tool_args);
  return (
    stringField(args?.output) ??
    stringField(args?.reasoning) ??
    stringField(payload?.output_preview)
  );
}

function cronStepIdentityKey(step: TaskStepProgress): string {
  const stepRunId = step.data?.step_run_id;
  if (typeof stepRunId === "string" && stepRunId.length > 0) return `routine-run:${stepRunId}`;
  const stepId = step.data?.step_id;
  if (typeof stepId === "string" && stepId.length > 0) return `routine:${stepId}`;
  return `${step.step_type}:${step.step_name}`;
}

function cronAgentIdentityKey(step: TaskStepProgress): string | null {
  if (!step.agent?.agent) return null;
  return `${step.agent.agent}:${cronStepIdentityKey(step)}`;
}

function mergeStep(prev: TaskStepProgress, next: TaskStepProgress): TaskStepProgress {
  const prevPayload = isRecord(prev.payload) ? prev.payload : null;
  const nextPayload = isRecord(next.payload) ? next.payload : null;
  return {
    ...next,
    step_name: next.step_name || prev.step_name,
    step_type: next.step_type || prev.step_type,
    agent: next.agent ?? prev.agent,
    data: { ...(prev.data ?? {}), ...(next.data ?? {}) },
    payload: prevPayload || nextPayload
      ? { ...(prevPayload ?? {}), ...(nextPayload ?? {}) }
      : next.payload ?? prev.payload,
    encrypted_payload: next.encrypted_payload ?? prev.encrypted_payload,
  };
}

function isCronHiddenStep(step: TaskStepProgress): boolean {
  return (
    step.step_type === "tool" ||
    step.step_type === "ability" ||
    step.step_type === "delegation" ||
    step.step_type === "cron"
  );
}

function isCronAgentStep(step: TaskStepProgress): boolean {
  return step.step_type === "agent" || (!step.step_type && step.agent?.agent != null);
}

function buildCronDisplaySteps(steps: TaskStepProgress[]): TaskStepProgress[] {
  const groups: TaskStepProgress[] = [];
  const parentIndex = new Map<string, number>();
  const agentParentIndex = new Map<string, number>();

  const upsertParent = (step: TaskStepProgress): number => {
    const key = cronStepIdentityKey(step);
    const existingIndex = parentIndex.get(key);
    if (existingIndex != null) {
      groups[existingIndex] = mergeStep(groups[existingIndex], step);
      return existingIndex;
    }

    const index = groups.length;
    groups.push(step);
    parentIndex.set(key, index);
    if (step.step_name) parentIndex.set(step.step_name, index);
    const agentKey = cronAgentIdentityKey(step);
    if (agentKey) agentParentIndex.set(agentKey, index);
    return index;
  };

  for (const step of steps) {
    if (isCronHiddenStep(step) || !isCronAgentStep(step)) continue;
    upsertParent({
      ...step,
      step_type: step.step_type || "agent",
    });
  }

  for (const step of steps) {
    const output = isCronHiddenStep(step) ? passVerdictOutput(step) : stepOutput(step);
    if (!output && !step.encrypted_payload) continue;

    const parentKey = cronStepIdentityKey(step);
    const parentIndexForStep =
      parentIndex.get(parentKey) ??
      (cronAgentIdentityKey(step) != null
        ? agentParentIndex.get(cronAgentIdentityKey(step) as string)
        : undefined);
    if (parentIndexForStep == null) continue;
    if (output && stepOutput(groups[parentIndexForStep])) continue;

    groups[parentIndexForStep] = mergeStep(groups[parentIndexForStep], {
      ...groups[parentIndexForStep],
      event_type: "step_completed",
      status: step.status === "failed" ? "failed" : "passed",
      payload: output
        ? {
            ...(groups[parentIndexForStep].payload ?? {}),
            output_preview: output,
          }
        : groups[parentIndexForStep].payload,
      encrypted_payload: step.encrypted_payload ?? groups[parentIndexForStep].encrypted_payload,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Trigger icon SVGs
// ---------------------------------------------------------------------------

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <rect x="4" y="4" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function RunOnceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RoutineRunTabProps {
  routine: RoutineDetail;
  onSaved?: () => void;
}

function CronExecutionStep({
  step,
  resolved,
}: {
  step: TaskStepProgress;
  resolved?: StepPayloadData | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const tokens = stepTokens(step);
  const output = getResolvedText(resolved, "output_preview") ?? stepOutput(step);
  return (
    <div className="theme-border border-l pl-3">
      <div className="flex items-center gap-2 py-1">
        <Badge variant={stepStatusVariant(step)} className="shrink-0 text-[10px]">
          {step.status}
        </Badge>
        <span className="theme-text min-w-0 flex-1 truncate text-xs">
          {step.step_name}
        </span>
        <span className="theme-text-muted shrink-0 rounded-sm border border-gray-200 px-1.5 py-0.5 text-[10px] dark:border-gray-700">
          {step.step_type}
        </span>
        {tokens.total > 0 && (
          <span
            className="theme-text-muted shrink-0 text-[10px] tabular-nums"
            title={`In: ${tokens.input.toLocaleString()} / Out: ${tokens.output.toLocaleString()}`}
          >
            {formatTokens(tokens.total)} tok
          </span>
        )}
        {step.duration_ms != null && step.duration_ms > 0 && (
          <span className="theme-text-muted shrink-0 text-xs tabular-nums">
            {formatDuration(step.duration_ms)}
          </span>
        )}
        {output && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="theme-surface theme-border theme-text shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:[background:var(--app-hover)]"
          >
            {expanded ? "Hide output" : "Show output"}
          </button>
        )}
      </div>
      {output && expanded && (
        <pre className="theme-surface-muted theme-text-muted mb-2 mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md px-2.5 py-2 text-xs leading-relaxed">
          {output}
        </pre>
      )}
    </div>
  );
}

function CronExecutionTask({ task }: { task: ExecutionTask }) {
  const steps = useMemo(() => task.steps ?? [], [task.steps]);
  const displaySteps = useMemo(() => buildCronDisplaySteps(steps), [steps]);
  const [resolvedPayloads, setResolvedPayloads] = useState<Record<string, StepPayloadData>>({});
  const totalDuration = steps.reduce((acc, step) => acc + (step.duration_ms ?? 0), 0);
  const totalTokens = steps.reduce((acc, step) => acc + stepTokens(step).total, 0);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      displaySteps.map(async (step, index) => {
        const resolved = await resolveStepPayload(
          step.data as Record<string, unknown> | undefined,
          step.payload ?? null,
          step.encrypted_payload ?? null,
        );
        return [`step:${index}`, resolved] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, StepPayloadData> = {};
      for (const [key, resolved] of entries) {
        if (resolved) next[key] = resolved;
      }
      setResolvedPayloads(next);
    });

    return () => {
      cancelled = true;
    };
  }, [displaySteps]);

  return (
    <div className="theme-border border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <Badge variant={task.status} className="shrink-0">
          {task.status}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="theme-text truncate text-sm font-medium">
            {task.slug ?? task.title}
          </p>
          <p className="theme-text-muted text-xs">
            {steps.length} {steps.length === 1 ? "step" : "steps"}
          </p>
        </div>
        {totalTokens > 0 && (
          <span className="theme-text-muted shrink-0 text-[10px] tabular-nums">
            {formatTokens(totalTokens)} tok
          </span>
        )}
        {totalDuration > 0 && (
          <span className="theme-text-muted shrink-0 text-xs tabular-nums">
            {formatDuration(totalDuration)}
          </span>
        )}
      </div>
      {displaySteps.length > 0 && (
        <div className="mt-3 space-y-2 pl-2">
          {displaySteps.map((step, index) => (
            <CronExecutionStep
              key={`${step.step_name}:${step.step_type}:${step.started_at ?? step.created_at ?? index}`}
              step={step}
              resolved={resolvedPayloads[`step:${index}`]}
            />
          ))}
        </div>
      )}
      {displaySteps.length === 0 && steps.length > 0 && (
        <p className="theme-text-muted mt-3 text-xs">
          No agent output recorded for this run.
        </p>
      )}
    </div>
  );
}

function CronExecutionRow({
  execution,
  cycle,
}: {
  execution: ExecutionDetails;
  cycle: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { tasks, isLoading } = useExecutionTasks(expanded ? execution.id : undefined);
  const tokens = useMemo(() => aggregateRunTokens(tasks), [tasks]);
  const duration = executionDuration(execution);
  const cycleNumber = executionCycleNumber(execution, cycle);

  return (
    <div className="theme-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:[background:var(--app-hover)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant={execution.status} showDot className="shrink-0">
            {execution.status}
          </Badge>
          <div className="min-w-0">
            <p className="theme-text truncate text-sm font-medium">
              Cycle {cycleNumber}
            </p>
            <p className="theme-text-muted text-xs">
              Run #{execution.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {tokens.total > 0 && (
            <span
              className="theme-text-muted hidden text-[10px] tabular-nums sm:block"
              title={`In: ${tokens.input.toLocaleString()} · Out: ${tokens.output.toLocaleString()}`}
            >
              {formatTokens(tokens.total)} tok
            </span>
          )}
          {duration != null && (
            <span className="theme-text-muted hidden text-xs tabular-nums sm:block">
              {formatDuration(duration)}
            </span>
          )}
          <span className="theme-text-muted text-xs">
            {formatRelativeTime(execution.started_at ?? execution.created_at)}
          </span>
          <svg
            className={cn(
              "theme-text-muted h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="theme-border border-t">
          {isLoading ? (
            <div className="theme-text-muted px-4 py-3 text-xs">Loading tasks...</div>
          ) : tasks && tasks.length > 0 ? (
            tasks.map((task) => (
              <CronExecutionTask
                key={task.id ?? task.slug ?? task.title}
                task={task}
              />
            ))
          ) : (
            <div className="theme-text-muted px-4 py-3 text-xs">
              No tasks recorded for this run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RoutineRunTab({ routine, onSaved }: RoutineRunTabProps) {
  const trigger = routine.trigger as RoutineTrigger;
  const isCron = trigger === "cron";
  const [loopActive, setLoopActive] = useState(routine.is_active);
  const status: CronStatus = loopActive ? "running" : "stopped";
  const [lastRunAt, setLastRunAt] = useState<string | null>(routine.last_run_at ?? null);
  const routineRef = routineSlug(routine.name);
  const { data: recentExecutions, mutate: mutateExecutions } = useSWR(
    isCron ? `routine-executions-${routineRef}` : null,
    () => fetchExecutions(undefined, 20, undefined, routineRef),
    { revalidateOnFocus: true },
  );
  const routineExecutions = (recentExecutions ?? []).filter(
    (run) => run.routine_id === routine.id,
  );
  const completedRuns = routineExecutions.filter((run) => run.status !== "running");

  // ── Shared state ────────────────────────────────────────────────────────
  const [triggering, setTriggering] = useState(false);
  const [togglingLoop, setTogglingLoop] = useState(false);
  const [toggleAction, setToggleAction] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Schedule editing (cron only) ────────────────────────────────────────
  const currentSchedule =
    (routine.metadata?.schedule as string) ||
    (routine.metadata?.interval as string) ||
    "";
  const currentTimezone =
    typeof routine.metadata?.timezone === "string" && routine.metadata.timezone.trim()
      ? routine.metadata.timezone.trim()
      : browserTimezone();
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftSchedule, setDraftSchedule] = useState(currentSchedule);
  const [draftTimezone, setDraftTimezone] = useState(currentTimezone);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  // Sync draft when routine changes
  useEffect(() => {
    if (!editingSchedule) setDraftSchedule(currentSchedule);
  }, [currentSchedule, editingSchedule]);

  useEffect(() => {
    setDraftTimezone(currentTimezone);
  }, [currentTimezone]);

  useEffect(() => {
    if (editingSchedule) scheduleInputRef.current?.focus();
  }, [editingSchedule]);

  useEffect(() => {
    setLastRunAt(routine.last_run_at ?? null);
  }, [routine.last_run_at]);

  useEffect(() => {
    setLoopActive(routine.is_active);
  }, [routine.is_active]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void mutateExecutions();
      }, 350);
    };

    void subscribeExecutionRealtime(
      (event) => {
        const data = event.data;
        const type = typeof data.type === "string" ? data.type : "";
        const eventRoutineId =
          typeof data.routine_id === "string" ? data.routine_id : null;
        const eventRoutineRef =
          typeof data.routine === "string" ? data.routine : null;
        const matchesRoutine =
          eventRoutineId === routine.id || eventRoutineRef === routineRef;

        if (matchesRoutine && type === "cron.scheduled") {
          setLoopActive(true);
        }

        if (matchesRoutine && type === "cron.stopped") {
          setLoopActive(false);
        }

        if (
          matchesRoutine ||
          type === "cron.heartbeat" ||
          type === "cron.scheduled" ||
          type === "cron.stopped" ||
          type === "execution.started" ||
          type === "execution.completed"
        ) {
          scheduleRefresh();
        }
      },
      controller.signal,
    ).catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Routine realtime stream failed:", error);
      }
    });

    return () => {
      controller.abort();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [routine.id, routineRef, mutateExecutions]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleRunOnce = useCallback(async () => {
    setTriggering(true);
    setError(null);
    try {
      await triggerRoutine(routine.id);
      if (isCron) {
        void mutateExecutions();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }, [routine.id, isCron, mutateExecutions]);

  const handleStart = useCallback(async () => {
    setError(null);
    const schedule = currentSchedule || "60s";
    setTogglingLoop(true);
    setToggleAction("start");
    try {
      await updateRoutine(routine.id, {
        is_active: true,
        metadata: scheduleMetadata(routine.metadata, schedule, draftTimezone),
      });
      setLoopActive(true);
      onSaved?.();
      setDraftSchedule(schedule);
      void mutateExecutions();
    } catch (err) {
      setLoopActive(routine.is_active);
      setError(err instanceof Error ? err.message : "Failed to start routine loop");
    } finally {
      setToggleAction(null);
      setTogglingLoop(false);
    }
  }, [routine.id, routine.metadata, currentSchedule, draftTimezone, onSaved, mutateExecutions, routine.is_active]);

  const handleStop = useCallback(async () => {
    setError(null);
    setTogglingLoop(true);
    setToggleAction("stop");
    try {
      await updateRoutine(routine.id, {
        is_active: false,
      });
      setLoopActive(false);
      const runningExecutions = (recentExecutions ?? []).filter(
        (exec) => exec.status === "running",
      );
      const cancelledAt = new Date().toISOString();
      void mutateExecutions(
        (current) =>
          current?.map((exec) =>
            exec.status === "running"
              ? { ...exec, status: "cancelled", cancelled_at: cancelledAt, updated_at: cancelledAt }
              : exec,
          ),
        false,
      );
      for (const exec of runningExecutions) {
        try {
          await sendExecutionCommand(exec.id, "cancel");
        } catch {
          // best-effort
        }
      }
      onSaved?.();
      void mutateExecutions();
    } catch (err) {
      setLoopActive(routine.is_active);
      setError(err instanceof Error ? err.message : "Failed to stop routine loop");
    } finally {
      setToggleAction(null);
      setTogglingLoop(false);
    }
  }, [routine.id, recentExecutions, onSaved, mutateExecutions, routine.is_active]);

  const handleSaveSchedule = useCallback(async () => {
    const trimmed = draftSchedule.trim();
    if (trimmed === currentSchedule) {
      setEditingSchedule(false);
      return;
    }
    setSavingSchedule(true);
    try {
      await updateRoutine(routine.id, {
        metadata: scheduleMetadata(routine.metadata, trimmed, draftTimezone),
      });
      onSaved?.();
    } catch {
      setDraftSchedule(currentSchedule);
    } finally {
      setSavingSchedule(false);
      setEditingSchedule(false);
    }
  }, [draftSchedule, currentSchedule, draftTimezone, routine.id, routine.metadata, onSaved]);

  const handleSaveTimezone = useCallback(async () => {
    const timezone = draftTimezone.trim() || browserTimezone();
    if (timezone === currentTimezone) return;
    setSavingSchedule(true);
    try {
      await updateRoutine(routine.id, {
        metadata: scheduleMetadata(routine.metadata, currentSchedule, timezone),
      });
      onSaved?.();
    } catch {
      setDraftTimezone(currentTimezone);
    } finally {
      setSavingSchedule(false);
    }
  }, [draftTimezone, currentTimezone, currentSchedule, routine.id, routine.metadata, onSaved]);

  const handleScheduleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveSchedule();
    } else if (e.key === "Escape") {
      setDraftSchedule(currentSchedule);
      setEditingSchedule(false);
    }
  };

  // ── Trigger icon ────────────────────────────────────────────────────────
  const TriggerIcon = isCron ? ClockIcon : BoltIcon;
  const triggerColor = isCron
    ? { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800", text: "text-cyan-600 dark:text-cyan-400", icon: "text-cyan-500" }
    : { bg: "bg-deep-space-blue-50 dark:bg-deep-space-blue-950/30", border: "border-deep-space-blue-200 dark:border-deep-space-blue-800", text: "text-deep-space-blue-600 dark:text-deep-space-blue-400", icon: "text-deep-space-blue-500" };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 max-w-4xl">
      {/* ── Trigger overview card ──────────────────────────────────────── */}
      <Card className={`p-4 ${triggerColor.border}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${triggerColor.bg}`}>
            <TriggerIcon className={`h-5 w-5 ${triggerColor.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {triggerLabel(trigger)}
              </span>
              <Badge variant={loopActive ? "active" : "inactive"}>
                {loopActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {isCron
                ? "Runs on a recurring schedule. Start the loop below to begin execution."
                : "Triggered when a task is marked as ready. Use Run Once to test manually."
              }
            </p>
          </div>
        </div>
      </Card>

      {/* ── Schedule config (cron only) ────────────────────────────────── */}
      {isCron && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Schedule
          </h4>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Interval</span>
                {editingSchedule ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      ref={scheduleInputRef}
                      type="text"
                      value={draftSchedule}
                      onChange={(e) => setDraftSchedule(e.target.value)}
                      onBlur={handleSaveSchedule}
                      onKeyDown={handleScheduleKeyDown}
                      disabled={savingSchedule}
                      placeholder="e.g., 30m, 1h, 0 9 * * *"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingSchedule(true)}
                    className="mt-1 flex items-center gap-1.5 group"
                    title="Click to edit schedule"
                  >
                    <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                      {currentSchedule || "Not set"}
                    </span>
                    {currentSchedule && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({describeSchedule(currentSchedule)})
                      </span>
                    )}
                    <svg
                      className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 shrink-0"
                      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                    </svg>
                  </button>
                )}
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Cron expression (e.g. &quot;0 9 * * *&quot;) or interval (e.g. &quot;30s&quot;, &quot;5m&quot;, &quot;1h&quot;)
                </p>
              </div>

              {/* Live status */}
              <div className="text-right shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                <div className="mt-1">
                  <Badge
                    variant={status === "running" ? "running" : "default"}
                    showDot
                  >
                    {status === "running"
                      ? "Running"
                      : "Idle"}
                  </Badge>
                </div>
                {lastRunAt && (
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    Last: {new Date(lastRunAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
              <label className="text-xs text-gray-500 dark:text-gray-400" htmlFor="routine-timezone">
                Timezone
              </label>
              <input
                id="routine-timezone"
                type="text"
                value={draftTimezone}
                onChange={(e) => setDraftTimezone(e.target.value)}
                onBlur={handleSaveTimezone}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={savingSchedule}
                placeholder="America/Chicago"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50"
              />
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                Uses your browser timezone by default. Edit this if your browser location is not where the schedule should run.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Controls
        </h4>
        <div className="flex items-center gap-2">
          {isCron && (
            <Button
              variant={loopActive ? "danger" : "primary"}
              size="sm"
              onClick={loopActive ? handleStop : handleStart}
              disabled={togglingLoop || (!loopActive && !currentSchedule)}
              isLoading={togglingLoop}
            >
              {!togglingLoop && (loopActive ? <StopIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />)}
              {togglingLoop
                ? (toggleAction === "stop" ? "Stopping..." : "Starting...")
                : (loopActive ? "Stop Loop" : "Start Loop")}
            </Button>
          )}
          <Button
            variant={isCron ? "secondary" : "primary"}
            size="sm"
            onClick={handleRunOnce}
            disabled={triggering}
            isLoading={triggering}
          >
            {!triggering && <RunOnceIcon className="w-3.5 h-3.5" />}
            {triggering ? "Running..." : "Run Once"}
          </Button>
        </div>
        {isCron && !currentSchedule && status === "stopped" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Set a schedule above before starting the loop.
          </p>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* ── Routine info (non-cron) ────────────────────────────────────── */}
      {!isCron && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Details
          </h4>
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Steps</span>
                <p className="mt-0.5 text-gray-900 dark:text-gray-100 font-medium">
                  {routine.steps.length}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Max Retries</span>
                <p className="mt-0.5 text-gray-900 dark:text-gray-100 font-medium">
                  {routine.max_retries}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Execution history (cron) ───────────────────────────────────── */}
      {isCron && completedRuns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Execution History
          </h4>
          <Card className="overflow-hidden">
            {completedRuns.map((run, index) => (
              <CronExecutionRow
                key={run.id}
                execution={run}
                cycle={completedRuns.length - index}
              />
            ))}
          </Card>
        </div>
      )}

      {/* ── Empty state for cycle history ──────────────────────────────── */}
      {isCron && completedRuns.length === 0 && !loopActive && (
        <Card className="p-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <ClockIcon className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No cycles yet. Start the loop or run once to see results here.
          </p>
        </Card>
      )}
    </div>
  );
}
