import type { ExecutionStatus, Task, TaskStatusCategory } from "./types";

export interface TaskEditorDraft {
  title: string;
  instructions: string;
  statusId: string;
  priority: Task["priority"];
  projectId: string;
  target: string;
  labelIds: readonly string[];
}

const ACTIVE_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "pending",
  "queued",
  "running",
  "paused",
]);

const RUNNABLE_TASK_CATEGORIES = new Set<TaskStatusCategory>([
  "unstarted",
  "started",
]);

/** Whether a task workflow category permits manual or scheduled execution. */
export function taskCategoryIsRunnable(category: TaskStatusCategory): boolean {
  return RUNNABLE_TASK_CATEGORIES.has(category);
}

/** Whether a run still occupies the task's single concurrency slot. */
export function taskExecutionIsActive(status: ExecutionStatus): boolean {
  return ACTIVE_EXECUTION_STATUSES.has(status);
}

/** Compare editable task fields without treating label ordering as a change. */
export function taskEditorHasChanges(task: Task, draft: TaskEditorDraft): boolean {
  const persistedTarget = task.execution_target
    ? `${task.execution_target.type}:${task.execution_target.id}`
    : "";
  const persistedLabelIds = new Set(task.labels.map((label) => label.id));
  const labelsChanged = draft.labelIds.length !== persistedLabelIds.size
    || draft.labelIds.some((id) => !persistedLabelIds.has(id));
  return draft.title.trim() !== task.title
    || draft.instructions !== (task.instructions ?? "")
    || draft.statusId !== task.status.id
    || draft.priority !== task.priority
    || draft.projectId !== (task.project_id ?? "")
    || draft.target !== persistedTarget
    || labelsChanged;
}

/** Whether a run transition may have changed the task workflow projection. */
export function executionStatusMayChangeTask(status: ExecutionStatus): boolean {
  return ["running", "completed", "failed", "cancelled"].includes(status);
}

/** Partition tasks using the server-derived dispatch invariant. */
export function partitionTasksByDispatch(tasks: readonly Task[]): {
  manual: Task[];
  scheduled: Task[];
} {
  const manual: Task[] = [];
  const scheduled: Task[] = [];
  for (const task of tasks) {
    (task.dispatch.mode === "scheduled" ? scheduled : manual).push(task);
  }
  return { manual, scheduled };
}

/** Collapse detailed run state to the schedule lifecycle shown on task cards. */
export function scheduledTaskStateLabel(task: Task): "Queued" | "Paused" | "Running" {
  if (task.dispatch.mode !== "scheduled") return "Queued";
  if (task.dispatch.state === "running") return "Running";
  return task.dispatch.state === "paused" ? "Paused" : "Queued";
}

/** Return the schedule lifecycle action that is valid in the task details view. */
export function scheduledTaskControl(
  enabled: boolean,
  state: "queued" | "paused" | "running" | undefined,
): "pause" | "resume" | null {
  if (state === "running") return null;
  if (!enabled) return "resume";
  return state === "queued" ? "pause" : null;
}
