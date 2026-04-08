"use client";

import { useProjects, useRecentExecutions } from "@/lib/hooks";
import { TopBar } from "@/components/layout/TopBar";
import { RecentExecutions } from "@/components/dashboard/RecentExecutions";
import { PageContent } from "@/components/ui/PageContent";

export default function ExecutionsPage() {
  const { projects } = useProjects();
  const firstProjectId = projects?.[0]?.id;

  const { executions, isLoading, isError } = useRecentExecutions(
    firstProjectId,
    50,
  );

  return (
    <>
      <TopBar title="Executions" />

      <PageContent>
        <div className="rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Execution Runs
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
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
  );
}
