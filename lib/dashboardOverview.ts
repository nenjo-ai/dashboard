import type { ChatSessionIndicatorState } from "./chat/sessionIndicators.ts";
import type { ChatSessionExtended, ExecutionDetails } from "./types.ts";

const ACTIVE_EXECUTION_STATUSES = new Set([
  "pending",
  "queued",
  "running",
  "paused",
]);

function isSameLocalDay(value: string | null, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function executionNeedsAttention(execution: ExecutionDetails): boolean {
  return (
    execution.status === "failed" ||
    execution.status === "waiting_for_human" ||
    execution.pending_reviews > 0
  );
}

export function summarizeDashboardExecutions(
  executions: readonly ExecutionDetails[],
  now = new Date(),
) {
  return {
    activeCount: executions.filter((execution) =>
      ACTIVE_EXECUTION_STATUSES.has(execution.status),
    ).length,
    attentionCount: executions.filter(executionNeedsAttention).length,
    completedTodayCount: executions.filter(
      (execution) =>
        execution.status === "completed" &&
        isSameLocalDay(execution.completed_at, now),
    ).length,
  };
}

/** Running conversations stay visible even when a quieter session changed later. */
export function selectDashboardSessions(
  sessions: readonly ChatSessionExtended[],
  indicators: ChatSessionIndicatorState,
  limit = 4,
): ChatSessionExtended[] {
  return [...sessions]
    .sort((left, right) => {
      const leftRunning = indicators[left.id]?.status === "running";
      const rightRunning = indicators[right.id]?.status === "running";
      if (leftRunning !== rightRunning) return leftRunning ? -1 : 1;
      return (
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime()
      );
    })
    .slice(0, limit);
}
