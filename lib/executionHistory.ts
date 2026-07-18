import type { ExecutionDetails } from "@/lib/types";

/** Pick the most useful stable label for a task-centered execution row. */
export function executionHistoryLabel(execution: ExecutionDetails): string {
  return (
    execution.task_title ??
    execution.routine_name ??
    `Run ${execution.id.slice(0, 8)}`
  );
}

/** Format a run timestamp relative to a supplied clock for a compact history row. */
export function formatExecutionRelativeTime(value: string, now = Date.now()): string {
  const elapsed = now - new Date(value).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
