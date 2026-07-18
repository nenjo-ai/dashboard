"use client";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { RoutineSection } from "@/components/routine/RoutineSection";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function RoutinesPage() {
  const mobile = useIsMobileViewport();
  return mobile ? <MobilePageShell title="Routines"><RoutineSection allowCreate={false} /></MobilePageShell> : <><TopBar title="Routines" /><PageContent><RoutineSection /></PageContent></>;
}
