"use client";

import { cn } from "@/lib/cn";
import { useState, useCallback } from "react";
import type { Task, RoutineSummary } from "@/lib/types";
import { deleteAllTasks, createTask } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";


interface TaskListProps {
  tasks: Task[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onSelectTask: (task: Task) => void;
  onDeleted?: () => void;
  projectId: string;
  routines?: RoutineSummary[];
}

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "ready", label: "Ready" },
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

function complexityLabel(c: number | null): string {
  if (c === null) return "";
  if (c <= 2) return "Simple";
  if (c <= 5) return "Medium";
  if (c <= 8) return "Complex";
  return "Very Complex";
}

function TaskRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="h-5 w-5 rounded-sm" />
      <Skeleton className="h-4 w-48 flex-1" />
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-14 rounded-full" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

function EmptyTasks() {
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <svg
        className="h-12 w-12 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
        />
      </svg>
      <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        No tasks yet
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Use an agent to create tasks or manually create them.
      </p>
    </div>
  );
}

export function TaskList({
  tasks,
  isLoading,
  isError,
  onSelectTask,
  onDeleted,
  projectId,
  routines,
}: TaskListProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      await deleteAllTasks(projectId);
      setConfirmDeleteAll(false);
      onDeleted?.();
    } catch {
      // keep confirmation visible
    } finally {
      setDeletingAll(false);
    }
  }, [projectId, onDeleted]);

  const handleCreateTask = useCallback(async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createTask({
        project_id: projectId,
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewTitle("");
      setNewDescription("");
      setCreateModalOpen(false);
      onDeleted?.(); // reuse the refresh callback
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }, [projectId, newTitle, newDescription, onDeleted]);

  const filtered =
    tasks?.filter(
      (t) => statusFilter === "all" || t.status === statusFilter,
    ) ?? [];

  const statusCounts = tasks?.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <>
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Filter bar */}
      <div className="border-b border-gray-100 px-4 py-3 flex items-center gap-2 overflow-x-auto dark:border-gray-700">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.id === "all"
              ? tasks?.length ?? 0
              : statusCounts?.[f.id] ?? 0;
          const isActive = statusFilter === f.id;

          // Hide empty statuses except "all"
          if (f.id !== "all" && count === 0) return null;

          return (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-deep-space-blue-50 text-deep-space-blue-700 border border-deep-space-blue-200 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300 dark:border-deep-space-blue-700"
                  : "text-gray-500 hover:bg-gray-100 border border-transparent dark:text-gray-400 dark:hover:bg-gray-700",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  isActive
                    ? "bg-deep-space-blue-100 text-deep-space-blue-600 dark:bg-deep-space-blue-900/50 dark:text-deep-space-blue-300"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Actions — pushed to the right */}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setCreateModalOpen(true)}>
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create
            </span>
          </Button>
          {tasks && tasks.length > 0 && (
            !confirmDeleteAll ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors whitespace-nowrap"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete all
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 dark:border-red-800 dark:bg-red-950/30">
                <span className="text-xs text-red-700 dark:text-red-400">
                  Delete all {tasks.length} tasks?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deletingAll ? "Deleting..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(false)}
                  disabled={deletingAll}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <TaskRowSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Failed to load tasks.
        </div>
      ) : filtered.length === 0 ? (
        statusFilter === "all" ? (
          <EmptyTasks />
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">
            No tasks with status &ldquo;{statusFilter.replace("_", " ")}
            &rdquo;.
          </div>
        )
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map((task) => (
            <button
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors dark:hover:bg-gray-700/50"
            >
              {/* Order index */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                {task.order_index}
              </span>

              {/* Title + slug */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                  {task.title}
                </p>
                {task.slug && (
                  <p className="text-xs text-gray-400 truncate">
                    {task.slug}
                  </p>
                )}
              </div>

              {/* Status */}
              <Badge variant={task.status} showDot>
                {task.status.replace("_", " ")}
              </Badge>

              {/* Priority */}
              <Badge variant={task.priority}>
                {task.priority}
              </Badge>

              {/* Routine */}
              {task.routine_id && routines && (() => {
                const pl = routines.find((p) => p.id === task.routine_id);
                return pl ? (
                  <span className="hidden md:block text-xs text-gray-400 dark:text-gray-500 truncate max-w-[100px]">
                    {pl.name}
                  </span>
                ) : null;
              })()}

              {/* Complexity */}
              {task.complexity !== null && (
                <span className="hidden sm:block text-xs text-gray-400 w-16 text-right">
                  {complexityLabel(task.complexity)}
                </span>
              )}

              {/* Chevron */}
              <svg
                className="h-4 w-4 shrink-0 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>

    <Modal
      open={createModalOpen}
      onClose={() => { setCreateModalOpen(false); setCreateError(null); }}
      title="Create Task"
    >
      <form
        onSubmit={(e) => { e.preventDefault(); handleCreateTask(); }}
        className="space-y-4"
      >
        {createError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            {createError}
          </div>
        )}
        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Title <span className="text-flag-red-500">*</span>
          </label>
          <input
            id="task-title"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs placeholder:text-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            disabled={creating}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <textarea
            id="task-description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Describe the task..."
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs placeholder:text-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 resize-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            disabled={creating}
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => { setCreateModalOpen(false); setCreateError(null); }}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={creating || !newTitle.trim()}>
            {creating ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </form>
    </Modal>
    </>
  );
}
