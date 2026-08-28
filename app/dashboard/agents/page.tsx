"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useState } from "react";
import {
  Blocks,
  Bot,
  Boxes,
  Braces,
  Cpu,
  Globe2,
  PlugZap,
} from "lucide-react";

import { deleteModel } from "@/lib/api";
import { useAgents, useModels, useProjects, useTabParam } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { Model } from "@/lib/types";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { AgentsSection } from "@/components/agents/AgentsSection";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
import { Tabs } from "@/components/ui/Tabs";

const DomainsSection = dynamic(
  () => import("@/components/agents/DomainsSection").then((module) => module.DomainsSection),
  { loading: () => <WorkspaceLoading label="Loading domains" /> },
);
const AbilitiesSection = dynamic(
  () => import("@/components/agents/AbilitiesSection").then((module) => module.AbilitiesSection),
  { loading: () => <WorkspaceLoading label="Loading abilities" /> },
);
const CommandsSection = dynamic(
  () => import("@/components/agents/CommandsSection").then((module) => module.CommandsSection),
  { loading: () => <WorkspaceLoading label="Loading commands" /> },
);
const ContextBlocksSection = dynamic(
  () => import("@/components/agents/ContextBlocksSection").then((module) => module.ContextBlocksSection),
  { loading: () => <WorkspaceLoading label="Loading context blocks" /> },
);
const McpServersSection = dynamic(
  () => import("@/components/settings/McpServersSection").then((module) => module.McpServersSection),
  { loading: () => <WorkspaceLoading label="Loading MCP servers" /> },
);
const ModelsSection = dynamic(
  () => import("@/components/agents/ModelsSection").then((module) => module.ModelsSection),
  { loading: () => <WorkspaceLoading label="Loading models" /> },
);

const AGENT_TABS = ["agents", "domains", "abilities", "commands", "context", "mcp", "models"] as const;
type AgentsTab = (typeof AGENT_TABS)[number];

const TAB_META: Record<AgentsTab, { label: string; category: string; description: string; icon: React.ReactNode }> = {
  agents: { label: "Agents", category: "Identities", description: "Define focused identities, assign models, and control each agent’s operating surface.", icon: <Bot className="h-4 w-4" /> },
  domains: { label: "Domains", category: "Behavior", description: "Organize slash-command domains that guide agents through structured workflows.", icon: <Globe2 className="h-4 w-4" /> },
  abilities: { label: "Abilities", category: "Behavior", description: "Create reusable specialist behaviors agents can activate during execution.", icon: <Blocks className="h-4 w-4" /> },
  commands: { label: "Commands", category: "Behavior", description: "Inspect and manage slash commands installed from packages and plugins.", icon: <Braces className="h-4 w-4" /> },
  context: { label: "Context", category: "Prompting", description: "Manage reusable templates that shape what agents see in their prompts.", icon: <Boxes className="h-4 w-4" /> },
  mcp: { label: "MCP", category: "Infrastructure", description: "Connect external tool servers and make them available for agent assignment.", icon: <PlugZap className="h-4 w-4" /> },
  models: { label: "Models", category: "Infrastructure", description: "Configure chat and media engines once, then assign them across agents.", icon: <Cpu className="h-4 w-4" /> },
};

export default function AgentsPage() {
  return <Suspense fallback={<LoadingStatus className="min-h-screen" label="Loading agent studio" />}><AgentsPageContent /></Suspense>;
}

function AgentsPageContent() {
  const mobile = useIsMobileViewport();
  const { models, isLoading, isError, mutate } = useModels();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const [activeTab, setActiveTab] = useTabParam<AgentsTab>("agents", AGENT_TABS);
  const [deletingModel, setDeletingModel] = useState<Model | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const projectId = models?.[0]?.project_id ?? projects?.[0]?.id ?? "";
  const activeMeta = TAB_META[activeTab];
  const tabs = AGENT_TABS.map((id) => ({
    id,
    label: TAB_META[id].label,
    icon: TAB_META[id].icon,
    count: id === "agents" ? agents?.length : id === "models" ? models?.length : undefined,
  }));

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingModel) return;
    setDeleteLoading(true);
    try {
      await deleteModel(deletingModel.id);
      toast.success(`“${deletingModel.name}” deleted.`);
      setDeletingModel(null);
      await mutate();
    } catch {
      toast.error("Failed to delete model.");
    } finally {
      setDeleteLoading(false);
    }
  }, [deletingModel, mutate]);

  const body = (
    <div className="space-y-5 md:space-y-6">
      <div className="hidden md:block">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Agents" }]} />
      </div>
      <PageIntro
        className="mb-0"
        description="Design identities, prompts, capabilities, and model infrastructure as one coherent agent system."
        eyebrow="Agent studio"
        title="Agents & capabilities"
      />
      <Tabs
        activeTab={activeTab}
        indicatorAnimation="slide"
        layoutId="agents-workspace-tab"
        onChange={(id) => setActiveTab(id as AgentsTab)}
        tabs={tabs}
      />
      <div className="flex items-start gap-3">
        <span className="theme-selection-accent-soft theme-selected-text rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{activeMeta.category}</span>
        <p className="theme-text-muted max-w-3xl text-sm leading-6">{activeMeta.description}</p>
      </div>
      <div className="min-h-[34rem]">
        {activeTab === "agents" ? <AgentsSection /> : null}
        {activeTab === "domains" ? <DomainsSection /> : null}
        {activeTab === "abilities" ? <AbilitiesSection /> : null}
        {activeTab === "commands" ? <CommandsSection /> : null}
        {activeTab === "context" ? <ContextBlocksSection /> : null}
        {activeTab === "mcp" ? <McpServersSection /> : null}
        {activeTab === "models" ? (
          <ModelsSection
            agents={agents ?? []}
            isError={isError}
            isLoading={isLoading}
            models={models}
            onDelete={setDeletingModel}
            onSaved={() => void mutate()}
            projectId={projectId}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {mobile
        ? <MobilePageShell title="Agents">{body}</MobilePageShell>
        : <><TopBar title="Agents" /><PageContent>{body}</PageContent></>}
      <ConfirmDialog
        confirmLabel="Delete model"
        loading={deleteLoading}
        message={`Delete “${deletingModel?.name}”? Agents using it will need another model assignment.`}
        onClose={() => setDeletingModel(null)}
        onConfirm={handleDeleteConfirm}
        open={Boolean(deletingModel)}
        title="Delete model"
        variant="danger"
      />
    </>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return <LoadingStatus className="min-h-[28rem]" description="Preparing the selected agent resource workspace." label={label} />;
}
