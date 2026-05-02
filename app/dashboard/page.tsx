"use client";

import Link from "next/link";
import { TokenUsagePanel } from "@/components/dashboard/TokenUsagePanel";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { useProjects, useAgents, useRecentExecutions, useActivity, useTokenUsage, type ActivityEntry } from "@/lib/hooks";
import { formatCompactTokens, formatExactTokens } from "@/lib/formatTokens";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

function StatCard({
  label,
  value,
  href,
  title,
  secondary,
  badge,
}: {
  label: string;
  value: string | number;
  href: string;
  title?: string;
  secondary?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="theme-border theme-surface rounded-xl border p-5 transition-colors hover:[border-color:var(--app-border-strong)] md:shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="theme-text-muted text-sm">{label}</p>
        {badge && (
          <span className="theme-border theme-text-muted rounded-full border px-2 py-0.5 text-[11px] font-medium">
            {badge}
          </span>
        )}
      </div>
      <p className="theme-text mt-1 text-2xl font-semibold">{value}</p>
      {secondary && (
        <p className="theme-text-muted mt-1 truncate text-xs">{secondary}</p>
      )}
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
      <p className="theme-text-muted truncate pr-4 text-sm">
        {entry.summary}
      </p>
      <span className="theme-text-muted shrink-0 text-xs">
        {formatRelativeTime(entry.created_at)}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const isMobileViewport = useIsMobileViewport();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const { executions } = useRecentExecutions(undefined, 50);
  const { activity } = useActivity({ limit: 20 });
  const { usage: tokenUsage } = useTokenUsage();

  const runningExecutions = executions?.filter(
    (e) => e.status === "running" || e.status === "pending",
  ).length ?? 0;
  const tokenCardValue = tokenUsage ? formatCompactTokens(tokenUsage.total_tokens) : "-";
  const tokenCardTitle = tokenUsage
    ? `Input: ${formatExactTokens(tokenUsage.input_tokens)} · Output: ${formatExactTokens(tokenUsage.output_tokens)}`
    : undefined;
  const tokenCardSecondary = tokenUsage
    ? `${formatCompactTokens(tokenUsage.input_tokens)} in / ${formatCompactTokens(tokenUsage.output_tokens)} out`
    : undefined;

  return isMobileViewport ? (
    <MobilePageShell title="Dashboard">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Projects" value={projects?.length ?? "-"} href="/dashboard/projects" />
          <StatCard label="Agents" value={agents?.length ?? "-"} href="/dashboard/agents" />
          <StatCard label="Running" value={runningExecutions} href="/dashboard/activity" />
          <StatCard label="Executions" value={executions?.length ?? "-"} href="/dashboard/executions" />
          <StatCard
            label="Tokens"
            value={tokenCardValue}
            href="#token-usage"
            title={tokenCardTitle}
            secondary={tokenCardSecondary}
            badge="Estimated"
          />
        </div>

        <TokenUsagePanel />

        <div className="mt-4 rounded-[1.5rem] border border-black/10 bg-transparent dark:border-white/10">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h2>
            <Link href="/dashboard/activity" className="text-xs font-medium text-deep-space-blue-500 dark:text-deep-space-blue-400">
              View all
            </Link>
          </div>
          <div className="divide-y divide-black/5 px-4 dark:divide-white/10">
            {!activity || activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No activity yet.</p>
            ) : (
              activity.map((entry) => <ActivityItem key={entry.id} entry={entry} />)
            )}
          </div>
        </div>
      </MobilePageShell>
  ) : (
    <>
      <TopBar title="Dashboard" />
      <PageContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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
          <StatCard
            label="Tokens"
            value={tokenCardValue}
            href="#token-usage"
            title={tokenCardTitle}
            secondary={tokenCardSecondary}
            badge="Estimated"
          />
        </div>

        <TokenUsagePanel />

        <div className="theme-border theme-surface mt-6 rounded-xl border shadow-xs">
          <div className="theme-border flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="theme-text text-sm font-semibold">
              Recent Activity
            </h2>
            <Link
              href="/dashboard/activity"
              className="text-xs font-medium text-deep-space-blue-500 hover:text-deep-space-blue-600 dark:text-deep-space-blue-400"
            >
              View all
            </Link>
          </div>
          <div className="theme-border px-5 divide-y">
            {!activity || activity.length === 0 ? (
              <p className="theme-text-muted py-6 text-center text-sm">
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
