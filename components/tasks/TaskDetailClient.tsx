"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Play, Square, Trash2 } from "lucide-react";

import { cancelTaskExecution, deleteTask, executeTask, retryTaskExecution, updateTask } from "@/lib/api";
import {
  useAgents,
  useProjects,
  useRoutines,
  useTask,
  useTaskAttachments,
  useTaskExecutions,
  useTaskStatuses,
} from "@/lib/hooks";
import type { TaskDispatch, TaskExecutionTarget, TaskPriority } from "@/lib/types";
import {
  executionStatusMayChangeTask,
  taskCategoryIsRunnable,
  taskEditorHasChanges,
  taskExecutionIsActive,
} from "@/lib/taskLifecycle";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSafeRouter } from "@/lib/safeRouter";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import { EXECUTION_EVENT_TYPE, ExecutionEventKind, executionRealtimeEventIsTerminal } from "@/lib/executionEvents";
import { TaskAttachments } from "./TaskAttachments";
import { InlineTaskLabels } from "./InlineTaskLabels";
import {
  TaskScheduleEditor,
  type TaskScheduleEditorHandle,
  type TaskScheduleEditorState,
} from "./TaskScheduleEditor";

const TaskRunActivity = dynamic(
  () => import("./TaskRunActivity").then((module) => module.TaskRunActivity),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
);
const fieldClass = "theme-surface theme-border w-full rounded-lg border px-3 py-2 text-sm";

/** Dedicated editor and execution workspace for one organization task. */
export function TaskDetailClient({ taskId }: { taskId: string }) {
  const router = useSafeRouter();
  const { task, isLoading, isError, mutate: mutateTask } = useTask(taskId);
  const { executions, mutate: mutateExecutions } = useTaskExecutions(taskId);
  const {
    attachments,
    isLoading: attachmentsLoading,
    isError: attachmentsError,
    mutate: mutateAttachments,
  } = useTaskAttachments(taskId);
  const { statuses } = useTaskStatuses();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const { routines } = useRoutines();
  const scheduleEditorRef = useRef<TaskScheduleEditorHandle>(null);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [statusId, setStatusId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState("");
  const [target, setTarget] = useState("");
  const [dispatchMode, setDispatchMode] = useState<TaskDispatch["mode"]>("manual");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [scheduleEditorState, setScheduleEditorState] = useState<TaskScheduleEditorState>({
    dirty: false,
    canSave: true,
  });
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setInstructions(task.instructions ?? "");
    setStatusId(task.status.id);
    setPriority(task.priority);
    setProjectId(task.project_id ?? "");
    setTarget(task.execution_target ? `${task.execution_target.type}:${task.execution_target.id}` : "");
    setDispatchMode(task.dispatch.mode);
    setLabelIds(task.labels.map((label) => label.id));
  }, [task]);

  const latestRunStatus = executions?.[0]?.status;
  useEffect(() => {
    if (!latestRunStatus || !executionStatusMayChangeTask(latestRunStatus)) return;
    void mutateTask();
  }, [latestRunStatus, mutateTask]);

  const latestExecutionId = executions?.[0]?.id;
  useEffect(() => {
    if (!latestExecutionId) return;
    const controller = new AbortController();
    let terminalRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    void subscribeExecutionRealtime(
      (event) => {
        if (event.data.type === "task.execution_state") {
          void mutateExecutions();
        }
        if (executionRealtimeEventIsTerminal(event.data)) {
          terminalRefreshTimer ??= setTimeout(() => {
            terminalRefreshTimer = null;
            void Promise.all([mutateExecutions(), mutateTask()]);
          }, 350);
        }
        if (event.data.type === EXECUTION_EVENT_TYPE) {
          const executionEvent = typeof event.data.event === "object"
            && event.data.event !== null
            && !Array.isArray(event.data.event)
            ? event.data.event as Record<string, unknown>
            : null;
          if (executionEvent?.kind === ExecutionEventKind.TaskArtifacts) {
            void mutateAttachments();
          }
        }
      },
      latestExecutionId,
      controller.signal,
    ).catch((cause) => {
      if (!controller.signal.aborted) {
        console.error("Task execution realtime sync failed:", cause);
      }
    });

    return () => {
      controller.abort();
      if (terminalRefreshTimer) clearTimeout(terminalRefreshTimer);
    };
  }, [latestExecutionId, mutateAttachments, mutateExecutions, mutateTask]);

  const refreshScheduleState = useCallback(() => {
    void mutateTask();
  }, [mutateTask]);

  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  if (isError || !task) return <div className="p-8 text-red-500">Task not found or unavailable.</div>;

  const activeRun = executions?.find((run) => taskExecutionIsActive(run.status));
  const selectedStatus = statuses?.find((status) => status.id === statusId) ?? task.status;
  const runnable = taskCategoryIsRunnable(selectedStatus.category);
  const taskDirty = taskEditorHasChanges(task, {
    title,
    instructions,
    statusId,
    priority,
    projectId,
    target,
    labelIds,
  });
  const parseTarget = (): TaskExecutionTarget | null => {
    if (!target) return null;
    const [type, id] = target.split(":", 2);
    return type === "agent" ? { type, id } : { type: "routine", id };
  };

  const persistEditor = async () => {
    const updated = await updateTask(taskId, {
      title: title.trim(), instructions, status_id: statusId, priority,
      project_id: projectId || null,
      execution_target: parseTarget(), label_ids: labelIds,
    }, task);
    await mutateTask(updated, { revalidate: false });
    return updated;
  };

  const persistChanges = async () => {
    const saveScheduleChanges = scheduleEditorRef.current?.saveChanges;
    const switchingToManual = task.dispatch.mode === "scheduled" && dispatchMode === "manual";
    if (switchingToManual) await saveScheduleChanges?.();
    if (taskDirty) await persistEditor();
    if (!switchingToManual) await saveScheduleChanges?.();
  };

  const save = async () => {
    if (!taskDirty && !scheduleEditorState.dirty) return;
    setPending(true);
    setError(null);
    try {
      await persistChanges();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save task");
    } finally {
      setPending(false);
    }
  };

  const run = async () => {
    setPending(true); setError(null);
    try {
      await persistChanges();
      const execution = await executeTask(taskId);
      await mutateExecutions(
        (current) => [execution, ...(current ?? []).filter((run) => run.id !== execution.id)],
        { revalidate: false },
      );
      setSelectedRunId(execution.id);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to start task"); }
    finally { setPending(false); }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteTask(taskId);
      router.replace("/dashboard/tasks");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete task");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const cancelRun = async () => {
    if (!activeRun) return;
    setCancelling(true);
    setError(null);
    try {
      const updatedRun = await cancelTaskExecution(activeRun.id);
      await mutateExecutions(
        (current) => current?.map((run) => run.id === updatedRun.id ? updatedRun : run) ?? [updatedRun],
        { revalidate: false },
      );
      setCancelOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to cancel run");
    } finally {
      setCancelling(false);
    }
  };

  return <>
    <TopBar title={`${task.identifier} · ${task.title}`} />
    <PageContent>
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="theme-surface theme-border space-y-3 rounded-xl border p-4 sm:p-5">
          <div>
            <h1 className="theme-text font-semibold">Task details</h1>
            <p className="theme-text-muted mt-1 text-sm">Configure the work, target, and dispatch behavior.</p>
          </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="theme-text text-sm sm:col-span-2">Title<input className={`${fieldClass} mt-1`} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="theme-text text-sm sm:col-span-2">Instructions<textarea className={`${fieldClass} mt-1 min-h-32`} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
              {dispatchMode === "manual" ? <label className="theme-text text-sm">Status<select className={`${fieldClass} mt-1`} value={statusId} onChange={(event) => setStatusId(event.target.value)}>{statuses?.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label> : null}
              <label className="theme-text text-sm">Priority<select className={`${fieldClass} mt-1`} value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{["low","medium","high","critical"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="theme-text text-sm">Project<select className={`${fieldClass} mt-1`} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="theme-text text-sm">Dispatch to<select className={`${fieldClass} mt-1`} value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose an agent</option><optgroup label="Agents">{agents?.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>)}</optgroup><optgroup label="Routine workflows">{routines?.map((routine) => <option key={routine.id} value={`routine:${routine.id}`}>{routine.name}</option>)}</optgroup></select></label>
              <div><p className="theme-text mb-2 text-sm">Labels</p><InlineTaskLabels disabled={pending} onChange={setLabelIds} selectedIds={labelIds} /></div>
            </div>
            <TaskScheduleEditor
              mode={dispatchMode}
              onModeChange={setDispatchMode}
              onScheduleChanged={refreshScheduleState}
              onStateChange={setScheduleEditorState}
              ref={scheduleEditorRef}
              state={task.dispatch.mode === "scheduled" ? task.dispatch.state : undefined}
              taskId={taskId}
            />
            {!runnable ? <p className="text-sm text-amber-600">Move this task to Todo before dispatching it. Backlog, completed, and canceled tasks are not runnable.</p> : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <Button
                  disabled={pending || (!taskDirty && !scheduleEditorState.dirty) || !title.trim() || !scheduleEditorState.canSave}
                  isLoading={pending}
                  onClick={save}
                >
                  Save
                </Button>
                {dispatchMode === "manual" ? <Button disabled={pending || Boolean(activeRun) || !target || !runnable || !title.trim()} onClick={run}><Play size={14} /> Run</Button> : null}
                {activeRun ? <Button disabled={cancelling} onClick={() => setCancelOpen(true)} variant="danger"><Square size={13} /> Cancel run</Button> : null}
              </div>
              <div className="flex items-center gap-2">
                {activeRun ? <span className="theme-text-muted text-xs">Finish the active run before deleting.</span> : null}
                <Button
                  disabled={pending || deleting || Boolean(activeRun)}
                  onClick={() => setDeleteOpen(true)}
                  title={activeRun ? "A task cannot be deleted while an execution is active" : "Delete task"}
                  variant="danger"
                >
                  <Trash2 size={15} /> Delete
                </Button>
              </div>
            </div>
        </section>

        <section className="theme-surface theme-border rounded-xl border p-5">
          <h2 className="theme-text mb-3 font-semibold">Run history</h2>
          {!executions?.length ? (
            <p className="theme-text-muted text-sm">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {executions.map((execution) => {
                const agentName = agents?.find((agent) => agent.id === execution.agent_id)?.name;
                const routineName = routines?.find((routine) => routine.id === execution.routine_id)?.name;
                const expanded = selectedRunId === execution.id;
                return (
                  <article className="theme-border overflow-hidden rounded-lg border" key={execution.id}>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                        onClick={() => setSelectedRunId((current) => current === execution.id ? null : execution.id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="theme-text block truncate text-sm capitalize">
                            {agentName ?? routineName ?? "Unknown target"} · {execution.status}
                          </span>
                          <span className="theme-text-muted text-xs">
                            {execution.trigger ?? "legacy"} · {new Date(execution.created_at).toLocaleString()}
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`theme-text-muted shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                          size={18}
                        />
                      </button>
                      {execution.status === "failed" ? (
                        <Button
                          onClick={async () => {
                            await retryTaskExecution(execution.id);
                            await mutateExecutions();
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          Retry
                        </Button>
                      ) : null}
                    </div>
                    {expanded ? (
                      <div className="theme-border border-t p-3">
                        <TaskRunActivity
                          executionId={execution.id}
                          key={execution.id}
                          status={execution.status}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="theme-surface theme-border rounded-xl border p-5">
          <h2 className="theme-text mb-4 font-semibold">Attachments</h2>
          <TaskAttachments
            attachments={attachments}
            isError={attachmentsError}
            isLoading={attachmentsLoading}
            taskId={taskId}
          />
        </section>
      </div>
    </PageContent>
    <ConfirmDialog
      confirmLabel="Cancel run"
      loading={cancelling}
      message={`Cancel the ${activeRun?.status ?? "active"} run? Queued work will be removed from the worker inbox and running work will be stopped.`}
      onClose={() => setCancelOpen(false)}
      onConfirm={cancelRun}
      open={cancelOpen && Boolean(activeRun)}
      title="Cancel active run"
      variant="danger"
    />
    <ConfirmDialog
      confirmLabel="Delete task"
      loading={deleting}
      message={`Delete ${task.identifier} “${task.title}”? Its schedule and attachments will be removed. Completed execution history remains available for auditing.`}
      onClose={() => setDeleteOpen(false)}
      onConfirm={remove}
      open={deleteOpen}
      title="Delete task"
      variant="danger"
    />
  </>;
}
