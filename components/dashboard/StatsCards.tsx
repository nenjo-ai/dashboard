"use client";

import type { Project, ExecutionDetails } from "@/lib/types";
import { StatsCardSkeleton } from "@/components/ui/Skeleton";

interface StatsCardsProps {
  projects: Project[] | undefined;
  executions: ExecutionDetails[] | undefined;
  isLoading: boolean;
}

interface StatItem {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export function StatsCards({ projects, executions, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const totalProjects = projects?.length ?? 0;
  const runningExecutions =
    executions?.filter((e) => e.status === "running").length ?? 0;
  const completedExecutions =
    executions?.filter((e) => e.status === "completed").length ?? 0;
  const totalAgents =
    executions?.reduce((sum, e) => sum + e.model_count, 0) ?? 0;

  const stats: StatItem[] = [
    {
      label: "Total Projects",
      value: totalProjects,
      color: "text-deep-space-blue-500 bg-deep-space-blue-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      ),
    },
    {
      label: "Running",
      value: runningExecutions,
      color: "text-blue-600 bg-blue-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
    },
    {
      label: "Completed",
      value: completedExecutions,
      color: "text-emerald-600 bg-emerald-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Total Agents",
      value: totalAgents,
      color: "text-vivid-tangerine-600 bg-vivid-tangerine-50",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
            </div>
            <div className={`rounded-lg p-3 ${stat.color}`}>{stat.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
