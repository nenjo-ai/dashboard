"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, GitBranch } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import type { Project } from "@/lib/types";

type MobileProjectTab = "context" | "settings";

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

export function MobileProjectDetail({
  project,
  activeTab,
  onTabChange,
  tabs,
}: {
  project: Project;
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
      </section>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => onTabChange(id as MobileProjectTab)} layoutId="project-detail-tab-mobile" />

      {activeTab === "context" && (
        <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
          <MetadataRow label="Project ID" value={project.id} />
          <MetadataRow label="Owner" value={project.owner_id} />
          <MetadataRow label="Created" value={formatDate(project.created_at)} />
          <MetadataRow label="Updated" value={formatDate(project.updated_at)} />
          <MetadataRow label="Repository" value={repoUrl ?? "Not linked"} />
        </section>
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
