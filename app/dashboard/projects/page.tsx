"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useProjects } from "@/lib/hooks";
import { TopBar } from "@/components/layout/TopBar";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { Button } from "@/components/ui/Button";
import { MobileProjectList } from "@/components/dashboard/MobileProjectList";
import { ProjectList } from "@/components/dashboard/ProjectList";
import { CreateProjectModal } from "@/components/dashboard/CreateProjectModal";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
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
        actionLabel="New"
        onAction={() => setModalOpen(true)}
      >
        <MobileProjectList
          projects={projects}
          isLoading={isLoading}
          isError={isError}
          onCreateProject={() => setModalOpen(true)}
        />
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Projects" />

        <PageContent>
          <PageIntro
            description="Organize related tasks, routines, agents, and execution context in one focused workspace."
            actions={(
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            )}
          />

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
