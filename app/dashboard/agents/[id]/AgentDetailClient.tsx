"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Activity, Braces, LayoutDashboard, PanelsTopLeft, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { fetchAgentPrompt } from "@/lib/api";
import {
  useAgent,
  useAgentAbilities,
  useAgentDomains,
  useAgentExecutions,
  useAgentMcpServers,
  useModels,
  useTabParam,
} from "@/lib/hooks";
import type { AgentDefinition, PromptConfig } from "@/lib/types";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { AgentDetailHeader } from "@/components/agents/AgentDetailHeader";
import { AgentOverviewTab } from "@/components/agents/AgentOverviewTab";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { TaskExecutionHistory } from "@/components/tasks/TaskExecutionHistory";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";

const MobileAgentDetail = dynamic(
  () => import("@/components/agents/MobileAgentDetail").then((module) => module.MobileAgentDetail),
  { loading: () => <AgentPanelLoading label="Loading agent workspace" /> },
);
const AgentPromptEditorContent = dynamic(
  () => import("@/components/agents/AgentPromptEditor").then((module) => module.AgentPromptEditorContent),
  { loading: () => <AgentPanelLoading label="Loading prompt editor" /> },
);
const AgentAbilitiesTab = dynamic(
  () => import("@/components/agents/AgentAbilitiesTab").then((module) => module.AgentAbilitiesTab),
  { loading: () => <AgentPanelLoading label="Loading abilities" /> },
);
const AgentDomainsTab = dynamic(
  () => import("@/components/agents/AgentDomainsTab").then((module) => module.AgentDomainsTab),
  { loading: () => <AgentPanelLoading label="Loading domains" /> },
);
const AgentMediaTab = dynamic(
  () => import("@/components/agents/AgentMediaTab").then((module) => module.AgentMediaTab),
  { loading: () => <AgentPanelLoading label="Loading media capabilities" /> },
);
const AgentMcpPanel = dynamic(
  () => import("@/components/agents/AgentMcpPanel").then((module) => module.AgentMcpPanel),
  { loading: () => <AgentPanelLoading label="Loading MCP assignments" /> },
);
const AgentPlatformScopesPanel = dynamic(
  () => import("@/components/agents/AgentPlatformScopesPanel").then((module) => module.AgentPlatformScopesPanel),
  { loading: () => <AgentPanelLoading label="Loading platform scopes" /> },
);
const AgentSettingsTab = dynamic(
  () => import("@/components/agents/AgentSettingsTab").then((module) => module.AgentSettingsTab),
  { loading: () => <AgentPanelLoading label="Loading agent settings" /> },
);

const TAB_IDS = ["overview", "prompts", "abilities", "domains", "media", "mcp", "scopes", "activity", "settings"] as const;
type TabId = (typeof TAB_IDS)[number];
type CapabilityTab = Extract<TabId, "abilities" | "domains" | "media" | "mcp" | "scopes">;

const CAPABILITY_TAB_IDS: CapabilityTab[] = ["abilities", "domains", "media", "mcp", "scopes"];
const PRIMARY_TABS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "prompts", label: "Prompts", icon: <Braces className="h-4 w-4" /> },
  { id: "capabilities", label: "Capabilities", icon: <PanelsTopLeft className="h-4 w-4" /> },
  { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="h-4 w-4" /> },
];
const CAPABILITY_TABS = [
  { id: "abilities", label: "Abilities" },
  { id: "domains", label: "Domains" },
  { id: "media", label: "Media" },
  { id: "mcp", label: "MCP" },
  { id: "scopes", label: "Scopes" },
];
const MOBILE_TABS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "prompts", label: "Prompts", icon: <Braces className="h-4 w-4" /> },
  ...CAPABILITY_TABS.map((tab) => ({ ...tab, icon: <PanelsTopLeft className="h-4 w-4" /> })),
  { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="h-4 w-4" /> },
] as { id: TabId; label: string; icon: React.ReactNode }[];

const CAPABILITY_DESCRIPTIONS: Record<CapabilityTab, string> = {
  abilities: "Assign reusable specialist behaviors this agent may activate during execution.",
  domains: "Connect structured workflow domains and control whether each assignment is active.",
  media: "Choose models for image, audio, document, and video operations.",
  mcp: "Grant access to external tool servers configured for the organization.",
  scopes: "Control the platform resources this agent may read or change.",
};

function agentDashboardHref(agent: Pick<AgentDefinition, "id" | "slug">) {
  return `/dashboard/agents/${encodeURIComponent(agent.slug?.trim() || agent.id)}`;
}

export function AgentDetailClient({ agentRef }: { agentRef: string }) {
  const router = useRouter();
  const mobile = useIsMobileViewport();
  const [activeTab, setActiveTab] = useTabParam<TabId>("overview", TAB_IDS);
  const { agent, isLoading, isError, mutate: mutateAgent } = useAgent(agentRef);
  const { models } = useModels();
  const { abilities } = useAgentAbilities(agent?.id);
  const { agentDomains } = useAgentDomains(agent?.id);
  const { mcpServers } = useAgentMcpServers(agent?.id);
  const {
    executions,
    isLoading: executionsLoading,
    isError: executionsError,
    mutate: mutateExecutions,
  } = useAgentExecutions(agent?.id);
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null);

  useEffect(() => {
    if (!agent?.slug || agentRef === agent.slug) return;
    router.replace(`${agentDashboardHref(agent)}${window.location.search}`);
  }, [agent, agentRef, router]);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentPrompt(agentRef)
      .then((config) => { if (!cancelled) setPromptConfig(config); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [agentRef]);

  const effectivePromptConfig = promptConfig ?? { system_prompt: "", developer_prompt: "", templates: {} };
  const handleAgentUpdated = useCallback((updatedAgent?: AgentDefinition) => {
    if (updatedAgent?.slug && updatedAgent.slug !== agentRef) {
      router.replace(`${agentDashboardHref(updatedAgent)}${window.location.search}`);
      return;
    }
    void mutateAgent();
  }, [agentRef, mutateAgent, router]);
  const handleScopesSaved = useCallback(
    (updatedAgent: AgentDefinition) => mutateAgent(updatedAgent, { revalidate: false }),
    [mutateAgent],
  );

  if (isLoading) {
    const loading = <LoadingStatus className="min-h-72" description="Gathering identity, model, capabilities, and recent activity." label="Loading agent" />;
    return mobile
      ? <MobilePageShell backHref="/dashboard/agents" backLabel="Agents" title="Agent">{loading}</MobilePageShell>
      : <><TopBar title="Agents" /><PageContent>{loading}</PageContent></>;
  }

  if (isError || !agent) {
    const missing = <EmptyState description="This agent may have been removed, or its workspace could not be loaded." title="Agent unavailable" tone="error" />;
    return mobile
      ? <MobilePageShell backHref="/dashboard/agents" backLabel="Agents" title="Agent">{missing}</MobilePageShell>
      : <><TopBar title="Agents" /><PageContent>{missing}</PageContent></>;
  }

  if (mobile) {
    return (
      <MobilePageShell backHref="/dashboard/agents" backLabel="Agents" title={agent.name}>
        <MobileAgentDetail
          activeTab={activeTab}
          agent={agent}
          executions={executions}
          executionsError={executionsError}
          executionsLoading={executionsLoading}
          models={models}
          onRefreshExecutions={() => void mutateExecutions()}
          onTabChange={setActiveTab}
          promptConfig={effectivePromptConfig}
          tabs={MOBILE_TABS}
        />
      </MobilePageShell>
    );
  }

  const capabilityActive = CAPABILITY_TAB_IDS.includes(activeTab as CapabilityTab);
  const primaryActive = capabilityActive ? "capabilities" : activeTab;
  const assignmentCounts = {
    abilities: abilities?.length,
    domains: agentDomains?.filter((assignment) => assignment.enabled).length,
    mcp: mcpServers?.length,
  };
  const primaryTabs = PRIMARY_TABS.map((tab) => tab.id === "activity" ? { ...tab, count: executions?.length ?? 0 } : tab);
  const capabilityTabs = CAPABILITY_TABS.map((tab) => {
    const count = tab.id === "abilities"
      ? assignmentCounts.abilities
      : tab.id === "domains"
        ? assignmentCounts.domains
        : tab.id === "mcp"
          ? assignmentCounts.mcp
          : tab.id === "scopes"
            ? agent.platform_scopes.length
            : undefined;
    return { ...tab, count };
  });

  return (
    <>
      <TopBar title="Agents" />
      <PageContent>
        <div className="space-y-5 md:space-y-6">
          <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Agents", href: "/dashboard/agents" }, { label: agent.name }]} />
          <AgentDetailHeader
            abilityCount={assignmentCounts.abilities}
            agent={agent}
            domainCount={assignmentCounts.domains}
            models={models}
            onOpenSettings={() => setActiveTab("settings")}
          />
          <Tabs
            activeTab={primaryActive}
            indicatorAnimation="slide"
            layoutId="agent-detail-primary-tab"
            onChange={(id) => setActiveTab(id === "capabilities" ? "abilities" : id as TabId)}
            tabs={primaryTabs}
          />

          {capabilityActive ? (
            <div className="space-y-4">
              <div>
                <p className="theme-text text-sm font-semibold">Capability assignments</p>
                <p className="theme-text-muted mt-1 text-sm leading-6">{CAPABILITY_DESCRIPTIONS[activeTab as CapabilityTab]}</p>
              </div>
              <Tabs
                activeTab={activeTab}
                indicatorAnimation="slide"
                layoutId="agent-detail-capability-tab"
                mobileVariant="scroll"
                onChange={(id) => setActiveTab(id as CapabilityTab)}
                tabs={capabilityTabs}
              />
            </div>
          ) : null}

          <div className="min-h-[34rem]">
            {activeTab === "overview" ? <AgentOverviewTab agent={agent} assignmentCounts={assignmentCounts} models={models} onNavigate={setActiveTab} /> : null}
            {activeTab === "prompts" ? (
              <AgentPromptEditorContent
                onChange={setPromptConfig}
                onSaved={() => void mutateAgent()}
                promptConfig={effectivePromptConfig}
                role={agent}
              />
            ) : null}
            {activeTab === "abilities" ? <AgentAbilitiesTab agentColor={agent.color} agentId={agent.id} /> : null}
            {activeTab === "domains" ? <AgentDomainsTab agentColor={agent.color} agentId={agent.id} /> : null}
            {activeTab === "media" ? <AgentMediaTab agentId={agent.id} /> : null}
            {activeTab === "mcp" ? <AgentMcpPanel agentId={agent.id} /> : null}
            {activeTab === "scopes" ? <AgentPlatformScopesPanel agent={agent} key={`${agent.id}:${agent.updated_at}`} onSaved={handleScopesSaved} /> : null}
            {activeTab === "activity" ? (
              <TaskExecutionHistory
                emptyDescription="Run a task or conversation with this agent to see its live trace and completed execution record here."
                executions={executions}
                isError={executionsError}
                isLoading={executionsLoading}
                onRefresh={() => void mutateExecutions()}
                title="Agent activity"
              />
            ) : null}
            {activeTab === "settings" ? <AgentSettingsTab agent={agent} models={models} onUpdated={handleAgentUpdated} /> : null}
          </div>
        </div>
      </PageContent>
    </>
  );
}

function AgentPanelLoading({ label }: { label: string }) {
  return <LoadingStatus className="min-h-[28rem]" description="Preparing the selected agent workspace." label={label} />;
}
