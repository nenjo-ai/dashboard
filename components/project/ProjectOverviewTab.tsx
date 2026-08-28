"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  GitBranch,
  ListTodo,
  Radio,
  Settings2,
} from "lucide-react";
import { DashboardActivityTimeline } from "@/components/dashboard/DashboardActivityTimeline";
import { DashboardContinueWorking } from "@/components/dashboard/DashboardContinueWorking";
import { TaskList } from "@/components/project/TaskList";
import { allChatSessionsUrl, fetcher } from "@/lib/api";
import { useActivity, useRecentExecutions, useTasks } from "@/lib/hooks";
import {
  getProjectReadiness,
  selectProjectSessions,
  summarizeProjectExecutions,
} from "@/lib/projectOverview";
import { useChatSessionIndicators } from "@/lib/useChatSessionIndicators";
import type { ChatSessionExtended, Project } from "@/lib/types";

function ProjectSummary({
  project,
  activeCount,
  attentionCount,
  completedTodayCount,
}: {
  project: Project;
  activeCount: number;
  attentionCount: number;
  completedTodayCount: number;
}) {
  const readiness = getProjectReadiness(project);
  const metrics = [
    { label: "Active work", value: activeCount, icon: Radio, tone: "text-blue-600 dark:text-blue-300" },
    { label: "Needs attention", value: attentionCount, icon: CircleAlert, tone: attentionCount ? "text-amber-600 dark:text-amber-300" : "theme-text-muted" },
    { label: "Completed today", value: completedTodayCount, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-300" },
  ];

  return (
    <section className="theme-border theme-surface relative h-full overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-6">
      <div className="pointer-events-none absolute -right-20 -top-28 h-60 w-60 rounded-full bg-violet-500/[0.06] blur-3xl dark:bg-violet-400/[0.07]" aria-hidden="true" />
      <div className="relative">
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">Live overview</p>
        <h2 className="theme-text mt-1.5 text-xl font-semibold tracking-[-0.025em]">Project summary</h2>
        <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
          {activeCount > 0
            ? `${activeCount} ${activeCount === 1 ? "execution is" : "executions are"} currently moving through this project.`
            : attentionCount > 0
              ? `${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} attention before work can move forward.`
              : "This project is ready for its next task or agent conversation."}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`?tab=context`} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${readiness.hasContext ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300" : "theme-border theme-surface-muted theme-text-muted"}`}>
            <BookOpenCheck className="h-3 w-3" aria-hidden="true" />
            {readiness.hasContext ? "Context ready" : "Context not added"}
          </Link>
          <Link href={`?tab=settings`} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${readiness.hasRepository ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300" : "theme-border theme-surface-muted theme-text-muted"}`}>
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            {readiness.hasRepository ? "Repository connected" : "No repository"}
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link key={metric.label} href="/dashboard/executions" className="group rounded-xl border border-black/[0.055] bg-white/55 p-3 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-black/10 hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.025] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.045] sm:p-3.5">
                <Icon className={`h-4 w-4 ${metric.tone}`} aria-hidden="true" />
                <p className="theme-text mt-3 text-xl font-semibold tabular-nums">{metric.value}</p>
                <p className="theme-text-muted mt-0.5 text-[11px] sm:text-xs">{metric.label}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProjectQuickActions() {
  const actions = [
    { label: "Edit context", href: "?tab=context", icon: BookOpenCheck, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-300" },
    { label: "Project tasks", href: "#project-tasks", icon: ListTodo, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" },
    { label: "Repository", href: "?tab=settings", icon: GitBranch, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
    { label: "Activity", href: "#project-activity", icon: Activity, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
  ];

  return (
    <section className="theme-border theme-surface h-full rounded-[1.4rem] border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <h2 className="theme-text text-sm font-semibold">Quick actions</h2>
      <p className="theme-text-muted mt-1 text-sm">Move straight to the project surface you need.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href} scroll={false} className="group min-w-0 rounded-xl border border-transparent p-3 transition-[background-color,border-color] hover:border-black/[0.055] hover:[background:var(--app-hover)] dark:hover:border-white/[0.08]">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="theme-text mt-2 flex items-center justify-between gap-1 text-xs font-semibold sm:text-sm lg:text-xs xl:text-sm">
                <span className="truncate">{action.label}</span>
                <ArrowRight className="theme-text-muted h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  const { executions } = useRecentExecutions(project.id, 50);
  const { tasks, isLoading: tasksLoading, isError: tasksError, mutate: mutateTasks } = useTasks({ project_id: project.id, limit: 5 });
  const { activity } = useActivity({ projectId: project.id, limit: 4 });
  const { data: sessions, isLoading: sessionsLoading } = useSWR<ChatSessionExtended[]>(allChatSessionsUrl(50, 0, "chat"), fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const projectSessionIds = useMemo(
    () => sessions?.filter((session) => session.project_id === project.id).map((session) => session.id) ?? [],
    [project.id, sessions],
  );
  const indicators = useChatSessionIndicators(projectSessionIds);
  const recentSessions = useMemo(
    () => selectProjectSessions(sessions ?? [], project.id, indicators),
    [indicators, project.id, sessions],
  );
  const summary = summarizeProjectExecutions(executions ?? []);

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <div className="lg:col-span-8">
        <ProjectSummary project={project} {...summary} />
      </div>
      <div className="lg:col-span-4">
        <ProjectQuickActions />
      </div>
      <div className="lg:col-span-12">
        <DashboardContinueWorking
          sessions={recentSessions}
          indicators={indicators}
          isLoading={sessionsLoading}
          description="Resume an agent conversation scoped to this project."
          allHref="/dashboard/chat"
        />
      </div>
      <div id="project-tasks" className="scroll-mt-24 lg:col-span-7">
        <TaskList
          tasks={tasks}
          isLoading={tasksLoading}
          isError={tasksError}
          onDeleted={() => void mutateTasks()}
          projectId={project.id}
          heading="Project tasks"
          description="The most recently updated work for this project"
          emptyMessage="Create the first task to turn this project into actionable work."
        />
      </div>
      <div id="project-activity" className="scroll-mt-24 lg:col-span-5">
        <DashboardActivityTimeline
          activity={activity ?? []}
          description="Recent changes within this project."
          allHref="/dashboard/activity"
        />
      </div>
    </div>
  );
}
