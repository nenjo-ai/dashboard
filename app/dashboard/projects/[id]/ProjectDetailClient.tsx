"use client";

import dynamic from "next/dynamic";
import { Activity, FileText, Settings2 } from "lucide-react";
import { useProject, useTabParam } from "@/lib/hooks";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";
import { ProjectMasthead } from "@/components/project/ProjectMasthead";
import { ProjectOverviewTab } from "@/components/project/ProjectOverviewTab";

const ProjectContextTab = dynamic(
  () => import("@/components/project/ProjectContextTab").then((mod) => mod.ProjectContextTab),
  { loading: () => <LoadingStatus className="min-h-[28rem]" label="Loading project context" description="Preparing the context editor and references." /> },
);

const ProjectSettingsTab = dynamic(
  () => import("@/components/project/ProjectSettingsTab").then((mod) => mod.ProjectSettingsTab),
  { loading: () => <LoadingStatus className="min-h-[28rem]" label="Loading project settings" description="Preparing repository and project controls." /> },
);

const TABS = [
  { id: "overview", label: "Overview", icon: <Activity className="h-4 w-4" aria-hidden="true" /> },
  { id: "context", label: "Context", icon: <FileText className="h-4 w-4" aria-hidden="true" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="h-4 w-4" aria-hidden="true" /> },
] as const;

type ProjectTabId = (typeof TABS)[number]["id"];

export function ProjectDetailClient({ projectRef }: { projectRef: string }) {
  const isMobileViewport = useIsMobileViewport();
  const [activeTab, setActiveTab] = useTabParam<ProjectTabId>("overview", ["overview", "context", "settings"] as const);
  const { project, isLoading, mutate } = useProject(projectRef);

  const pageBody = project ? (
    <div className="space-y-5 md:space-y-6">
      <div className="hidden md:block">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Projects", href: "/dashboard/projects" }, { label: project.name }]} />
      </div>
      <ProjectMasthead project={project} onUpdated={() => void mutate()} />
      <Tabs
        tabs={[...TABS]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as ProjectTabId)}
        layoutId="project-detail-tab"
        indicatorAnimation="slide"
        mobileVariant="scroll"
      />
      <div className="min-h-[500px]">
        {activeTab === "overview" ? <ProjectOverviewTab project={project} /> : null}
        {activeTab === "context" ? <ProjectContextTab project={project} onUpdated={() => void mutate()} /> : null}
        {activeTab === "settings" ? <ProjectSettingsTab project={project} onUpdated={() => void mutate()} /> : null}
      </div>
    </div>
  ) : null;

  if (isLoading) {
    const loading = <LoadingStatus className="min-h-72" label="Loading project" description="Gathering project context and recent work." />;
    return isMobileViewport ? (
      <MobilePageShell title="Project" backHref="/dashboard/projects" backLabel="Projects">{loading}</MobilePageShell>
    ) : (
      <><TopBar title="Projects" /><PageContent>{loading}</PageContent></>
    );
  }

  if (!project) {
    const missing = <div className="theme-text-muted flex min-h-72 items-center justify-center text-sm">Project not found</div>;
    return isMobileViewport ? (
      <MobilePageShell title="Project" backHref="/dashboard/projects" backLabel="Projects">{missing}</MobilePageShell>
    ) : (
      <><TopBar title="Projects" /><PageContent>{missing}</PageContent></>
    );
  }

  return isMobileViewport ? (
    <MobilePageShell title={project.name} backHref="/dashboard/projects" backLabel="Projects">{pageBody}</MobilePageShell>
  ) : (
    <><TopBar title="Projects" /><PageContent>{pageBody}</PageContent></>
  );
}
