"use client";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { useProjects, useRecentExecutions } from "@/lib/hooks";
import { TopBar } from "@/components/layout/TopBar";
import { RecentExecutions } from "@/components/dashboard/RecentExecutions";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ExecutionsPage() {
  const isMobileViewport = useIsMobileViewport();
  const { projects } = useProjects();
  const firstProjectId = projects?.[0]?.id;

  const { executions, isLoading, isError } = useRecentExecutions(
    firstProjectId,
    50,
  );

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell title="Executions">
        <div className="space-y-3">
          {executions?.map((execution) => (
            <div key={execution.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {execution.status}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(execution.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {execution.model_count} agents • {execution.task_counts.total} tasks
              </p>
            </div>
          ))}
          {isLoading && <div className="rounded-[1.4rem] border border-black/10 bg-transparent p-5 text-sm text-gray-400 dark:border-white/10">Loading executions...</div>}
          {!isLoading && (!executions || executions.length === 0) && <div className="rounded-[1.4rem] border border-black/10 bg-transparent p-5 text-sm text-gray-400 dark:border-white/10">No executions yet.</div>}
        </div>
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Executions" />

        <PageContent>
          <div className="theme-border theme-surface rounded-xl border shadow-xs">
            <div className="theme-border border-b px-6 py-4">
              <h2 className="theme-text text-lg font-semibold">
                Execution Runs
              </h2>
              <p className="theme-text-muted text-sm">
                All execution runs across your projects.
              </p>
            </div>
            <div className="px-5 py-2">
              <RecentExecutions
                executions={executions}
                isLoading={isLoading}
                isError={isError}
              />
            </div>
          </div>
        </PageContent>
      </>
      )}
    </>
  );
}
