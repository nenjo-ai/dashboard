"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  RoutineSummary,
  DependencyGraph,
  ExecutionDetails,
  AgentDefinition,
} from "@/lib/types";
import { updateTask, deleteTask, addDependency, removeDependency } from "@/lib/api";
import { useAgents } from "@/lib/hooks";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  routines?: RoutineSummary[];
  tasks?: Task[];
  graph?: DependencyGraph;
  executions?: ExecutionDetails[];
  onDepsChanged?: () => void;
}

const STATUSES: TaskStatus[] = [
  "open",
  "ready",
  "backlog",
  "in_progress",
  "done",
  "failed",
];

const EDITABLE_STATUSES: TaskStatus[] = ["open", "backlog", "ready", "done", "failed"];

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

const TYPES: TaskType[] = ["bug", "feature", "task", "improvement"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <div className="flex-1 text-sm text-gray-700 dark:text-gray-300" suppressHydrationWarning>
        {children}
      </div>
    </div>
  );
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export function TaskDetailModal({
  task,
  onClose,
  onUpdated,
  onDeleted,
  routines,
  tasks,
  graph,
  executions,
  onDepsChanged,
}: TaskDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [depLoading, setDepLoading] = useState(false);
  const [addDepId, setAddDepId] = useState("");

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [status, setStatus] = useState<TaskStatus>("open");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [complexity, setComplexity] = useState<number | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);

  // Agents
  const { agents } = useAgents();

  // Editability
  const canEdit = task ? EDITABLE_STATUSES.includes(task.status) : false;
  const hasActiveExecution = task?.status === "assigned" && executions?.some(
    (e) => e.id === task.execution_run_id && e.status === "running",
  );

  // Dependency data
  const dependsOn = useMemo(() => {
    if (!task || !graph) return [];
    return graph.edges
      .filter((e) => e.target === task.id)
      .map((e) => tasks?.find((t) => t.id === e.source))
      .filter(Boolean) as Task[];
  }, [task, graph, tasks]);

  const blocks = useMemo(() => {
    if (!task || !graph) return [];
    return graph.edges
      .filter((e) => e.source === task.id)
      .map((e) => tasks?.find((t) => t.id === e.target))
      .filter(Boolean) as Task[];
  }, [task, graph, tasks]);

  // Tasks available for adding as a dependency (exclude self + already-added)
  const availableDeps = useMemo(() => {
    if (!task || !tasks) return [];
    const existingDepIds = new Set(dependsOn.map((t) => t.id));
    return tasks.filter((t) => t.id !== task.id && !existingDepIds.has(t.id));
  }, [task, tasks, dependsOn]);

  // Populate form fields from task
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setAcceptanceCriteria(task.acceptance_criteria ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setTaskType(task.type);
      setComplexity(task.complexity);
      setRoutineId(task.routine_id);
      setAssignedAgentId(task.assigned_agent_id);
    }
  }, [task]);

  // Reset state when modal closes
  useEffect(() => {
    if (!task) {
      setEditing(false);
      setConfirmDelete(false);
      setApiError(null);
      setDepError(null);
      setAddDepId("");
    }
  }, [task]);

  function startEditing() {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setAcceptanceCriteria(task.acceptance_criteria ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setTaskType(task.type);
    setComplexity(task.complexity);
    setRoutineId(task.routine_id);
    setAssignedAgentId(task.assigned_agent_id);
    setApiError(null);
    setDepError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setApiError(null);
    setDepError(null);
  }

  async function handleSave() {
    if (!task) return;
    setSaving(true);
    setApiError(null);
    try {
      await updateTask(task.id, {
        title,
        description: description || undefined,
        acceptance_criteria: acceptanceCriteria || undefined,
        status,
        priority,
        type: taskType,
        complexity: complexity ?? undefined,
        routine_id: routineId,
        assigned_agent_id: assignedAgentId,
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      onDeleted();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function handleAddDep() {
    if (!task || !addDepId) return;
    setDepLoading(true);
    setDepError(null);
    try {
      await addDependency(task.id, addDepId);
      setAddDepId("");
      onDepsChanged?.();
    } catch (err) {
      setDepError(err instanceof Error ? err.message : "Failed to add dependency");
    } finally {
      setDepLoading(false);
    }
  }

  async function handleRemoveDep(depTaskId: string) {
    if (!task) return;
    setDepLoading(true);
    setDepError(null);
    try {
      await removeDependency(task.id, depTaskId);
      onDepsChanged?.();
    } catch (err) {
      setDepError(err instanceof Error ? err.message : "Failed to remove dependency");
    } finally {
      setDepLoading(false);
    }
  }

  if (!task) return null;

  const routineName =
    task.routine_id && routines
      ? routines.find((p) => p.id === task.routine_id)?.name ?? "Unknown"
      : "None";

  const hasDeps = dependsOn.length > 0 || blocks.length > 0;

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={editing ? "Edit Task" : task.title}
      className="max-w-2xl"
    >
      {/* API error */}
      {apiError && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {apiError}
        </div>
      )}

      {editing ? (
        /* ---- Edit mode ---- */
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Acceptance Criteria */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Acceptance Criteria
            </label>
            <textarea
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Row: Status, Priority, Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Type
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Complexity, Routine, Agent */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Complexity (1-5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={complexity ?? ""}
                onChange={(e) =>
                  setComplexity(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Routine
              </label>
              <select
                value={routineId ?? ""}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setRoutineId(val);
                  if (val) setAssignedAgentId(null);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">None</option>
                {routines?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                Agent
              </label>
              <select
                value={assignedAgentId ?? ""}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setAssignedAgentId(val);
                  if (val) setRoutineId(null);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">None</option>
                {agents?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dependencies edit */}
          {graph && tasks && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Depends On
              </label>
              {depError && (
                <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {depError}
                </div>
              )}
              {dependsOn.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dependsOn.map((dep) => (
                    <span
                      key={dep.id}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      <code className="font-mono text-[10px]">{dep.slug ?? dep.id.slice(0, 8)}</code>
                      <button
                        type="button"
                        onClick={() => handleRemoveDep(dep.id)}
                        disabled={depLoading}
                        className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Remove dependency"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-2">No dependencies</p>
              )}
              <div className="flex gap-2">
                <select
                  value={addDepId}
                  onChange={(e) => setAddDepId(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">Select task...</option>
                  {availableDeps.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.slug ?? t.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddDep}
                  disabled={!addDepId || depLoading}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        /* ---- View mode ---- */
        <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
          {/* Badges */}
          <div className="flex flex-wrap gap-2 pb-3">
            <Badge variant={task.status} showDot>
              {task.status.replace("_", " ")}
            </Badge>
            <Badge variant={task.priority}>{task.priority}</Badge>
            <Badge variant={task.type}>{task.type}</Badge>
            {task.complexity !== null && (
              <Badge variant="default">Complexity: {task.complexity}</Badge>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="py-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Description
              </h4>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 dark:bg-gray-900 dark:text-gray-300">
                {task.description}
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptance_criteria && (
            <div className="py-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Acceptance Criteria
              </h4>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3 dark:bg-gray-900 dark:text-gray-300">
                {task.acceptance_criteria}
              </div>
            </div>
          )}

          {/* Dependencies view */}
          {hasDeps && (
            <div className="py-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Dependencies
              </h4>
              {dependsOn.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Depends on:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {dependsOn.map((dep) => (
                      <span
                        key={dep.id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      >
                        <code className="font-mono text-[10px]">{dep.slug ?? dep.id.slice(0, 8)}</code>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {blocks.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Blocks:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {blocks.map((dep) => (
                      <span
                        key={dep.id}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        <code className="font-mono text-[10px]">{dep.slug ?? dep.id.slice(0, 8)}</code>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="py-3">
            <DetailRow label="ID">
              <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                {task.id}
              </span>
            </DetailRow>
            {task.slug && (
              <DetailRow label="Slug">
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                  {task.slug}
                </span>
              </DetailRow>
            )}
            <DetailRow label="Routine">{routineName}</DetailRow>
            <DetailRow label="Agent">
              {task.assigned_agent_id && agents
                ? agents.find((a) => a.id === task.assigned_agent_id)?.display_name
                  ?? agents.find((a) => a.id === task.assigned_agent_id)?.name
                  ?? "Unknown"
                : "None"}
            </DetailRow>
            <DetailRow label="Order">{task.order_index}</DetailRow>
            <DetailRow label="Created">{formatDate(task.created_at)}</DetailRow>
            <DetailRow label="Updated">{formatDate(task.updated_at)}</DetailRow>
            {task.resolved_at && (
              <DetailRow label="Resolved">
                {formatDate(task.resolved_at)}
              </DetailRow>
            )}
          </div>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div className="py-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution info */}
          {task.execution_run_id && (
            <div className="py-3">
              <DetailRow label="Execution Run">
                <code className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-sm">
                  {task.execution_run_id.slice(0, 8)}...
                </code>
              </DetailRow>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between pt-4">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors dark:text-red-400 dark:hover:text-red-300"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Are you sure?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              {hasActiveExecution && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Assigned to active execution
                </span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Edit
                </button>
              ) : (
                !hasActiveExecution && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Editing disabled ({task.status.replace("_", " ")})
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
