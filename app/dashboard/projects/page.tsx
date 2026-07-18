"use client";

import { useState } from "react";
import { useProjects } from "@/lib/hooks";
import { TopBar } from "@/components/layout/TopBar";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { Button } from "@/components/ui/Button";
import { MobileProjectList } from "@/components/dashboard/MobileProjectList";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { CreateProjectModal } from "@/components/dashboard/CreateProjectModal";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const isMobileViewport = useIsMobileViewport();

  const {
    projects,
    isLoading,
    isError,
    mutate: mutateProjects,
  } = useProjects();

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell
        title="Projects"
      >
        <MobileProjectList
          projects={projects}
          isLoading={isLoading}
          isError={isError}
        />
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Projects" />

        <PageContent>
          <div className="mb-4 flex items-start justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage optional project context for tasks, routines, and executions.
            </p>
            <Button
              className="h-10 w-10 shrink-0 !bg-deep-space-blue-500 !px-0 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
              onClick={() => setModalOpen(true)}
              title="New Project"
              aria-label="New Project"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </Button>
          </div>

          <ProjectList
            projects={projects}
            isLoading={isLoading}
            isError={isError}
            onCreateProject={() => setModalOpen(true)}
          />
        </PageContent>
      </>
      )}

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => mutateProjects()}
      />
    </>
  );
}
