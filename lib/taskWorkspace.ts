import type { Task } from "./types";

export type TaskWorkspaceView = "all" | "manual" | "scheduled";

export interface TaskWorkspaceSummary {
  totalCount: number;
  inProgressCount: number;
  readyCount: number;
  scheduledCount: number;
  completedCount: number;
}

/** Collapse task lifecycle details into the four signals needed by the work queue. */
export function summarizeTaskWorkspace(tasks: readonly Task[]): TaskWorkspaceSummary {
  return tasks.reduce<TaskWorkspaceSummary>((summary, task) => {
    summary.totalCount += 1;
    if (task.status.category === "started"
      || (task.dispatch.mode === "scheduled" && task.dispatch.state === "running")) {
      summary.inProgressCount += 1;
    }
    if (task.status.category === "unstarted") summary.readyCount += 1;
    if (task.dispatch.mode === "scheduled") summary.scheduledCount += 1;
    if (task.status.category === "completed") summary.completedCount += 1;
    return summary;
  }, {
    totalCount: 0,
    inProgressCount: 0,
    readyCount: 0,
    scheduledCount: 0,
    completedCount: 0,
  });
}

/**
 * Project the server task collection into the visible queue. Search stays local
 * so typing never creates a request-per-keystroke and the server remains the
 * authority for structured catalog filters.
 */
export function selectTaskWorkspaceTasks(
  tasks: readonly Task[],
  view: TaskWorkspaceView,
  query: string,
): Task[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return tasks
    .filter((task) => view === "all" || task.dispatch.mode === view)
    .filter((task) => {
      if (!normalizedQuery) return true;
      return [
        task.identifier,
        task.title,
        task.project_slug ?? "",
        ...task.labels.map((label) => label.name),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      const rank = (task: Task) => {
        if (task.dispatch.mode === "scheduled" && task.dispatch.state === "running") return 0;
        if (task.status.category === "started") return 1;
        if (task.status.category === "unstarted") return 2;
        return 3;
      };
      return rank(left) - rank(right)
        || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
}
