"use client";

import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function DashboardPage() {
  const isMobileViewport = useIsMobileViewport();

  return isMobileViewport ? (
    <MobilePageShell title="Dashboard">
      <DashboardOverview />
    </MobilePageShell>
  ) : (
    <>
      <TopBar title="Dashboard" />
      <PageContent>
        <DashboardOverview />
      </PageContent>
    </>
  );
}
