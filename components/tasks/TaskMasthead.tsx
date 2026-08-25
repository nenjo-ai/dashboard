"use client";

import { CalendarClock, CircleDot, Play, Square } from "lucide-react";

import type { Task, TaskExecutionRun } from "@/lib/types";
import { scheduledTaskStateLabel } from "@/lib/taskLifecycle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function TaskMasthead({
  task,
  draftTitle,
  targetName,
  activeRun,
  dispatchMode,
  dirty,
  canRun,
  pending,
  cancelling,
  onRun,
  onCancel,
}: {
  task: Task;
  draftTitle: string;
  targetName: string;
  activeRun?: TaskExecutionRun;
  dispatchMode: Task["dispatch"]["mode"];
  dirty: boolean;
  canRun: boolean;
  pending: boolean;
  cancelling: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  const scheduled = dispatchMode === "scheduled";
  return (
    <section className="theme-surface theme-border relative overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-deep-space-blue-500/[0.07] blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
            {scheduled ? <CalendarClock className="h-5 w-5" /> : <CircleDot className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="theme-text truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{draftTitle || "Untitled task"}</h2>
              <code className="theme-surface-muted theme-border theme-text-muted rounded-md border px-2 py-0.5 text-[11px]">{task.identifier}</code>
            </div>
            <p className="theme-text-muted mt-2 text-sm leading-6">
              {targetName ? `Dispatched to ${targetName}` : "Choose an agent or routine before running this task."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: `${task.status.color}22`, color: task.status.color }}>{task.status.name}</span>
              <Badge variant={task.priority}>{task.priority}</Badge>
              <span className="theme-surface-muted theme-border theme-text-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
                {scheduled ? task.dispatch.mode === "scheduled" ? scheduledTaskStateLabel(task) : "Schedule pending" : "On demand"}
              </span>
              {activeRun ? <Badge variant={activeRun.status} showDot>{activeRun.status}</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {activeRun ? (
            <Button disabled={cancelling} onClick={onCancel} variant="secondary"><Square className="h-3.5 w-3.5" />Cancel run</Button>
          ) : !scheduled ? (
            <Button disabled={!canRun || pending} onClick={onRun}><Play className="h-4 w-4" />{dirty ? "Save & run" : "Run task"}</Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
