"use client";

import Link from "next/link";
import { ArrowUpRight, FolderKanban, Link2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";

function hasRepoUrl(project: Project): boolean {
  const settings = project.settings;
  return !!(settings && typeof settings === "object" && "repo_url" in settings && (settings as Record<string, unknown>).repo_url);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface MobileProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onCreateProject?: () => void;
}

export function MobileProjectList({
  projects,
  isLoading,
  isError,
  onCreateProject,
}: MobileProjectListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.6rem] border border-black/10 bg-transparent p-4 dark:border-white/10"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[1.6rem] border border-red-200/80 bg-red-50/90 p-5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
        Failed to load projects.
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="rounded-[1.8rem] border border-dashed border-black/10 bg-transparent px-6 py-12 text-center dark:border-white/10">
        <p className="text-base font-semibold text-gray-950 dark:text-gray-50">No projects yet</p>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Create a project to organize tasks, routines, and agent runs in one place.
        </p>
        {onCreateProject ? (
          <button
            type="button"
            onClick={onCreateProject}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-deep-space-blue-500 px-4 text-sm font-medium text-white transition-colors hover:bg-deep-space-blue-400 active:scale-[0.98] active:bg-deep-space-blue-600"
          >
            New Project
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/dashboard/projects/${project.id}`}
          className="group block rounded-[1.6rem] border border-black/10 bg-transparent p-4 transition-transform active:scale-[0.99] dark:border-white/10"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">
                    {project.name}
                  </h2>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                    Created {formatDate(project.created_at)}
                  </p>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-active:translate-x-0.5 dark:text-gray-600" />
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {project.description || "No description provided."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {hasRepoUrl(project) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
                    <Link2 className="h-3 w-3" />
                    Repo linked
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
