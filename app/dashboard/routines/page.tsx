"use client";

import { Suspense } from "react";
import { useTabParam } from "@/lib/hooks";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { Tabs } from "@/components/ui/Tabs";
import { RoutineSection } from "@/components/routine/RoutineSection";
import { CouncilsSection } from "@/components/councils/CouncilsSection";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

type RoutinesTab = "tasks" | "schedules" | "councils";

export default function RoutinesPage() {
  return (
    <Suspense>
      <RoutinesPageContent />
    </Suspense>
  );
}

function RoutinesPageContent() {
  const isMobileViewport = useIsMobileViewport();
  const [activeTab, setActiveTab] = useTabParam<RoutinesTab>("tasks", [
    "tasks",
    "schedules",
    "councils",
  ]);

  const tabs = [
    { id: "tasks" as const, label: "Tasks" },
    { id: "schedules" as const, label: "Schedules" },
    { id: "councils" as const, label: "Councils" },
  ];

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell title="Routines">
        <div className="mb-4">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as RoutinesTab)}
            layoutId="routines-tab-indicator"
          />
        </div>

        {activeTab === "tasks" && (
          <RoutineSection triggerFilter={["task.ready", "chat.message"]} allowCreate={false} />
        )}

        {activeTab === "schedules" && (
          <RoutineSection triggerFilter={["cron"]} allowCreate={false} />
        )}

        {activeTab === "councils" && <CouncilsSection allowCreate={false} />}
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Routines" />

        <PageContent>
          <div className="mb-6">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as RoutinesTab)}
              layoutId="routines-tab-indicator"
            />
          </div>

          {activeTab === "tasks" && (
            <RoutineSection triggerFilter={["task.ready", "chat.message"]} />
          )}

          {activeTab === "schedules" && (
            <RoutineSection triggerFilter={["cron"]} />
          )}

          {activeTab === "councils" && <CouncilsSection />}
        </PageContent>
      </>
      )}
    </>
  );
}
