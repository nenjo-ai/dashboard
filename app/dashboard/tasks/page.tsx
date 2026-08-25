"use client";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
import { TaskIndexClient } from "@/components/tasks/TaskIndexClient";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function TasksPage() {
  const mobile = useIsMobileViewport();

  return mobile ? (
    <MobilePageShell title="Tasks">
      <p className="theme-text-muted mb-5 text-sm leading-6">
        Plan, filter, and run organization work independently of projects.
      </p>
      <TaskIndexClient />
    </MobilePageShell>
  ) : (
    <>
      <TopBar title="Tasks" />
      <PageContent>
        <PageIntro
          eyebrow="Work queue"
          description="Plan, dispatch, and monitor organization work from one focused queue."
        />
        <TaskIndexClient />
      </PageContent>
    </>
  );
}
