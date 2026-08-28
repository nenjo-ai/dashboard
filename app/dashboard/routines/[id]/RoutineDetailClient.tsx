"use client";

import { Activity, ListTodo, Workflow } from "lucide-react";

import {
  useAgents,
  useCouncils,
  useRoutine,
  useRoutineExecutions,
  useTabParam,
  useTasks,
} from "@/lib/hooks";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { TaskList } from "@/components/project/TaskList";
import { RoutineEditor } from "@/components/routine/RoutineEditor";
import { RoutineMasthead } from "@/components/routine/RoutineMasthead";
import { TaskExecutionHistory } from "@/components/tasks/TaskExecutionHistory";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";

const ROUTINE_TABS = ["workflow", "activity", "tasks"] as const;
type RoutineTab = (typeof ROUTINE_TABS)[number];

export function RoutineDetailClient({ routineRef }: { routineRef: string }) {
  const mobile = useIsMobileViewport();
  const [activeTab, setActiveTab] = useTabParam<RoutineTab>("workflow", ROUTINE_TABS);
  const { routine, isLoading, isError, mutate: mutateRoutine } = useRoutine(routineRef);
  const { agents, isLoading: agentsLoading } = useAgents();
  const { councils } = useCouncils();
  const { tasks, isLoading: tasksLoading, isError: tasksError, mutate: mutateTasks } = useTasks({ routine_id: routineRef });
  const {
    executions,
    isLoading: executionsLoading,
    isError: executionsError,
    mutate: mutateExecutions,
  } = useRoutineExecutions(routineRef);

  if (isLoading) {
    const loading = <LoadingStatus className="min-h-72" description="Gathering workflow structure, assigned tasks, and recent runs." label="Loading routine" />;
    return mobile
      ? <MobilePageShell backHref="/dashboard/routines" backLabel="Routines" title="Routine">{loading}</MobilePageShell>
      : <><TopBar title="Routines" /><PageContent>{loading}</PageContent></>;
  }

  if (isError || !routine) {
    const missing = <EmptyState description="This routine may have been removed, or the workspace could not load it." title="Routine unavailable" tone="error" />;
    return mobile
      ? <MobilePageShell backHref="/dashboard/routines" backLabel="Routines" title="Routine">{missing}</MobilePageShell>
      : <><TopBar title="Routines" /><PageContent>{missing}</PageContent></>;
  }

  const tabs = [
    { id: "workflow", label: "Workflow", count: routine.steps.length, icon: <Workflow className="h-4 w-4" aria-hidden="true" /> },
    { id: "activity", label: "Activity", count: executions?.length ?? 0, icon: <Activity className="h-4 w-4" aria-hidden="true" /> },
    { id: "tasks", label: "Tasks", count: tasks?.length ?? 0, icon: <ListTodo className="h-4 w-4" aria-hidden="true" /> },
  ];

  const body = (
    <div className="space-y-5 md:space-y-6">
      <div className="hidden md:block">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Routines", href: "/dashboard/routines" }, { label: routine.name }]} />
      </div>

      <RoutineMasthead routine={routine} onUpdated={() => void mutateRoutine()} />
      <Tabs
        activeTab={activeTab}
        indicatorAnimation="slide"
        layoutId="routine-detail-tab"
        mobileVariant="scroll"
        onChange={(id) => setActiveTab(id as RoutineTab)}
        tabs={tabs}
      />

      <div className="min-h-[32rem]">
        {activeTab === "workflow" ? (
          agentsLoading ? (
            <LoadingStatus className="min-h-[34rem]" description="Preparing agents, roles, and the workflow canvas." label="Loading workflow editor" />
          ) : (
            <section aria-label="Workflow editor" className="theme-surface theme-border h-[calc(100vh-19rem)] min-h-[34rem] max-h-[48rem] overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <RoutineEditor
                agents={agents ?? []}
                councils={councils}
                onSaved={() => void mutateRoutine()}
                routine={routine}
              />
            </section>
          )
        ) : null}

        {activeTab === "activity" ? (
          <TaskExecutionHistory
            emptyDescription="Run an assigned task to see its live agent trace and completed execution record here."
            executions={executions}
            isError={executionsError}
            isLoading={executionsLoading}
            onRefresh={() => {
              void mutateExecutions();
              void mutateTasks();
            }}
            title="Routine activity"
          />
        ) : null}

        {activeTab === "tasks" ? (
          <TaskList
            description="Tasks that use this routine as their execution target."
            emptyMessage="Create a task and select this routine as its execution target."
            heading="Assigned tasks"
            isError={tasksError}
            isLoading={tasksLoading}
            onDeleted={() => void mutateTasks()}
            tasks={tasks}
          />
        ) : null}
      </div>
    </div>
  );

  return mobile
    ? <MobilePageShell backHref="/dashboard/routines" backLabel="Routines" title={routine.name}>{body}</MobilePageShell>
    : <><TopBar title="Routines" /><PageContent>{body}</PageContent></>;
}
