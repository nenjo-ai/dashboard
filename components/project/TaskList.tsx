"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, CircleDot, ListTodo, Plus } from "lucide-react";

import type { RoutineSummary, Task } from "@/lib/types";
import { scheduledTaskStateLabel } from "@/lib/taskLifecycle";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

const TaskCreateDialog = dynamic(
  () => import("@/components/tasks/TaskCreateDialog").then((module) => module.TaskCreateDialog),
  { ssr: false },
);

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
  return <div className="divide-y theme-border">{Array.from({ length: 5 }, (_, index) => (
    <div className="flex gap-4 px-4 py-4" key={index}>
      <Skeleton className="h-5 w-14" />
      <div className="flex-1 space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
      <Skeleton className="h-6 w-20" />
    </div>
  ))}</div>;
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
  emptyMessage = "No tasks match this view.",
  showCreate = true,
  statusDisplay = "workflow",
}: TaskListProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="theme-surface theme-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="theme-border flex items-center justify-between gap-4 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          {heading ? <h2 className="theme-text text-sm font-semibold">{heading}</h2> : null}
          <p className="theme-text-muted mt-0.5 truncate text-xs">
            {description ?? `${tasks?.length ?? 0} tasks`}
            {description ? ` · ${tasks?.length ?? 0} task${tasks?.length === 1 ? "" : "s"}` : null}
          </p>
        </div>
        {showCreate ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create task</Button> : null}
      </div>
      {isLoading ? <TaskRowsSkeleton /> : isError ? (
        <div className="px-6 py-10 text-center" role="status">
          <p className="theme-text text-sm font-medium">Tasks are temporarily unavailable</p>
          <p className="theme-text-muted mt-1 text-sm">The rest of this workspace is still available.</p>
          {onDeleted ? <Button className="mt-4" size="sm" variant="secondary" onClick={onDeleted}>Try again</Button> : null}
        </div>
      ) : !tasks?.length ? (
        <div className="px-6 py-10 text-center">
          <ListTodo className="theme-text-muted mx-auto h-5 w-5" aria-hidden="true" />
          <p className="theme-text mt-3 text-sm font-medium">No tasks in this view</p>
          <p className="theme-text-muted mx-auto mt-1 max-w-sm text-sm leading-6">{emptyMessage}</p>
        </div>
      ) : (
        <div className="theme-border divide-y">
          {tasks.map((task) => {
            const scheduled = task.dispatch.mode === "scheduled";
            const live = task.dispatch.mode === "scheduled" && task.dispatch.state === "running";
            return (
              <button
                className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors [content-visibility:auto] hover:[background:var(--app-hover)] sm:gap-4 sm:px-5"
                key={task.id}
                onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                type="button"
              >
                <span className="theme-text-muted hidden w-14 shrink-0 text-xs font-semibold sm:block">{task.identifier}</span>
                <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${scheduled ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "theme-surface-muted theme-text-muted"}`}>
                  {scheduled ? <CalendarClock className="h-4 w-4" /> : <ListTodo className="h-4 w-4" />}
                  {live ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 motion-safe:animate-pulse dark:border-gray-900" aria-label="Running" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="theme-text truncate text-sm font-medium">{task.title}</p>
                    <span className="theme-text-muted shrink-0 text-[11px] sm:hidden">{task.identifier}</span>
                  </div>
                  <div className="theme-text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span>{task.project_slug ?? "No project"}</span><span aria-hidden="true">·</span>
                    <span className="capitalize">{task.priority} priority</span><span aria-hidden="true">·</span>
                    <span>Updated {formatExecutionRelativeTime(task.updated_at)}</span>
                  </div>
                  {task.labels.length ? <div className="mt-2 hidden flex-wrap gap-1 sm:flex">{task.labels.slice(0, 3).map((label) => (
                    <span className="rounded-full px-2 py-0.5 text-[10px]" key={label.id} style={{ backgroundColor: `${label.color}22`, color: label.color }}>{label.name}</span>
                  ))}</div> : null}
                </div>
                <div className="hidden shrink-0 items-center gap-2 md:flex">
                  <span className="theme-surface-muted theme-text-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
                    {scheduled ? <CalendarClock className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                    {scheduled ? scheduledTaskStateLabel(task) : "Manual"}
                  </span>
                  {statusDisplay === "scheduled" ? null : <span className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: `${task.status.color}22`, color: task.status.color }}>{task.status.name}</span>}
                </div>
                <ChevronRight className="theme-text-muted h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      )}
      {creating ? <TaskCreateDialog initialProjectId={projectId} onClose={() => setCreating(false)} onCreated={onDeleted} open /> : null}
    </div>
  );
}
