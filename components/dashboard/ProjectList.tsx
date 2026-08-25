"use client";

import type { Project } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProjectCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState as EmptyStatePanel } from "@/components/ui/EmptyState";
import { FolderKanban, Plus, TriangleAlert } from "lucide-react";

function hasRepoUrl(project: Project): boolean {
  const s = project.settings;
  return !!(s && typeof s === "object" && "repo_url" in s && (s as Record<string, unknown>).repo_url);
}

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onCreateProject: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EmptyState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <EmptyStatePanel
      icon={<FolderKanban className="h-5 w-5" />}
      title="Create your first project"
      description="Give related tasks, routines, and execution runs a shared place for context and resources."
      action={(
        <Button onClick={onCreateProject}>
          <Plus className="h-4 w-4" />
          Create project
        </Button>
      )}
    />
  );
}

function ErrorState() {
  return (
    <EmptyStatePanel
      icon={<TriangleAlert className="h-5 w-5" />}
      title="Projects could not be loaded"
      description="Check the local worker connection, then refresh this page to try again."
      tone="error"
    />
  );
}

export function ProjectList({
  projects,
  isLoading,
  isError,
  onCreateProject,
}: ProjectListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState />;
  }

  if (!projects || projects.length === 0) {
    return <EmptyState onCreateProject={onCreateProject} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <a
          key={project.id}
          href={`/dashboard/projects/${project.slug || project.id}`}
          className="group"
        >
          <Card className="h-full transition-all group-hover:border-deep-space-blue-200 group-hover:shadow-md dark:group-hover:border-deep-space-blue-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-deep-space-blue-50 text-deep-space-blue-600 text-sm font-bold dark:bg-deep-space-blue-900/50 dark:text-deep-space-blue-300">
                  {project.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{project.name}</span>
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {project.description || "No description provided"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                {hasRepoUrl(project) && (
                  <span className="theme-surface-muted theme-text-muted inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.814a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                    </svg>
                    Repo linked
                  </span>
                )}
              </div>
            </CardContent>
            <CardFooter className="justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>Created {formatDate(project.created_at)}</span>
              <span className="text-deep-space-blue-500 font-medium opacity-0 transition-opacity group-hover:opacity-100">
                View details &rarr;
              </span>
            </CardFooter>
          </Card>
        </a>
      ))}
    </div>
  );
}
