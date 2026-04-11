"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { triggerRoutine, updateRoutine, fetchExecutions, sendExecutionCommand } from "@/lib/api";
import type { RoutineDetail, RoutineTrigger } from "@/lib/types";
import { ROUTINE_TRIGGERS } from "@/lib/types";
import useSWR from "swr";
import { useWebSocketContext } from "@/lib/WebSocketContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CronStatus = "stopped" | "running";

interface CycleRun {
  id: string;
  cycle: number;
  passed: boolean;
  timestamp: string;
}

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

/** Trigger label from type */
function triggerLabel(trigger: string): string {
  return ROUTINE_TRIGGERS.find((t) => t.id === trigger)?.label ?? trigger;
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

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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

export function RoutineRunTab({ routine, onSaved }: RoutineRunTabProps) {
  const trigger = routine.trigger as RoutineTrigger;
  const isCron = trigger === "cron";
  const isActive = routine.is_active;
  const status: CronStatus = isActive ? "running" : "stopped";
  const [lastRunAt, setLastRunAt] = useState<string | null>(routine.last_run_at ?? null);
  const { data: recentExecutions, mutate: mutateExecutions } = useSWR(
    isCron ? `routine-executions-${routine.id}` : null,
    () => fetchExecutions(undefined, 20, undefined, routine.id),
    { revalidateOnFocus: true, refreshInterval: 10000 },
  );
  const completedRuns = (recentExecutions ?? []).filter((run) => run.status !== "running");
  const recentRuns: CycleRun[] = completedRuns.map((run, index) => ({
    id: run.id,
    cycle: completedRuns.length - index,
    passed: run.status === "completed",
    timestamp: run.completed_at ?? run.cancelled_at ?? run.started_at ?? run.created_at,
  }));

  // ── Shared state ────────────────────────────────────────────────────────
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Schedule editing (cron only) ────────────────────────────────────────
  const currentSchedule =
    (routine.metadata?.schedule as string) ||
    (routine.metadata?.interval as string) ||
    "";
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftSchedule, setDraftSchedule] = useState(currentSchedule);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  // Sync draft when routine changes
  useEffect(() => {
    if (!editingSchedule) setDraftSchedule(currentSchedule);
  }, [currentSchedule, editingSchedule]);

  useEffect(() => {
    if (editingSchedule) scheduleInputRef.current?.focus();
  }, [editingSchedule]);

  useEffect(() => {
    setLastRunAt(routine.last_run_at ?? null);
  }, [routine.last_run_at]);

  const { send, subscribe } = useWebSocketContext();

  // ── WebSocket listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribe((raw: unknown) => {
      try {
        const data = raw as Record<string, unknown>;
        const inner = (data?.payload ?? data) as Record<string, unknown>;

        if (inner?.event_type === "cron_cycle_completed") {
          setLastRunAt(new Date().toISOString());
          void mutateExecutions();
        }

        if (inner?.event_type === "cron_schedule_enabled" || inner?.event_type === "cron_schedule_disabled") {
          onSaved?.();
        }
      } catch {
        // ignore
      }
    });
    return unsub;
  }, [subscribe, mutateExecutions, onSaved]);

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

  const handleStart = useCallback(() => {
    setError(null);
    const schedule = currentSchedule || "60s";
    send({
      type: "cron.enable",
      routine_id: routine.id,
      project_id: routine.project_id,
      schedule,
    });
    onSaved?.();
  }, [routine.id, routine.project_id, currentSchedule, send, onSaved]);

  const handleStop = useCallback(async () => {
    send({ type: "cron.disable", routine_id: routine.id });
    const runningExecutions = (recentExecutions ?? []).filter(
      (exec) => exec.status === "running",
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
  }, [routine.id, send, recentExecutions, onSaved, mutateExecutions]);

  const handleSaveSchedule = useCallback(async () => {
    const trimmed = draftSchedule.trim();
    if (trimmed === currentSchedule) {
      setEditingSchedule(false);
      return;
    }
    setSavingSchedule(true);
    try {
      await updateRoutine(routine.id, {
        metadata: { ...routine.metadata, schedule: trimmed },
      });
      onSaved?.();
    } catch {
      setDraftSchedule(currentSchedule);
    } finally {
      setSavingSchedule(false);
      setEditingSchedule(false);
    }
  }, [draftSchedule, currentSchedule, routine.id, routine.metadata, onSaved]);

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
  const TriggerIcon = isCron ? ClockIcon : trigger === "chat.message" ? ChatIcon : BoltIcon;
  const triggerColor = isCron
    ? { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800", text: "text-cyan-600 dark:text-cyan-400", icon: "text-cyan-500" }
    : trigger === "chat.message"
      ? { bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800", text: "text-violet-600 dark:text-violet-400", icon: "text-violet-500" }
      : { bg: "bg-deep-space-blue-50 dark:bg-deep-space-blue-950/30", border: "border-deep-space-blue-200 dark:border-deep-space-blue-800", text: "text-deep-space-blue-600 dark:text-deep-space-blue-400", icon: "text-deep-space-blue-500" };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 max-w-2xl">
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
              <Badge variant={routine.is_active ? "active" : "inactive"}>
                {routine.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {isCron
                ? "Runs on a recurring schedule. Start the loop below to begin execution."
                : trigger === "chat.message"
                  ? "Triggered when a new chat message is received. Use Run Once to test manually."
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
              variant={isActive ? "danger" : "primary"}
              size="sm"
              onClick={isActive ? handleStop : handleStart}
              disabled={!isActive && !currentSchedule}
            >
              {isActive ? <StopIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
              {isActive ? "Stop Loop" : "Start Loop"}
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

      {/* ── Recent cycles (cron) ───────────────────────────────────────── */}
      {isCron && recentRuns.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Recent Cycles
          </h4>
          <Card className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between px-4 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      run.passed
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                    }`}
                  >
                    {run.passed ? <CheckIcon className="h-3 w-3" /> : "\u2715"}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    Cycle {run.cycle}
                  </span>
                  <Badge variant={run.passed ? "completed" : "failed"}>
                    {run.passed ? "Pass" : "Fail"}
                  </Badge>
                </div>
                <span className="text-gray-400 dark:text-gray-500 font-mono">
                  {new Date(run.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── Empty state for cycle history ──────────────────────────────── */}
      {isCron && recentRuns.length === 0 && !isActive && (
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
