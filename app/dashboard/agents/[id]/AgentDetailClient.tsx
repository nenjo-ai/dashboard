"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { useAgent, useModels, useTabParam } from "@/lib/hooks";
import { fetchAgentPrompt } from "@/lib/api";
import type { AgentDefinition, PromptConfig } from "@/lib/types";

import { MobileAgentDetail } from "@/components/agents/MobileAgentDetail";
import { TopBar } from "@/components/layout/TopBar";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { Tabs } from "@/components/ui/Tabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageContent } from "@/components/ui/PageContent";
import { AgentDetailHeader } from "@/components/agents/AgentDetailHeader";
import { AgentPromptEditorContent } from "@/components/agents/AgentPromptEditor";
import { PromptPreviewContent } from "@/components/agents/PromptPreviewModal";
import { AgentAbilitiesTab } from "@/components/agents/AgentAbilitiesTab";
import { AgentDomainsTab } from "@/components/agents/AgentDomainsTab";
import { AgentMediaTab } from "@/components/agents/AgentMediaTab";
import { AgentMcpPanel } from "@/components/agents/AgentMcpPanel";
import { AgentPlatformScopesPanel } from "@/components/agents/AgentPlatformScopesPanel";
import { AgentSettingsTab } from "@/components/agents/AgentSettingsTab";
import { AgentHeartbeatTab } from "@/components/agents/AgentHeartbeatTab";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

const TAB_IDS = [
  "prompts",
  "preview",
  "abilities",
  "domains",
  "media",
  "mcp",
  "heartbeat",
  "scopes",
  "settings",
] as const;

type TabId = (typeof TAB_IDS)[number];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "prompts",
    label: "Prompts",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      </svg>
    ),
  },
  {
    id: "preview",
    label: "Preview",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: "abilities",
    label: "Abilities",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: "domains",
    label: "Domains",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    id: "media",
    label: "Media",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    id: "mcp",
    label: "MCP",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    id: "heartbeat",
    label: "Heartbeat",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12h-3.75m-9 0H3m18 0a9 9 0 11-18 0 9 9 0 0118 0zm-9-4.5v9" />
      </svg>
    ),
  },
  {
    id: "scopes",
    label: "Scopes",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function agentDashboardHref(agent: Pick<AgentDefinition, "id" | "slug">) {
  const agentRef = agent.slug?.trim() || agent.id;
  return `/dashboard/agents/${encodeURIComponent(agentRef)}`;
}

export function AgentDetailClient({ agentRef }: { agentRef: string }) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport();

  const [activeTab, setActiveTab] = useTabParam("prompts", TAB_IDS);
  const { agent, isLoading, mutate: mutateAgent } = useAgent(agentRef);
  const { models } = useModels();

  // Prompt editor state — loaded from the dedicated prompt endpoint.
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null);

  useEffect(() => {
    if (!agent?.slug || agentRef === agent.slug) return;
    router.replace(`${agentDashboardHref(agent)}${window.location.search}`);
  }, [agent, agentRef, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrompt() {
      if (!agentRef) return;
      try {
        const nextPromptConfig = await fetchAgentPrompt(agentRef);
        if (!cancelled) {
          setPromptConfig(nextPromptConfig);
        }
      } catch {
        // Keep the fallback prompt state if prompt fetch fails.
      }
    }

    loadPrompt();
    return () => {
      cancelled = true;
    };
  }, [agentRef]);

  // Initialize promptConfig when agent loads (only once)
  const effectivePromptConfig = promptConfig ?? {
    system_prompt: "",
    developer_prompt: "",
    templates: {},
  };

  const handlePromptChange = useCallback((config: PromptConfig) => {
    setPromptConfig(config);
  }, []);

  const handlePromptSaved = useCallback(() => {
    mutateAgent();
  }, [mutateAgent]);

  const handleAgentUpdated = useCallback(
    (updatedAgent?: AgentDefinition) => {
      if (updatedAgent?.slug && updatedAgent.slug !== agentRef) {
        router.replace(`${agentDashboardHref(updatedAgent)}${window.location.search}`);
        return;
      }
      mutateAgent();
    },
    [agentRef, mutateAgent, router],
  );

  if (isLoading) {
    return isMobileViewport ? (
      <MobilePageShell title="Agent" backHref="/dashboard/agents" backLabel="Agents">
          <div className="flex h-48 items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        </MobilePageShell>
    ) : (
      <>
          <TopBar title="Agent" />
          <PageContent>
            <div className="flex h-64 items-center justify-center">
              <svg className="h-6 w-6 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </PageContent>
      </>
    );
  }

  if (!agent) {
    return isMobileViewport ? (
      <MobilePageShell title="Agent" backHref="/dashboard/agents" backLabel="Agents">
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
            <p className="text-sm">Agent not found</p>
          </div>
        </MobilePageShell>
    ) : (
      <>
          <TopBar title="Agent" />
          <PageContent>
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-sm">Agent not found</p>
            </div>
          </PageContent>
      </>
    );
  }

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell
        title={agent.display_name || agent.name}
        backHref="/dashboard/agents"
        backLabel="Agents"
      >
        <MobileAgentDetail
          agent={agent}
          promptConfig={effectivePromptConfig}
          models={models}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as TabId)}
          tabs={TABS}
        />
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Agent" />

        <PageContent className="space-y-6">
          <Breadcrumbs
            items={[
              { label: "Agents", href: "/dashboard/agents" },
              { label: agent.display_name || agent.name },
            ]}
          />

          <AgentDetailHeader agent={agent} models={models} />

          <Tabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            layoutId="agent-detail-tab"
          />

          <div className="min-h-[800px]">
            {activeTab === "prompts" && agent && (
              <AgentPromptEditorContent
                role={agent}
                promptConfig={effectivePromptConfig}
                onSaved={handlePromptSaved}
                onChange={handlePromptChange}
              />
            )}

            {activeTab === "preview" && agent && (
              <PromptPreviewContent roleId={agent.id} />
            )}

            {activeTab === "abilities" && agent && (
              <AgentAbilitiesTab agentId={agent.id} agentColor={agent.color} />
            )}

            {activeTab === "domains" && agent && (
              <AgentDomainsTab agentId={agent.id} agentColor={agent.color} />
            )}

            {activeTab === "media" && agent && (
              <AgentMediaTab agentId={agent.id} />
            )}

            {activeTab === "mcp" && agent && (
              <AgentMcpPanel agentId={agent.id} />
            )}

            {activeTab === "heartbeat" && agent && (
              <AgentHeartbeatTab
                agentId={agent.id}
                initialInterval={agent.heartbeat?.interval ?? null}
                onSaved={() => mutateAgent()}
              />
            )}

            {activeTab === "scopes" && agent && (
              <AgentPlatformScopesPanel agent={agent} onSaved={() => mutateAgent()} />
            )}

            {activeTab === "settings" && agent && (
              <AgentSettingsTab agent={agent} onUpdated={handleAgentUpdated} />
            )}
          </div>
        </PageContent>
      </>
      )}
    </>
  );
}
