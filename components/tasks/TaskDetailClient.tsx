"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, FileOutput, LayoutList, Settings2 } from "lucide-react";

import { cancelTaskExecution, deleteTask, executeTask, retryTaskExecution, updateTask } from "@/lib/api";
import {
  useAgents,
  useProjects,
  useRoutines,
  useTabParam,
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
import { useSafeRouter } from "@/lib/safeRouter";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import { EXECUTION_EVENT_TYPE, ExecutionEventKind, executionRealtimeEventIsTerminal } from "@/lib/executionEvents";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { useArtifactAttachments } from "@/components/artifacts/ArtifactAttachmentComposer";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";
import { TaskActiveRun } from "./TaskActiveRun";
import { TaskAttachments } from "./TaskAttachments";
import { TaskExecutionHistory } from "./TaskExecutionHistory";
import { TaskMasthead } from "./TaskMasthead";
import { TaskOverviewTab } from "./TaskOverviewTab";
import type { TaskScheduleEditorHandle, TaskScheduleEditorState } from "./TaskScheduleEditor";

const TaskSettingsTab = dynamic(
  () => import("./TaskSettingsTab").then((module) => module.TaskSettingsTab),
  { loading: () => <LoadingStatus className="min-h-[28rem]" label="Loading schedule settings" description="Preparing recurrence and lifecycle controls." /> },
);

const TABS = [
  { id: "overview", label: "Overview", icon: <LayoutList className="h-4 w-4" /> },
  { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { id: "outputs", label: "Outputs", icon: <FileOutput className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="h-4 w-4" /> },
] as const;
type TaskTabId = (typeof TABS)[number]["id"];

/** Lifecycle-driven editor and execution workspace for one organization task. */
export function TaskDetailClient({ taskId }: { taskId: string }) {
  const router = useSafeRouter();
  const mobile = useIsMobileViewport();
  const [activeTab, setActiveTab] = useTabParam<TaskTabId>("overview", ["overview", "activity", "outputs", "settings"] as const);
  const { task, isLoading, isError, mutate: mutateTask } = useTask(taskId);
  const { executions, isLoading: executionsLoading, isError: executionsError, mutate: mutateExecutions } = useTaskExecutions(taskId);
  const { attachments, isLoading: attachmentsLoading, isError: attachmentsError, mutate: mutateAttachments } = useTaskAttachments(taskId);
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
  const [scheduleEditorState, setScheduleEditorState] = useState<TaskScheduleEditorState>({ dirty: false, canSave: true });
  const [scheduleEditorKey, setScheduleEditorKey] = useState(0);
  const [settingsVisited, setSettingsVisited] = useState(activeTab === "settings");
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingArtifactIds, setExistingArtifactIds] = useState<string[]>([]);
  const artifactAttachments = useArtifactAttachments(Math.max(0, 16 - existingArtifactIds.length));
  const clearArtifactAttachments = artifactAttachments.clear;

  const hydrateDraft = useCallback(() => {
    if (!task) return;
    setTitle(task.title);
    setInstructions(task.instructions ?? "");
    setStatusId(task.status.id);
    setPriority(task.priority);
    setProjectId(task.project_id ?? "");
    setTarget(task.execution_target ? `${task.execution_target.type}:${task.execution_target.id}` : "");
    setDispatchMode(task.dispatch.mode);
    setLabelIds(task.labels.map((label) => label.id));
    setExistingArtifactIds(task.artifact_ids ?? []);
    clearArtifactAttachments();
  }, [clearArtifactAttachments, task]);

  useEffect(() => { hydrateDraft(); }, [hydrateDraft]);
  useEffect(() => { if (activeTab === "settings") setSettingsVisited(true); }, [activeTab]);

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
    void subscribeExecutionRealtime((event) => {
      if (event.data.type === "task.execution_state") void mutateExecutions();
      if (executionRealtimeEventIsTerminal(event.data)) {
        terminalRefreshTimer ??= setTimeout(() => {
          terminalRefreshTimer = null;
          void Promise.all([mutateExecutions(), mutateTask()]);
        }, 350);
      }
      if (event.data.type === EXECUTION_EVENT_TYPE) {
        const executionEvent = typeof event.data.event === "object" && event.data.event !== null && !Array.isArray(event.data.event)
          ? event.data.event as Record<string, unknown> : null;
        if (executionEvent?.kind === ExecutionEventKind.TaskArtifacts) void mutateAttachments();
      }
    }, latestExecutionId, controller.signal).catch((cause) => {
      if (!controller.signal.aborted) console.error("Task execution realtime sync failed:", cause);
    });
    return () => { controller.abort(); if (terminalRefreshTimer) clearTimeout(terminalRefreshTimer); };
  }, [latestExecutionId, mutateAttachments, mutateExecutions, mutateTask]);

  if (isLoading) {
    const content = <LoadingStatus className="min-h-72" label="Loading task" description="Gathering the brief, execution state, and outputs." />;
    return mobile ? <MobilePageShell title="Task" backHref="/dashboard/tasks">{content}</MobilePageShell> : <><TopBar title="Tasks" /><PageContent>{content}</PageContent></>;
  }
  if (isError || !task) {
    const content = <EmptyState title="Task unavailable" description="This task may have been removed, or the workspace could not load it." tone="error" />;
    return mobile ? <MobilePageShell title="Task" backHref="/dashboard/tasks">{content}</MobilePageShell> : <><TopBar title="Tasks" /><PageContent>{content}</PageContent></>;
  }

  const activeRun = executions?.find((run) => taskExecutionIsActive(run.status));
  const historicalRuns = executions?.filter((run) => run.id !== activeRun?.id);
  const selectedStatus = statuses?.find((status) => status.id === statusId) ?? task.status;
  const runnable = taskCategoryIsRunnable(selectedStatus.category);
  const taskDirty = taskEditorHasChanges(task, { title, instructions, statusId, priority, projectId, target, labelIds });
  const artifactIds = [...existingArtifactIds, ...artifactAttachments.artifactIds];
  const artifactsDirty = artifactIds.length !== (task.artifact_ids?.length ?? 0) || artifactIds.some((artifactId, index) => artifactId !== task.artifact_ids?.[index]);
  const editorDirty = taskDirty || artifactsDirty;
  const dirty = editorDirty || scheduleEditorState.dirty;
  const targetName = (() => {
    if (!target) return "";
    const [type, id] = target.split(":", 2);
    return type === "agent" ? agents?.find((agent) => agent.id === id)?.name ?? "Agent" : routines?.find((routine) => routine.id === id)?.name ?? "Routine";
  })();

  const parseTarget = (): TaskExecutionTarget | null => {
    if (!target) return null;
    const [type, id] = target.split(":", 2);
    return type === "agent" ? { type, id } : { type: "routine", id };
  };
  const persistEditor = async () => {
    const updated = await updateTask(taskId, {
      title: title.trim(), instructions, status_id: statusId, priority, project_id: projectId || null,
      execution_target: parseTarget(), label_ids: labelIds, artifact_ids: artifactIds,
    }, task);
    setExistingArtifactIds(updated.artifact_ids ?? []);
    artifactAttachments.clear();
    await mutateTask(updated, { revalidate: false });
  };
  const persistChanges = async () => {
    const saveScheduleChanges = scheduleEditorRef.current?.saveChanges;
    const switchingToManual = task.dispatch.mode === "scheduled" && dispatchMode === "manual";
    if (switchingToManual) await saveScheduleChanges?.();
    if (editorDirty) await persistEditor();
    if (!switchingToManual) await saveScheduleChanges?.();
  };
  const save = async () => {
    if (!dirty || !artifactAttachments.isReady) return;
    setPending(true); setError(null);
    try { await persistChanges(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to save task"); }
    finally { setPending(false); }
  };
  const run = async () => {
    setPending(true); setError(null);
    try {
      await persistChanges();
      const execution = await executeTask(taskId);
      await mutateExecutions((current) => [execution, ...(current ?? []).filter((run) => run.id !== execution.id)], { revalidate: false });
      setActiveTab("activity");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to start task"); }
    finally { setPending(false); }
  };
  const discard = () => {
    hydrateDraft();
    setScheduleEditorState({ dirty: false, canSave: true });
    setScheduleEditorKey((current) => current + 1);
    setError(null);
  };
  const remove = async () => {
    setDeleting(true); setError(null);
    try { await deleteTask(taskId); router.replace("/dashboard/tasks"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to delete task"); setDeleteOpen(false); }
    finally { setDeleting(false); }
  };
  const cancelRun = async () => {
    if (!activeRun) return;
    setCancelling(true); setError(null);
    try {
      const updatedRun = await cancelTaskExecution(activeRun.id);
      await mutateExecutions((current) => current?.map((run) => run.id === updatedRun.id ? updatedRun : run) ?? [updatedRun], { revalidate: false });
      setCancelOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to cancel run"); }
    finally { setCancelling(false); }
  };

  const body = <div className="space-y-5 md:space-y-6">
    <div className="hidden md:block"><Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasks", href: "/dashboard/tasks" }, { label: task.identifier }]} /></div>
    <TaskMasthead task={task} draftTitle={title} targetName={targetName} activeRun={activeRun} dispatchMode={dispatchMode} dirty={dirty} canRun={Boolean(target && runnable && title.trim() && artifactAttachments.isReady)} pending={pending} cancelling={cancelling} onRun={() => void run()} onCancel={() => setCancelOpen(true)} />
    <Tabs tabs={[...TABS]} activeTab={activeTab} onChange={(id) => setActiveTab(id as TaskTabId)} layoutId="task-detail-tab" indicatorAnimation="slide" mobileVariant="scroll" />
    <div className="min-h-[32rem]">
      {activeTab === "overview" ? <TaskOverviewTab title={title} setTitle={setTitle} instructions={instructions} setInstructions={setInstructions} statusId={statusId} setStatusId={setStatusId} priority={priority} setPriority={setPriority} projectId={projectId} setProjectId={setProjectId} target={target} setTarget={setTarget} labelIds={labelIds} setLabelIds={setLabelIds} dispatchMode={dispatchMode} statuses={statuses} projects={projects} agents={agents} routines={routines} pending={pending} existingArtifactIds={existingArtifactIds} setExistingArtifactIds={setExistingArtifactIds} artifactAttachments={artifactAttachments} /> : null}
      {activeTab === "activity" ? <div className="space-y-4">
        {activeRun ? <TaskActiveRun run={activeRun} targetName={targetName} cancelling={cancelling} onCancel={() => setCancelOpen(true)} onRefresh={() => void Promise.all([mutateExecutions(), mutateTask()])} /> : null}
        <TaskExecutionHistory executions={historicalRuns} isLoading={executionsLoading} isError={executionsError} onRefresh={() => void Promise.all([mutateExecutions(), mutateTask()])} onRetry={async (executionId) => { await retryTaskExecution(executionId); await mutateExecutions(); }} title={activeRun ? "Previous runs" : "Run history"} emptyDescription="Run this task to see its live agent trace and completed execution record here." />
      </div> : null}
      {activeTab === "outputs" ? <section className="theme-surface theme-border rounded-2xl border p-4 sm:p-6"><div className="mb-5"><h2 className="theme-text text-base font-semibold">Outputs</h2><p className="theme-text-muted mt-1 text-sm">Encrypted final answers and handoffs produced by completed runs.</p></div><TaskAttachments taskId={taskId} attachments={attachments} isLoading={attachmentsLoading} isError={attachmentsError} /></section> : null}
      {settingsVisited ? <div className={activeTab === "settings" ? "block" : "hidden"}><TaskSettingsTab key={scheduleEditorKey} taskId={taskId} mode={dispatchMode} state={task.dispatch.mode === "scheduled" ? task.dispatch.state : undefined} activeRun={Boolean(activeRun)} deleting={deleting} scheduleEditorRef={scheduleEditorRef} onModeChange={setDispatchMode} onScheduleChanged={() => void mutateTask()} onStateChange={setScheduleEditorState} onDelete={() => setDeleteOpen(true)} /></div> : null}
    </div>
    {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300" role="alert">{error}</p> : null}
    {dirty ? <div className="theme-surface-elevated theme-border sticky bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] z-20 flex flex-col gap-3 rounded-2xl border p-3 shadow-xl sm:flex-row sm:items-center sm:justify-between md:bottom-4"><div><p className="theme-text text-sm font-medium">Unsaved changes</p><p className="theme-text-muted text-xs">Save before leaving to keep this task configuration.</p></div><div className="flex gap-2"><Button className="flex-1 sm:flex-none" disabled={pending} onClick={discard} variant="ghost">Discard</Button><Button className="flex-1 sm:flex-none" disabled={pending || !title.trim() || !scheduleEditorState.canSave || !artifactAttachments.isReady} isLoading={pending} onClick={() => void save()}>Save changes</Button></div></div> : null}
  </div>;

  return <>
    {mobile ? <MobilePageShell title={task.identifier} backHref="/dashboard/tasks" backLabel="Tasks">{body}</MobilePageShell> : <><TopBar title="Tasks" /><PageContent>{body}</PageContent></>}
    <ConfirmDialog confirmLabel="Cancel run" loading={cancelling} message={`Cancel the ${activeRun?.status ?? "active"} run? Queued work will be removed from the worker inbox and running work will be stopped.`} onClose={() => setCancelOpen(false)} onConfirm={cancelRun} open={cancelOpen && Boolean(activeRun)} title="Cancel active run" variant="danger" />
    <ConfirmDialog confirmLabel="Delete task" loading={deleting} message={`Delete ${task.identifier} “${task.title}”? Its schedule and attachments will be removed. Completed execution history remains available for auditing.`} onClose={() => setDeleteOpen(false)} onConfirm={remove} open={deleteOpen} title="Delete task" variant="danger" />
  </>;
}
