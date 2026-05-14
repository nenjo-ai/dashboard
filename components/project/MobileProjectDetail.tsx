"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, GitBranch, PlayCircle } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import type { ExecutionDetails, Project, Task } from "@/lib/types";

type MobileProjectTab = "tasks" | "context" | "execution" | "settings";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/5 py-3 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/10">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

function hasRepoUrl(project: Project | undefined): string | null {
  const settings = project?.settings;
  if (!settings || typeof settings !== "object" || !("repo_url" in settings)) return null;
  const repo = (settings as Record<string, unknown>).repo_url;
  return typeof repo === "string" && repo.length > 0 ? repo : null;
}

function statusTone(status: string): string {
  switch (status) {
    case "done":
    case "completed":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
    case "running":
      return "bg-amber-500/12 text-amber-700 dark:text-amber-300";
    case "failed":
    case "cancelled":
      return "bg-red-500/12 text-red-700 dark:text-red-300";
    default:
      return "bg-black/[0.04] text-gray-700 dark:bg-white/[0.06] dark:text-gray-300";
  }
}

export function MobileProjectDetail({
  project,
  tasks,
  executions,
  activeTab,
  onTabChange,
  tabs,
}: {
  project: Project;
  tasks: Task[] | undefined;
  executions: ExecutionDetails[] | undefined;
  activeTab: MobileProjectTab;
  onTabChange: (tab: MobileProjectTab) => void;
  tabs: { id: MobileProjectTab; label: string; icon: ReactNode; count?: number }[];
}) {
  const repoUrl = hasRepoUrl(project);

  return (
    <div className="space-y-4 md:hidden">
      <section className="rounded-[1.7rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
        <h2 className="text-lg font-semibold text-gray-950 dark:text-gray-50">{project.name}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {project.description || "No project description provided."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
            {tasks?.length ?? 0} tasks
          </span>
          <span className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
            {executions?.length ?? 0} runs
          </span>
        </div>
      </section>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => onTabChange(id as MobileProjectTab)} layoutId="project-detail-tab-mobile" />

      {activeTab === "tasks" && (
        <div className="space-y-3">
          {(tasks ?? []).slice(0, 12).map((task) => (
            <section key={task.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{task.title}</h3>
                  {task.description && (
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{task.description}</p>
                  )}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(task.status)}`}>
                  {task.status.replaceAll("_", " ")}
                </span>
              </div>
            </section>
          ))}
          {(!tasks || tasks.length === 0) && (
            <div className="rounded-[1.4rem] border border-dashed border-black/10 bg-transparent p-5 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
              No tasks yet.
            </div>
          )}
        </div>
      )}

      {activeTab === "context" && (
        <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
          <MetadataRow label="Project ID" value={project.id} />
          <MetadataRow label="Owner" value={project.owner_id} />
          <MetadataRow label="Created" value={formatDate(project.created_at)} />
          <MetadataRow label="Updated" value={formatDate(project.updated_at)} />
          <MetadataRow label="Repository" value={repoUrl ?? "Not linked"} />
        </section>
      )}

      {activeTab === "execution" && (
        <div className="space-y-3">
          {(executions ?? []).slice(0, 10).map((execution) => (
            <section key={execution.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-deep-space-blue-500" />
                  <span className="text-sm font-semibold text-gray-950 dark:text-gray-50">{execution.status}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(execution.created_at)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                  {execution.model_count} models
                </span>
                <span className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                  {execution.parallel_count} parallel
                </span>
              </div>
            </section>
          ))}
          {(!executions || executions.length === 0) && (
            <div className="rounded-[1.4rem] border border-dashed border-black/10 bg-transparent p-5 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
              No executions yet.
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
          <MetadataRow label="Slug" value={project.slug || "None"} />
          <MetadataRow label="Repository" value={repoUrl ?? "Not linked"} />
          {repoUrl && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.03] px-3 py-2 text-sm font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200"
            >
              <GitBranch className="h-4 w-4" />
              Open repository
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </section>
      )}
    </div>
  );
}
