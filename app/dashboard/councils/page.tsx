"use client";

import { CouncilsSection } from "@/components/councils/CouncilsSection";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function CouncilsPage() {
  const mobile = useIsMobileViewport();

  return mobile ? (
    <MobilePageShell title="Councils">
      <CouncilsSection />
    </MobilePageShell>
  ) : (
    <>
      <TopBar title="Councils" />
      <PageContent>
        <CouncilsSection />
      </PageContent>
    </>
  );
}
