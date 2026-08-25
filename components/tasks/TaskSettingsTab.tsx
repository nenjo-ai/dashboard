"use client";

import type { RefObject } from "react";
import { Trash2 } from "lucide-react";

import type { TaskDispatch } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TaskScheduleEditor, type TaskScheduleEditorHandle, type TaskScheduleEditorState } from "./TaskScheduleEditor";

export function TaskSettingsTab({ taskId, mode, state, activeRun, deleting, scheduleEditorRef, onModeChange, onScheduleChanged, onStateChange, onDelete }: {
  taskId: string;
  mode: TaskDispatch["mode"];
  state?: "queued" | "paused" | "running";
  activeRun: boolean;
  deleting: boolean;
  scheduleEditorRef: RefObject<TaskScheduleEditorHandle | null>;
  onModeChange: (mode: TaskDispatch["mode"]) => void;
  onScheduleChanged: () => void;
  onStateChange: (state: TaskScheduleEditorState) => void;
  onDelete: () => void;
}) {
  return <div className="space-y-5">
    <section className="theme-surface theme-border rounded-2xl border p-4 sm:p-6">
      <div className="mb-5"><h2 className="theme-text text-base font-semibold">Schedule and dispatch</h2><p className="theme-text-muted mt-1 text-sm">Choose whether this task runs on demand or follows a recurring schedule.</p></div>
      <TaskScheduleEditor taskId={taskId} mode={mode} state={state} onModeChange={onModeChange} onScheduleChanged={onScheduleChanged} onStateChange={onStateChange} ref={scheduleEditorRef} />
    </section>
    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-6 dark:border-red-900/60 dark:bg-red-950/15">
      <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Danger zone</h2>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="theme-text-muted max-w-xl text-sm">Delete this task, its schedule, and attachments. Completed execution history remains available for auditing.</p><Button disabled={deleting || activeRun} onClick={onDelete} variant="danger"><Trash2 className="h-4 w-4" />Delete task</Button></div>
      {activeRun ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">Finish or cancel the active run before deleting.</p> : null}
    </section>
  </div>;
}
