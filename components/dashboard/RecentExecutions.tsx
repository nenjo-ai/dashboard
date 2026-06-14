"use client";

import { useState } from "react";
import type { ExecutionDetails, ExecutionTask } from "@/lib/types";
import { useExecutionTasks } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { ExecutionRowSkeleton } from "@/components/ui/Skeleton";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { formatToolCallSignature, normalizeToolCallArgs } from "@/lib/toolCallDisplay";
import { executionTasksToRunTrace } from "@/lib/agentRunTrace/adapters/executionHistory";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";

interface RecentExecutionsProps {
  executions: ExecutionDetails[] | undefined;
  isLoading: boolean;
  isError: boolean;
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
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "--";
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((to - from) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "done":
    case "resolved":
      return (
        <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "failed":
      return (
        <svg className="h-3.5 w-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "in_progress":
    case "assigned":
    case "running":
      return (
        <svg className="h-3.5 w-3.5 text-yellow-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    default:
      return <span className="theme-surface-muted h-3.5 w-3.5 shrink-0 rounded-full block" />;
  }
}

function hasToolArgs(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function toolArgsForStep(step: ExecutionTask["steps"][number]): string {
  const payloadArgs = step.payload?.tool_args;
  const dataArgs = step.data?.tool_args;
  if (hasToolArgs(payloadArgs)) return normalizeToolCallArgs(payloadArgs);
  if (hasToolArgs(dataArgs)) return normalizeToolCallArgs(dataArgs);
  return "";
}

function friendlyToolName(toolName: string): string {
  return toolName.replace(/^app\.nenjo\.platform\//, "");
}

function stepDisplayName(step: ExecutionTask["steps"][number]): string {
  if (step.step_type === "tool") {
    return friendlyToolName(step.step_name);
  }
  return step.step_name;
}

function stepStatusLabel(step: ExecutionTask["steps"][number]): string {
  return step.event_type === "step_completed" ? "done"
    : step.event_type === "step_failed" ? "failed"
    : step.event_type === "step_started" ? "in_progress"
    : "open";
}

interface DisplayStep {
  step: ExecutionTask["steps"][number];
  children: ExecutionTask["steps"][number][];
}

function stepIdentityKey(step: ExecutionTask["steps"][number]): string {
  const stepRunId = step.data?.step_run_id;
  if (typeof stepRunId === "string" && stepRunId.length > 0) return `routine-run:${stepRunId}`;
  const stepId = step.data?.step_id;
  if (typeof stepId === "string" && stepId.length > 0) return `routine:${stepId}`;
  return `${step.step_type}:${step.step_name}`;
}

function isChildActivityStep(step: ExecutionTask["steps"][number]): boolean {
  return step.step_type === "tool" || step.step_type === "ability" || step.step_type === "delegation";
}

function mergeStep(
  prev: ExecutionTask["steps"][number],
  next: ExecutionTask["steps"][number],
): ExecutionTask["steps"][number] {
  return {
    ...next,
    step_name: next.step_name || prev.step_name,
    step_type: next.step_type || prev.step_type,
    agent: next.agent ?? prev.agent,
    data: { ...(prev.data ?? {}), ...(next.data ?? {}) },
    payload: next.payload ?? prev.payload,
    encrypted_payload: next.encrypted_payload ?? prev.encrypted_payload,
  };
}

function buildDisplaySteps(steps: ExecutionTask["steps"]): DisplayStep[] {
  const groups: DisplayStep[] = [];
  const parentIndex = new Map<string, number>();

  for (const step of steps) {
    if (isChildActivityStep(step)) continue;
    const key = stepIdentityKey(step);
    const existingIndex = parentIndex.get(key);
    if (existingIndex != null) {
      groups[existingIndex] = {
        ...groups[existingIndex],
        step: mergeStep(groups[existingIndex].step, step),
      };
      continue;
    }

    const index = groups.length;
    groups.push({ step, children: [] });
    parentIndex.set(key, index);
    if (step.step_name) parentIndex.set(step.step_name, index);
  }

  let currentParentName: string | null = null;
  for (const step of steps) {
    if (!isChildActivityStep(step)) {
      currentParentName = step.step_name;
      continue;
    }

    const parentGroupIndex =
      parentIndex.get(stepIdentityKey(step)) ??
      (currentParentName ? parentIndex.get(currentParentName) : undefined);

    if (parentGroupIndex != null) {
      groups[parentGroupIndex].children.push(step);
    } else {
      groups.push({ step, children: [] });
    }
  }

  return groups;
}

function StepDetail({
  step,
  activitySteps = [],
}: {
  step: ExecutionTask["steps"][number];
  activitySteps?: ExecutionTask["steps"][number][];
}) {
  const [argsExpanded, setArgsExpanded] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const d = step.data as Record<string, unknown> | undefined;
  const agent = step.agent;
  const isRunning = step.event_type === "step_started";
  const status = stepStatusLabel(step);
  const isTool = step.step_type === "tool";
  const toolArgs = isTool ? toolArgsForStep(step) : "";
  const hasActivity = activitySteps.length > 0;
  const inputTok = typeof d?.input_tokens === "number" ? d.input_tokens : 0;
  const outputTok = typeof d?.output_tokens === "number" ? d.output_tokens : 0;
  const totalTok = inputTok + outputTok;

  return (
    <div className="ml-2 py-1">
      <div className="flex items-center gap-2">
        {agent ? (
          <RoleIdenticon
            roleId={agent.agent}
            color={agent.agent_color ?? "#6B7280"}
            size={14}
            className="shrink-0"
            animate={isRunning}
            name={agent.agent_name ?? undefined}
          />
        ) : (
          <TaskStatusIcon status={status} />
        )}
        <span
          className={`flex-1 truncate text-xs text-gray-600 dark:text-gray-400 ${isTool ? "font-mono" : ""}`}
          title={isTool && toolArgs ? formatToolCallSignature(stepDisplayName(step), toolArgs) : stepDisplayName(step)}
        >
          {stepDisplayName(step)}
        </span>
        {isTool && toolArgs && (
          <button
            type="button"
            onClick={() => setArgsExpanded((value) => !value)}
            className="theme-border theme-surface rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition-colors hover:[background:var(--app-hover)] dark:text-gray-400"
          >
            {argsExpanded ? "Hide args" : "Show args"}
          </button>
        )}
        {totalTok > 0 && (
          <span
            className="text-[10px] text-gray-400 tabular-nums"
            title={`In: ${inputTok.toLocaleString()} / Out: ${outputTok.toLocaleString()}`}
          >
            {formatTokens(totalTok)} tok
          </span>
        )}
        {step.duration_ms != null && (
          <span className="text-[10px] text-gray-400">
            {step.duration_ms < 1000
              ? `${step.duration_ms}ms`
              : `${(step.duration_ms / 1000).toFixed(1)}s`}
          </span>
        )}
        {hasActivity && (
          <button
            type="button"
            onClick={() => setActivityExpanded((value) => !value)}
            className="theme-border theme-surface rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition-colors hover:[background:var(--app-hover)] dark:text-gray-400"
          >
            {activityExpanded ? "Hide tools" : "Show tools"} ({activitySteps.length})
          </button>
        )}
      </div>
      {isTool && toolArgs && argsExpanded && (
        <pre className="theme-surface mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          {toolArgs}
        </pre>
      )}
      {hasActivity && activityExpanded && (
        <div className="mt-1 space-y-0.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
          {activitySteps.map((child, index) => (
            <StepDetail
              key={`${child.step_name}:${child.event_type}:${index}`}
              step={child}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: ExecutionTask }) {
  const displaySteps = buildDisplaySteps(task.steps);
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2.5">
        <TaskStatusIcon status={task.status} />
        <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {task.slug ? `${task.slug} - ` : ""}{task.title}
        </span>
        <span className="ml-auto shrink-0 text-[10px] capitalize text-gray-400 dark:text-gray-500">
          {task.status.replace("_", " ")}
        </span>
      </div>
      {displaySteps.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-4">
          {displaySteps.map(({ step, children }, index) => (
            <StepDetail
              key={`${step.step_name}:${step.event_type}:${index}`}
              step={step}
              activitySteps={children}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

function isCronExecution(exec: ExecutionDetails): boolean {
  const config = exec.config as Record<string, unknown> | undefined;
  return config?.trigger_source === "cron" || config?.trigger_source === "manual";
}

function ExecutionRow({ exec }: { exec: ExecutionDetails }) {
  const [expanded, setExpanded] = useState(false);
  const { tasks, isLoading: tasksLoading } = useExecutionTasks(
    expanded ? exec.id : undefined,
  );
  const isCron = isCronExecution(exec);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-3 text-left transition-colors hover:[background:var(--app-hover)]"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Badge variant={exec.status} showDot>
            {exec.status}
          </Badge>
          {isCron && (
            <Badge variant="inactive">Cron</Badge>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              Execution #{exec.id.slice(0, 8)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {exec.model_count} agent{exec.model_count !== 1 ? "s" : ""} &middot;{" "}
              {exec.task_counts.total} task{exec.task_counts.total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          {/* Progress */}
          {exec.task_counts.total > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(exec.completion_percentage, 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-10 text-right dark:text-gray-400">
                {Math.round(exec.completion_percentage)}%
              </span>
            </div>
          )}

          {/* Duration */}
          <span className="hidden md:block text-xs text-gray-400 w-16 text-right dark:text-gray-500">
            {formatDuration(exec.started_at, exec.completed_at)}
          </span>

          {/* Timestamp */}
          <span className="text-xs text-gray-400 w-16 text-right dark:text-gray-500">
            {formatRelativeTime(exec.created_at)}
          </span>

          {/* Chevron */}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Expanded task details */}
      {expanded && (
        <div className="theme-border theme-surface-muted ml-10 mr-2 mb-2 rounded-lg border px-4 py-2">
          {tasksLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="theme-surface-muted-strong h-3.5 w-3.5 animate-pulse rounded-full" />
                  <div className="theme-surface-muted-strong h-3 w-48 animate-pulse rounded-sm" />
                </div>
              ))}
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <p className="py-2 text-xs text-gray-400 dark:text-gray-500">
              {isCron ? "No step events recorded." : "No tasks in this execution."}
            </p>
          ) : (
            <AgentRunTrace
              trace={executionTasksToRunTrace(exec, tasks)}
              mode="history"
              density="compact"
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyExecutions() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <svg
        className="h-10 w-10 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No executions yet</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Executions will appear here once you start running your projects.
      </p>
    </div>
  );
}

export function RecentExecutions({
  executions,
  isLoading,
  isError,
}: RecentExecutionsProps) {
  if (isLoading) {
    return (
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {Array.from({ length: 5 }).map((_, i) => (
          <ExecutionRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        Failed to load executions.
      </div>
    );
  }

  if (!executions || executions.length === 0) {
    return <EmptyExecutions />;
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {executions.map((exec) => (
        <ExecutionRow key={exec.id} exec={exec} />
      ))}
    </div>
  );
}
