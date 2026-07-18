"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/lib/api";
import type { RoutineSummary, Task } from "@/lib/types";
import { scheduledTaskStateLabel } from "@/lib/taskLifecycle";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

interface TaskListProps {
  tasks: Task[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onDeleted?: () => void;
  projectId?: string;
  routines?: RoutineSummary[];
  heading?: string;
  description?: string;
  emptyMessage?: string;
  showCreate?: boolean;
  statusDisplay?: "workflow" | "scheduled";
}

function TaskRowsSkeleton() {
  return (
    <div className="divide-y theme-border">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex gap-4 px-4 py-4" key={index}>
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Shared organization/project task list. Rows always open the canonical task page. */
export function TaskList({
  tasks,
  isLoading,
  isError,
  onDeleted,
  projectId,
  heading,
  description,
  emptyMessage = "No tasks match these filters.",
  showCreate = true,
  statusDisplay = "workflow",
}: TaskListProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const task = await createTask({
        project_id: projectId ?? null,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
      });
      setCreating(false);
      setTitle("");
      setInstructions("");
      onDeleted?.();
      router.push(`/dashboard/tasks/${task.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create task");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="theme-surface theme-border overflow-hidden rounded-xl border">
      <div className="theme-border flex items-center justify-between border-b px-4 py-3">
        <div>
          {heading ? <h2 className="theme-text text-sm font-semibold">{heading}</h2> : null}
          <p className="theme-text-muted mt-0.5 text-xs">
            {description ?? `${tasks?.length ?? 0} tasks`}
            {description ? ` · ${tasks?.length ?? 0} tasks` : null}
          </p>
        </div>
        {showCreate ? <Button size="sm" onClick={() => setCreating(true)}>Create task</Button> : null}
      </div>
      {isLoading ? <TaskRowsSkeleton /> : isError ? (
        <p className="theme-text-muted p-8 text-center text-sm">Failed to load tasks.</p>
      ) : !tasks?.length ? (
        <p className="theme-text-muted p-10 text-center text-sm">{emptyMessage}</p>
      ) : (
        <div className="theme-border divide-y [content-visibility:auto]">
          {tasks.map((task) => (
            <button
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:[background:var(--app-hover)]"
              key={task.id}
              onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
              type="button"
            >
              <span className="theme-text-muted w-14 shrink-0 text-xs font-semibold">{task.identifier}</span>
              <div className="min-w-0 flex-1">
                <p className="theme-text truncate text-sm font-medium">{task.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {task.labels.map((label) => (
                    <span className="rounded-full px-2 py-0.5 text-[10px]" key={label.id} style={{ backgroundColor: `${label.color}22`, color: label.color }}>
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
              {statusDisplay === "scheduled" ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${task.dispatch.mode === "scheduled" && task.dispatch.state === "running" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                  {scheduledTaskStateLabel(task)}
                </span>
              ) : (
                <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: `${task.status.color}22`, color: task.status.color }}>
                  {task.status.name}
                </span>
              )}
              <span className="theme-text-muted hidden w-16 text-right text-xs capitalize sm:block">{task.priority}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create task">
        <div className="space-y-4 p-1">
          <label className="block text-sm theme-text">Title
            <input className="theme-surface theme-border mt-1 w-full rounded-lg border px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block text-sm theme-text">Instructions
            <textarea className="theme-surface theme-border mt-1 min-h-28 w-full rounded-lg border px-3 py-2" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={pending || !title.trim()} onClick={submit}>{pending ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
