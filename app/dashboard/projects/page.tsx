"use client";

import { useState } from "react";
import { useProjects } from "@/lib/hooks";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/Button";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { CreateProjectModal } from "@/components/dashboard/CreateProjectModal";
import { PageContent } from "@/components/ui/PageContent";

export default function ProjectsPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const {
    projects,
    isLoading,
    isError,
    mutate: mutateProjects,
  } = useProjects();

  return (
    <>
      <TopBar title="Projects" />

      <PageContent>
        <div className="mb-4 flex items-start justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your projects. Each project contains tasks, routines, and agent executions.
          </p>
          <Button className="shrink-0" onClick={() => setModalOpen(true)}>
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
            New Project
          </Button>
        </div>

        <ProjectList
          projects={projects}
          isLoading={isLoading}
          isError={isError}
          onCreateProject={() => setModalOpen(true)}
        />
      </PageContent>

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => mutateProjects()}
      />
    </>
  );
}
