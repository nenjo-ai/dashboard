"use client";

import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { useProjects, useAgents, useRecentExecutions, useActivity, type ActivityEntry } from "@/lib/hooks";

function StatCard({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
    >
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </Link>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <p className="text-sm text-gray-700 dark:text-gray-300 truncate pr-4">
        {entry.summary}
      </p>
      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
        {formatRelativeTime(entry.created_at)}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { projects } = useProjects();
  const { agents } = useAgents();
  const { executions } = useRecentExecutions(undefined, 50);
  const { activity } = useActivity({ limit: 8 });

  const runningExecutions = executions?.filter(
    (e) => e.status === "running" || e.status === "pending",
  ).length ?? 0;

  return (
    <>
      <TopBar title="Dashboard" />
      <PageContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Projects"
            value={projects?.length ?? "-"}
            href="/dashboard/projects"
          />
          <StatCard
            label="Agents"
            value={agents?.length ?? "-"}
            href="/dashboard/agents"
          />
          <StatCard
            label="Running"
            value={runningExecutions}
            href="/dashboard/activity"
          />
          <StatCard
            label="Executions"
            value={executions?.length ?? "-"}
            href="/dashboard/activity"
          />
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Recent Activity
            </h2>
            <Link
              href="/dashboard/activity"
              className="text-xs font-medium text-deep-space-blue-500 hover:text-deep-space-blue-600 dark:text-deep-space-blue-400"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-50 px-5 dark:divide-gray-700/50">
            {!activity || activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                No activity yet.
              </p>
            ) : (
              activity.map((entry) => (
                <ActivityItem key={entry.id} entry={entry} />
              ))
            )}
          </div>
        </div>
      </PageContent>
    </>
  );
}
