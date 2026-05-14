"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  useProject,
  useTasks,
  useExecutions,
  useRoutines,
  useDependencyGraph,
  useTabParam,
} from "@/lib/hooks";
import type { Task } from "@/lib/types";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { MobileProjectDetail } from "@/components/project/MobileProjectDetail";
import { Tabs } from "@/components/ui/Tabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

import { ProjectHeader } from "@/components/project/ProjectHeader";
import { TaskList } from "@/components/project/TaskList";
import { TaskDetailModal } from "@/components/project/TaskDetailModal";
import { ProjectContextTab } from "@/components/project/ProjectContextTab";
import { ProjectSettingsTab } from "@/components/project/ProjectSettingsTab";
import { ExecutionPanel } from "@/components/project/ExecutionPanel";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

const TABS = [
  {
    id: "tasks",
    label: "Tasks",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  {
    id: "context",
    label: "Context",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    id: "execution",
    label: "Execution",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
] as const;

type ProjectTabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const isMobileViewport = useIsMobileViewport();
  const params = useParams();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useTabParam<ProjectTabId>("tasks", ["tasks", "context", "execution", "settings"] as const);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Data fetching
  const {
    project,
    isLoading: projectLoading,
    mutate: mutateProject,
  } = useProject(projectId);

  const {
    tasks,
    isLoading: tasksLoading,
    isError: tasksError,
    mutate: mutateTasks,
  } = useTasks(projectId);

  const {
    executions,
    isLoading: executionsLoading,
    mutate: mutateExecutions,
  } = useExecutions(projectId);
  const { routines } = useRoutines();

  useEffect(() => {
    if (!selectedTask || !tasks) return;
    const refreshedTask = tasks.find((task) => task.id === selectedTask.id);
    if (refreshedTask && refreshedTask !== selectedTask) {
      setSelectedTask(refreshedTask);
    }
  }, [selectedTask, tasks]);
  const { graph, mutate: mutateGraph } = useDependencyGraph(projectId);

  // Tab content with task counts
  const tabsWithCounts = TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === "tasks" ? tasks?.length : undefined,
  }));

  if (projectLoading) {
    return isMobileViewport ? (
      <MobilePageShell title="Project" backHref="/dashboard/projects" backLabel="Projects">
          <div className="flex h-48 items-center justify-center">
            <svg className="theme-text-muted h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        </MobilePageShell>
    ) : (
      <>
          <TopBar title="Project" />
          <PageContent className="space-y-6">
            <ProjectHeader
              project={project}
              projectId={projectId}
              isLoading={projectLoading}
              onUpdated={() => mutateProject()}
            />
          </PageContent>
      </>
    );
  }

  if (!project) {
    return isMobileViewport ? (
      <MobilePageShell title="Project" backHref="/dashboard/projects" backLabel="Projects">
          <div className="theme-text-muted flex h-48 items-center justify-center text-sm">
            Project not found
          </div>
        </MobilePageShell>
    ) : (
      <>
          <TopBar title="Project" />
          <PageContent className="space-y-6">
            <div className="theme-text-muted flex h-48 items-center justify-center text-sm">
              Project not found
            </div>
          </PageContent>
      </>
    );
  }

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell
        title={project.name}
        backHref="/dashboard/projects"
        backLabel="Projects"
      >
        <MobileProjectDetail
          project={project}
          tasks={tasks}
          executions={executions}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
          tabs={tabsWithCounts}
        />
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Project" />

        <PageContent className="space-y-6">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Projects", href: "/dashboard/projects" },
              { label: project?.name ?? "Project" },
            ]}
          />

          <ProjectHeader
            project={project}
            projectId={projectId}
            isLoading={projectLoading}
            onUpdated={() => mutateProject()}
          />

          <Tabs
            tabs={tabsWithCounts}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />

          <div className="min-h-[500px]">
            {activeTab === "tasks" && (
              <TaskList
                tasks={tasks}
                isLoading={tasksLoading}
                isError={tasksError}
                onSelectTask={(t) => setSelectedTask(t)}
                onDeleted={() => {
                  mutateTasks();
                }}
                projectId={projectId}
                routines={routines}
              />
            )}

            {activeTab === "context" && (
              <ProjectContextTab
                project={project}
                onUpdated={() => mutateProject()}
              />
            )}

            {activeTab === "settings" && (
              <ProjectSettingsTab
                project={project}
                onUpdated={() => mutateProject()}
              />
            )}

            {activeTab === "execution" && (
              <ExecutionPanel
                projectId={projectId}
                executions={executions}
                isLoading={executionsLoading}
                onRefresh={() => {
                  mutateExecutions();
                  mutateTasks();
                }}
              />
            )}
          </div>
        </PageContent>
      </>
      )}

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdated={() => mutateTasks()}
        onDeleted={() => {
          setSelectedTask(null);
          mutateTasks();
        }}
        routines={routines}
        tasks={tasks}
        graph={graph}
        executions={executions}
        onDepsChanged={() => { mutateTasks(); mutateGraph(); }}
      />
    </>
  );
}
