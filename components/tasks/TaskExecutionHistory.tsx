"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

import { TaskRunActivity } from "@/components/tasks/TaskRunActivity";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatTraceDuration } from "@/lib/agentRunTrace/presentation";
import { cn } from "@/lib/cn";
import {
  executionHistoryLabel,
  formatExecutionRelativeTime,
} from "@/lib/executionHistory";
import type { ExecutionDetails, TaskExecutionRun } from "@/lib/types";

function persistedActivityLabel(
  execution: ExecutionDetails | TaskExecutionRun,
): string | undefined {
  const summary = execution.trace_summary;
  if (!summary.available) return undefined;
  const parts: string[] = [];
  if (summary.tool_call_count > 0) {
    parts.push(
      `${summary.tool_call_count} tool call${summary.tool_call_count === 1 ? "" : "s"}`,
    );
  }
  if (summary.operation_count > 0) {
    parts.push(
      `${summary.operation_count} ${summary.operation_count === 1 ? "operation" : "operations"}`,
    );
  }
  const tokens = summary.input_tokens + summary.output_tokens;
  if (tokens > 0) parts.push(`${tokens.toLocaleString()} tokens`);
  const duration = formatTraceDuration(
    execution.started_at ?? undefined,
    execution.completed_at ?? undefined,
  );
  if (duration) parts.push(duration);
  return parts.join(" · ") || undefined;
}

interface TaskExecutionHistoryProps {
  executions: Array<ExecutionDetails | TaskExecutionRun> | undefined;
  isError?: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onRetry?: (executionId: string) => Promise<void>;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Compact task-run history with the shared persisted and live trace surface.
 * It is intentionally target-agnostic so task, routine, and agent views can
 * all present the canonical execution record without duplicating SSE logic.
 */
export function TaskExecutionHistory({
  executions,
  isError = false,
  isLoading,
  onRefresh,
  onRetry,
  title = "Task activity",
  emptyTitle = "No task activity yet",
  emptyDescription = "Run a task assigned to this routine to see its live agent trace here.",
}: TaskExecutionHistoryProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="theme-surface theme-border space-y-3 rounded-xl border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="theme-surface theme-border rounded-xl border p-6 text-center">
        <p className="theme-text-muted text-sm">Task activity is unavailable.</p>
      </div>
    );
  }

  if (!executions?.length) {
    return (
      <div className="theme-surface theme-border rounded-xl border p-6 text-center">
        <History className="theme-text-muted mx-auto mb-2 h-5 w-5" />
        <p className="theme-text text-sm font-medium">{emptyTitle}</p>
        <p className="theme-text-muted mt-1 text-sm">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="theme-surface theme-border overflow-hidden rounded-xl border">
      <div className="theme-border border-b px-4 py-3">
        <h2 className="theme-text text-sm font-semibold">{title}</h2>
      </div>
      <div className="theme-border divide-y">
        {executions.map((execution) => {
          const expanded = expandedRunId === execution.id;
          const activityLabel = persistedActivityLabel(execution);
          return (
            <section key={execution.id}>
              <div className="flex items-center gap-2 pr-4 transition-colors hover:[background:var(--app-hover)]">
                <button
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedRunId(expanded ? null : execution.id)}
                  type="button"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {expanded ? (
                      <ChevronDown className="theme-text-muted h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="theme-text-muted h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="theme-text truncate text-sm font-medium">
                        {"task_title" in execution ? executionHistoryLabel(execution) : `Run ${execution.id.slice(0, 8)}`}
                      </p>
                      <p className="theme-text-muted text-xs">
                        {formatExecutionRelativeTime(execution.created_at)}
                        {activityLabel ? ` · ${activityLabel}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={cn(execution.status === "running" && "motion-safe:animate-pulse")}
                    showDot
                    variant={execution.status}
                  >
                    {execution.status}
                  </Badge>
                </button>
                {execution.pending_reviews > 0 ? (
                  <a
                    className="shrink-0 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white"
                    href={`/dashboard/reviews?execution_id=${execution.id}`}
                  >
                    Review
                  </a>
                ) : null}
                {execution.status === "failed" && onRetry ? (
                  <button className="theme-text-muted shrink-0 rounded-md px-2 py-1.5 text-xs font-medium hover:[background:var(--app-hover)]" onClick={() => void onRetry(execution.id)} type="button">Retry</button>
                ) : null}
              </div>
              {expanded ? (
                <div className="theme-border border-t p-4">
                  <TaskRunActivity
                    executionId={execution.id}
                    onTerminal={onRefresh}
                    status={execution.status}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
