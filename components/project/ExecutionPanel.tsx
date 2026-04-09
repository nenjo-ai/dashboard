"use client";

import { cn } from "@/lib/cn";
import { useState, useCallback, useMemo, useEffect } from "react";
import type {
  ExecutionDetails,
  ExecutionCommand,
  ExecutionTask,
  TaskStepProgress,
} from "@/lib/types";
import {
  createExecution,
  sendExecutionCommand,
} from "@/lib/api";
import { useExecutionTasks } from "@/lib/hooks";
import { useWebSocketContext } from "@/lib/WebSocketContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";


interface ExecutionPanelProps {
  projectId: string;
  executions: ExecutionDetails[] | undefined;
  isLoading: boolean;
  onRefresh: () => void;
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

function canStart(e: ExecutionDetails): boolean {
  return e.status === "pending";
}

function canPause(e: ExecutionDetails): boolean {
  return e.status === "running";
}

function canResume(e: ExecutionDetails): boolean {
  return e.status === "paused";
}

function canCancel(e: ExecutionDetails): boolean {
  return e.status === "pending" || e.status === "running" || e.status === "paused";
}

// ---------------------------------------------------------------------------
// Status icons
// ---------------------------------------------------------------------------

function StatusIcon({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "h-4 w-4" : "h-3 w-3";

  switch (status) {
    case "resolved":
    case "done":
    case "passed":
    case "step_completed":
      return (
        <svg className={cn(sizeClass, "text-emerald-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "closed":
    case "failed":
    case "step_failed":
      return (
        <svg className={cn(sizeClass, "text-red-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "assigned":
    case "in_progress":
    case "running":
    case "step_started":
      return (
        <svg className={cn(sizeClass, "text-yellow-500 animate-spin shrink-0")} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    case "step_warning":
      return (
        <svg className={cn(sizeClass, "text-amber-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case "skipped":
      return (
        <svg className={cn(sizeClass, "text-gray-400 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.69zM12.75 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.69z" />
        </svg>
      );
    default:
      return <span className={cn(sizeClass, "rounded-full bg-gray-300 dark:bg-gray-600 shrink-0 block")} />;
  }
}

function StepTypeBadge({ stepType }: { stepType: string }) {
  const colors: Record<string, string> = {
    agent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    gate: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    council: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    terminal: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    merge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    setup: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded-sm text-[10px] font-medium", colors[stepType] ?? colors.agent)}>
      {stepType}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Task row (expandable)
// ---------------------------------------------------------------------------

/** Deduplicate step events by step_name, keeping only the latest event per step.
 *  The backend returns all events (step_started, step_completed, step_failed)
 *  as separate rows. We collapse them so only the most recent status is shown.
 *  Preserves step_type and agent from earlier events when a later event lacks them. */
function deduplicateSteps(steps: TaskStepProgress[]): TaskStepProgress[] {
  const map = new Map<string, TaskStepProgress>();
  for (const step of steps) {
    const prev = map.get(step.step_name);
    if (prev) {
      // Carry forward fields that step_completed doesn't populate.
      const merged = { ...step };
      if (!merged.step_type && prev.step_type) merged.step_type = prev.step_type;
      if (!merged.agent && prev.agent) merged.agent = prev.agent;
      map.set(step.step_name, merged);
    } else {
      map.set(step.step_name, step);
    }
  }
  return Array.from(map.values());
}

/** Extract token counts from a step's data — supports both flat (output_preview flow)
 *  and nested metrics (real-time flow) shapes. */
function getStepTokens(data: Record<string, unknown> | undefined): { input: number; output: number; total: number } {
  if (!data) return { input: 0, output: 0, total: 0 };
  const m = data.metrics as Record<string, unknown> | undefined;
  const input = (typeof m?.input_tokens === "number" ? m.input_tokens : 0)
    + (typeof data.input_tokens === "number" ? data.input_tokens : 0);
  const output = (typeof m?.output_tokens === "number" ? m.output_tokens : 0)
    + (typeof data.output_tokens === "number" ? data.output_tokens : 0);
  const total = (typeof m?.total_tokens === "number" ? m.total_tokens : 0) || (input + output);
  return { input, output, total };
}

function TaskRow({ task }: { task: ExecutionTask }) {
  const [expanded, setExpanded] = useState(false);

  const steps = useMemo(() => deduplicateSteps(task.steps ?? []), [task.steps]);
  const totalDuration = steps.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
  const totalTokens = steps.reduce(
    (acc, s) => acc + getStepTokens(s.data as Record<string, unknown> | undefined).total, 0
  );

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <StatusIcon status={task.status} size="md" />
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1 font-medium">
          {task.slug ?? task.title}
        </span>
        {totalTokens > 0 && (
          <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
            {formatTokens(totalTokens)} tok
          </span>
        )}
        {totalDuration > 0 && (
          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
            {formatDuration(totalDuration)}
          </span>
        )}
        <svg
          className={cn(
            "h-3.5 w-3.5 text-gray-400 transition-transform shrink-0",
            expanded && "rotate-90",
          )}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {expanded && steps.length > 0 && (
        <div className="pl-10 pr-4 pb-2 space-y-1">
          {steps.map((step) => {
            const d = step.data as Record<string, unknown> | undefined;
            const metrics = d?.metrics as
              | { execution_count?: number }
              | undefined;
            const tokens = getStepTokens(d);
            const errorMsg =
              (step.event_type === "step_failed" || step.event_type === "failed") &&
              d?.error
                ? String(d.error)
                : null;
            const warningMsg =
              step.event_type === "step_warning" && d?.warning
                ? String(d.warning)
                : null;
            const isTerminal = step.step_type === "terminal" || step.step_type === "terminal_fail";
            const outputPreview =
              step.event_type === "step_completed" && !isTerminal && d?.output_preview
                ? String(d.output_preview)
                : null;
            const agent = step.agent;
            const isRunning =
              step.event_type === "step_started" || step.event_type === "running";
            return (
              <div key={step.step_name}>
                <div className="flex items-center gap-2 py-1">
                  {agent ? (
                    <RoleIdenticon
                      roleId={agent.agent_id}
                      color={agent.agent_color ?? "#6B7280"}
                      size={14}
                      className="shrink-0"
                      animate={isRunning}
                      roleName={agent.agent_name ?? undefined}
                    />
                  ) : (
                    <StatusIcon status={step.event_type} />
                  )}
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {step.step_name}
                  </span>
                  {metrics?.execution_count != null && metrics.execution_count > 1 && (
                    <span className="text-[10px] text-amber-600 font-medium">
                      x{metrics.execution_count}
                    </span>
                  )}
                  <StepTypeBadge stepType={step.step_type} />
                  {tokens.total > 0 && (
                    <span
                      className="text-[10px] text-gray-400 tabular-nums shrink-0"
                      title={`In: ${tokens.input.toLocaleString()} / Out: ${tokens.output.toLocaleString()}`}
                    >
                      {formatTokens(tokens.total)} tok
                    </span>
                  )}
                  {step.duration_ms != null && step.duration_ms > 0 && (
                    <span className="text-xs text-gray-400 tabular-nums shrink-0">
                      {formatDuration(step.duration_ms)}
                    </span>
                  )}
                </div>
                {outputPreview && (
                  <div className="ml-5 mt-0.5 mb-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-400 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {outputPreview}
                  </div>
                )}
                {errorMsg && (
                  <div className="ml-5 mt-0.5 mb-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-wrap wrap-break-word">
                    {errorMsg}
                  </div>
                )}
                {warningMsg && (
                  <div className="ml-5 mt-0.5 mb-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 whitespace-pre-wrap wrap-break-word">
                    {warningMsg}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History row (expandable with task list)
// ---------------------------------------------------------------------------

/** Aggregate token counts across all steps in all tasks for a history row. */
function aggregateRunTokens(tasks: ExecutionTask[] | undefined): { input: number; output: number; total: number } {
  if (!tasks) return { input: 0, output: 0, total: 0 };
  let input = 0;
  let output = 0;
  for (const task of tasks) {
    for (const step of task.steps ?? []) {
      const d = step.data as Record<string, unknown> | undefined;
      const m = d?.metrics as Record<string, unknown> | undefined;
      input += (typeof m?.input_tokens === "number" ? m.input_tokens : 0)
        + (typeof d?.input_tokens === "number" ? d.input_tokens : 0);
      output += (typeof m?.output_tokens === "number" ? m.output_tokens : 0)
        + (typeof d?.output_tokens === "number" ? d.output_tokens : 0);
    }
  }
  return { input, output, total: input + output };
}

function HistoryRow({ execution: exec }: { execution: ExecutionDetails }) {
  const [expanded, setExpanded] = useState(false);
  const { tasks } = useExecutionTasks(expanded ? exec.id : undefined);
  const tokens = useMemo(() => aggregateRunTokens(tasks), [tasks]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant={exec.status} showDot>
            {exec.status}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm text-gray-900 truncate dark:text-gray-100">
              {exec.routine_name ?? `Run #${exec.id.slice(0, 8)}`}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {exec.parallel_count} parallel ·{" "}
              {exec.task_counts.total} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {tokens.total > 0 && (
            <span
              className="hidden sm:block text-[10px] text-gray-400 tabular-nums"
              title={`In: ${tokens.input.toLocaleString()} · Out: ${tokens.output.toLocaleString()}`}
            >
              {formatTokens(tokens.total)} tok
            </span>
          )}
          {exec.task_counts.total > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.min(exec.completion_percentage, 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {Math.round(exec.completion_percentage)}%
              </span>
            </div>
          )}
          <span className="text-xs text-gray-400">
            {formatRelativeTime(exec.created_at)}
          </span>
          <svg
            className={cn(
              "h-3.5 w-3.5 text-gray-400 transition-transform shrink-0",
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
        <div className="border-t border-gray-100 dark:border-gray-700">
          {tasks && tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))
          ) : (
            <div className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
              {tasks ? "No tasks in this run" : "Loading tasks..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionPanel({
  projectId,
  executions,
  isLoading,
  onRefresh,
}: ExecutionPanelProps) {
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [parallelCount, setParallelCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Active execution = most recent non-terminal
  const activeExecution = useMemo(
    () =>
      executions?.find(
        (e) =>
          e.status === "running" ||
          e.status === "paused" ||
          e.status === "pending",
      ),
    [executions],
  );

  // Fetch tasks for active/selected run
  const { tasks: executionTasks, mutate: mutateTasks } = useExecutionTasks(
    activeExecution?.id,
  );

  // Listen for routine events on the main WebSocket connection
  const { subscribe, status: wsStatus } = useWebSocketContext();
  useEffect(() => {
    if (!activeExecution) return;
    const runId = activeExecution.id;
    return subscribe((data: unknown) => {
      const msg = data as Record<string, unknown>;
      // Check if this is a routine event for our execution
      const payload = (msg.payload ?? msg) as Record<string, unknown>;
      const msgType = (payload.type ?? payload.event_type ?? "") as string;
      const eventRunId = (payload.execution_run_id ?? "") as string;
      if (
        eventRunId === runId &&
        (msgType === "task.step_event" ||
          msgType === "task.completed" ||
          msgType === "execution.completed")
      ) {
        onRefresh();
        mutateTasks();
      }
    });
  }, [activeExecution, subscribe, onRefresh, mutateTasks]);

  const handleCreate = useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      await createExecution({
        project_id: projectId,
        parallel_count: parallelCount,
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create execution.");
    } finally {
      setCreating(false);
    }
  }, [projectId, parallelCount, onRefresh]);

  const handleCommand = useCallback(
    async (executionId: string, command: ExecutionCommand) => {
      setError(null);
      setSending(command);
      try {
        await sendExecutionCommand(executionId, command);
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${command} execution.`);
      } finally {
        setSending(null);
      }
    },
    [onRefresh],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      onRefresh();
      await mutateTasks();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, mutateTasks]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 dark:border-gray-700 dark:bg-gray-800">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  // Count running tasks
  const runningTasks = executionTasks?.filter(
    (t) => t.status === "assigned" || t.status === "in_progress",
  ).length ?? 0;
  const doneTasks = executionTasks?.filter(
    (t) => t.status === "done" || t.status === "failed",
  ).length ?? 0;
  const readyTasks = executionTasks?.filter(
    (t) => t.status === "ready",
  ).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Active execution card */}
      {activeExecution ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {/* Header */}
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between dark:border-gray-700">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Execution Run
              </h3>
              <Badge variant={activeExecution.status} showDot>
                {activeExecution.status}
              </Badge>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  wsStatus === "connected"
                    ? "bg-emerald-500"
                    : wsStatus === "connecting"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-gray-300",
                )}
                title={`WebSocket: ${wsStatus}`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {formatRelativeTime(activeExecution.created_at)}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:hover:bg-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                title="Refresh statuses"
              >
                <svg
                  className={cn("h-4 w-4", refreshing && "animate-spin")}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.016 4.356v4.992" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {doneTasks} / {activeExecution.task_counts.total} tasks complete
                </span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {Math.round(activeExecution.completion_percentage)}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-deep-space-blue-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(activeExecution.completion_percentage, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                {
                  label: "Slots",
                  value: `${runningTasks}/${activeExecution.parallel_count}`,
                },
                { label: "Ready", value: readyTasks },
                { label: "Running", value: runningTasks },
                { label: "Done", value: doneTasks },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-900"
                >
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-2">
              {canStart(activeExecution) && (
                <Button
                  size="sm"
                  onClick={() => handleCommand(activeExecution.id, "start")}
                  disabled={!!sending}
                >
                  {sending === "start" ? "Starting..." : "Start Execution"}
                </Button>
              )}
              {canPause(activeExecution) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCommand(activeExecution.id, "pause")}
                  disabled={!!sending}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  {sending === "pause" ? "Pausing..." : "Pause"}
                </Button>
              )}
              {canResume(activeExecution) && (
                <Button
                  size="sm"
                  onClick={() => handleCommand(activeExecution.id, "resume")}
                  disabled={!!sending}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  {sending === "resume" ? "Resuming..." : "Resume"}
                </Button>
              )}
              {canCancel(activeExecution) && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleCommand(activeExecution.id, "cancel")}
                  disabled={!!sending}
                >
                  {sending === "cancel" ? "Cancelling..." : "Cancel"}
                </Button>
              )}
            </div>
          </div>

          {/* Task list (GitHub Actions style) */}
          {executionTasks && executionTasks.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              <div className="px-5 py-2.5">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Tasks
                </h4>
              </div>
              <div>
                {executionTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No active execution — creation UI */
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-gray-100">
            Start New Execution
          </h3>
          <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
            Create an execution run to start processing tasks with AI agents.
            Each task uses its own assigned routine.
          </p>

          <div className="flex items-end gap-3">
            <div>
              <label
                htmlFor="parallel-count"
                className="block text-xs font-medium text-gray-600 mb-1 dark:text-gray-400"
              >
                Parallel Tasks
              </label>
              <input
                id="parallel-count"
                type="number"
                min={1}
                max={20}
                value={parallelCount}
                onChange={(e) =>
                  setParallelCount(
                    Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                  )
                }
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Start Execution
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Execution history */}
      {executions && executions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Execution History
            </h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {executions.map((exec) => (
              <HistoryRow key={exec.id} execution={exec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
