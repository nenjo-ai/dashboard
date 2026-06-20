"use client";

import { useState, useCallback, Suspense } from "react";
import { useModels, useProjects, useAgents, useTabParam } from "@/lib/hooks";
import { deleteModel } from "@/lib/api";
import type { Model } from "@/lib/types";

import { TopBar } from "@/components/layout/TopBar";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { Tabs } from "@/components/ui/Tabs";
import { AgentsSection } from "@/components/agents/AgentsSection";
import { MobileAgentList } from "@/components/agents/MobileAgentList";
import { DomainsSection } from "@/components/agents/DomainsSection";
import { McpServersSection } from "@/components/settings/McpServersSection";
import { MediaProvidersSection } from "@/components/agents/MediaProvidersSection";
import { ModelsSection } from "@/components/agents/ModelsSection";
import { AbilitiesSection } from "@/components/agents/AbilitiesSection";
import { CommandsSection } from "@/components/agents/CommandsSection";
import { ContextBlocksSection } from "@/components/agents/ContextBlocksSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageContent } from "@/components/ui/PageContent";
import { toast } from "@/lib/toast";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

type AgentsTab = "agents" | "domains" | "abilities" | "commands" | "context" | "mcp" | "media" | "models";

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageContent />
    </Suspense>
  );
}

function AgentsPageContent() {
  const isMobileViewport = useIsMobileViewport();
  const { models, isLoading, isError, mutate } = useModels();
  const { projects } = useProjects();
  const { agents } = useAgents();

  const [activeTab, setActiveTab] = useTabParam<AgentsTab>("agents", ["agents", "domains", "abilities", "commands", "context", "mcp", "media", "models"]);
  const [deletingModel, setDeletingModel] = useState<Model | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Use the first project from any model, or fall back to the first project from the projects list.
  const projectId = models?.[0]?.project_id ?? projects?.[0]?.id ?? "";

  const handleDeleteRequest = useCallback((model: Model) => {
    setDeletingModel(model);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingModel) return;
    setDeleteLoading(true);
    try {
      await deleteModel(deletingModel.id);
      setDeletingModel(null);
      mutate();
      toast.success(`"${deletingModel.name}" deleted.`);
    } catch {
      toast.error("Failed to delete model.");
    } finally {
      setDeleteLoading(false);
    }
  }, [deletingModel, mutate]);

  const handleSaved = useCallback(() => {
    mutate();
  }, [mutate]);

  const tabs = [
    { id: "agents" as const, label: "Agents" },
    { id: "domains" as const, label: "Domains" },
    { id: "abilities" as const, label: "Abilities" },
    { id: "commands" as const, label: "Commands" },
    { id: "context" as const, label: "Context" },
    { id: "mcp" as const, label: "MCP" },
    { id: "media" as const, label: "Media" },
    { id: "models" as const, label: "Models" },
  ];

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell title="Agents">
        <div className="space-y-4">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as AgentsTab)}
          />

          {activeTab === "agents" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Define agent identities, prompts, and behavior for different task types.
              </p>
              <MobileAgentList />
            </>
          )}

          {activeTab === "domains" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Slash command domains that guide agents through structured workflows.
              </p>
              <DomainsSection />
            </>
          )}

          {activeTab === "abilities" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Specialized behaviors agents can activate as tools during execution.
              </p>
              <AbilitiesSection />
            </>
          )}

          {activeTab === "commands" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Slash commands installed from packages and plugins.
              </p>
              <CommandsSection />
            </>
          )}

          {activeTab === "context" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Editable templates that control what agents see in their prompts.
              </p>
              <ContextBlocksSection />
            </>
          )}

          {activeTab === "mcp" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                External MCP servers that provide agents with additional tools.
              </p>
              <McpServersSection />
            </>
          )}

          {activeTab === "media" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                Native media providers agents can use for image, video, and audio capabilities.
              </p>
              <MediaProvidersSection />
            </>
          )}

          {activeTab === "models" && (
            <>
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                LLM configurations assigned to agents for execution.
              </p>
              <ModelsSection
                models={models}
                agents={agents ?? []}
                isLoading={isLoading}
                isError={isError}
                onDelete={handleDeleteRequest}
                onSaved={handleSaved}
                projectId={projectId}
              />
            </>
          )}
        </div>
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Agents" />

        <PageContent>
          <div className="mb-6">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as AgentsTab)}
            />
          </div>

          {activeTab === "agents" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Define agent identities, prompts, and behavior for different task types.
              </p>
              <AgentsSection />
            </>
          )}

          {activeTab === "domains" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Slash command domains that guide agents through structured workflows.
              </p>
              <DomainsSection />
            </>
          )}

          {activeTab === "abilities" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Specialized behaviors agents can activate as tools during execution.
              </p>
              <AbilitiesSection />
            </>
          )}

          {activeTab === "commands" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Slash commands installed from packages and plugins.
              </p>
              <CommandsSection />
            </>
          )}

          {activeTab === "context" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Editable templates that control what agents see in their prompts.
              </p>
              <ContextBlocksSection />
            </>
          )}

          {activeTab === "mcp" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                External MCP servers that provide agents with additional tools.
              </p>
              <McpServersSection />
            </>
          )}

          {activeTab === "media" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Native media providers agents can use for image, video, and audio capabilities.
              </p>
              <MediaProvidersSection />
            </>
          )}

          {activeTab === "models" && (
            <>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                LLM configurations assigned to agents for execution.
              </p>
              <ModelsSection
                models={models}
                agents={agents ?? []}
                isLoading={isLoading}
                isError={isError}
                onDelete={handleDeleteRequest}
                onSaved={handleSaved}
                projectId={projectId}
              />
            </>
          )}
        </PageContent>
      </>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!deletingModel}
        onClose={() => setDeletingModel(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Model"
        message={`Are you sure you want to delete "${deletingModel?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
      />
    </>
  );
}
