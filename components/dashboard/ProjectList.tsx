"use client";

import type { Project } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProjectCardSkeleton } from "@/components/ui/Skeleton";

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
    <div className="theme-border theme-surface flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16">
      <div className="rounded-full bg-deep-space-blue-50 p-4">
        <svg
          className="h-10 w-10 text-deep-space-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No projects yet</h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
        Get started by creating your first project. Projects organize your AI agents, tasks, and execution runs.
      </p>
      <Button
        onClick={onCreateProject}
        className="mt-6 !bg-deep-space-blue-500 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Project
      </Button>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
      <svg
        className="h-10 w-10 text-flag-red-400"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
      <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Failed to load projects
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Please check your connection and try again.
      </p>
    </div>
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
