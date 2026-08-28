"use client";

import type { ReactNode } from "react";
import { Cpu, Globe, PlugZap, ShieldCheck } from "lucide-react";
import { agentSourceLabel } from "@/lib/agentWorkspace";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { Tabs } from "@/components/ui/Tabs";
import { AgentMediaTab } from "@/components/agents/AgentMediaTab";
import { AgentOverviewTab } from "@/components/agents/AgentOverviewTab";
import { TaskExecutionHistory } from "@/components/tasks/TaskExecutionHistory";
import { useAgentAbilities, useAgentDomains, useAgentMcpServers } from "@/lib/hooks";
import type { AgentDefinition, ExecutionDetails, Model, PromptConfig } from "@/lib/types";

type MobileAgentTab =
  | "overview"
  | "prompts"
  | "abilities"
  | "domains"
  | "media"
  | "mcp"
  | "scopes"
  | "activity"
  | "settings";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatChip({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-transparent px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:text-gray-300">
      {icon}
      {label}
    </span>
  );
}

function ReadOnlyPromptCard({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
      <pre className="mt-3 overflow-x-auto rounded-[1rem] border border-black/10 bg-transparent px-3 py-3 text-[12px] leading-6 text-gray-700 dark:border-white/10 dark:text-gray-200">
        <code>{value || "No content yet."}</code>
      </pre>
    </section>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/5 py-3 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/10">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

export function MobileAgentDetail({
  agent,
  promptConfig,
  models,
  activeTab,
  onTabChange,
  tabs,
  executions,
  executionsLoading,
  executionsError,
  onRefreshExecutions,
}: {
  agent: AgentDefinition;
  promptConfig: PromptConfig;
  models: Model[] | undefined;
  activeTab: MobileAgentTab;
  onTabChange: (tab: MobileAgentTab) => void;
  tabs: { id: MobileAgentTab; label: string; icon: ReactNode }[];
  executions: ExecutionDetails[] | undefined;
  executionsLoading: boolean;
  executionsError: boolean;
  onRefreshExecutions: () => void;
}) {
  const { abilities } = useAgentAbilities(agent.id);
  const { agentDomains } = useAgentDomains(agent.id);
  const { mcpServers } = useAgentMcpServers(agent.id);
  const assignedModel = models?.find((item) => item.id === agent.model_id);
  const enabledDomains = agentDomains?.filter((item) => item.enabled) ?? [];

  return (
    <div className="space-y-4 md:hidden">
      <section className="rounded-[1.7rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <RoleIdenticon
            roleId={agent.id}
            color={agent.color}
            size={56}
            className="shrink-0"
            name={agent.name}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-950 dark:text-gray-50">
              {agent.name}
            </h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {agent.slug || agent.id}
            </p>
            {agent.description && (
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{agent.description}</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatChip icon={<ShieldCheck className="h-3 w-3" />} label={agentSourceLabel(agent)} />
          <StatChip icon={<Cpu className="h-3 w-3" />} label={assignedModel?.model ?? "No model"} />
          <StatChip icon={<Globe className="h-3 w-3" />} label={`${enabledDomains.length} domains`} />
          <StatChip icon={<PlugZap className="h-3 w-3" />} label={`${abilities?.length ?? 0} abilities`} />
          <StatChip icon={<ShieldCheck className="h-3 w-3" />} label={`${agent.platform_scopes.length} scopes`} />
        </div>
      </section>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => onTabChange(id as MobileAgentTab)} layoutId="agent-detail-tab-mobile" mobileVariant="select" />

      {activeTab === "overview" && (
        <AgentOverviewTab
          agent={agent}
          assignmentCounts={{
            abilities: abilities?.length,
            domains: agentDomains ? enabledDomains.length : undefined,
            mcp: mcpServers?.length,
          }}
          models={models}
          onNavigate={onTabChange}
        />
      )}

      {activeTab === "prompts" && (
        <div className="space-y-4">
          <ReadOnlyPromptCard
            title="System prompt"
            description="Core system instructions used for this agent."
            value={promptConfig.system_prompt}
          />
          <ReadOnlyPromptCard
            title="Developer prompt"
            description="Developer-level guidance layered onto execution."
            value={promptConfig.developer_prompt}
          />
          {Object.entries(promptConfig.templates ?? {}).map(([key, value]) => (
            <ReadOnlyPromptCard
              key={key}
              title={key.replaceAll("_", " ")}
              description="Task-specific template"
              value={value}
            />
          ))}
        </div>
      )}

      {activeTab === "abilities" && (
        <div className="space-y-3">
          {(abilities ?? []).map((ability) => (
            <section key={ability.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
                {ability.name}
              </h3>
              {ability.description && (
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{ability.description}</p>
              )}
            </section>
          ))}
          {(!abilities || abilities.length === 0) && (
            <div className="rounded-[1.4rem] border border-dashed border-black/10 bg-transparent p-5 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
              No abilities assigned.
            </div>
          )}
        </div>
      )}

      {activeTab === "domains" && (
        <div className="space-y-3">
          {enabledDomains.map((assignment) => (
            <section key={assignment.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
                {assignment.domain?.name || assignment.domain_id}
              </h3>
              {assignment.domain?.description && (
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{assignment.domain.description}</p>
              )}
            </section>
          ))}
          {enabledDomains.length === 0 && (
            <div className="rounded-[1.4rem] border border-dashed border-black/10 bg-transparent p-5 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
              No domains enabled.
            </div>
          )}
        </div>
      )}

      {activeTab === "media" && (
        <AgentMediaTab agentId={agent.id} />
      )}

      {activeTab === "mcp" && (
        <div className="space-y-3">
          {(mcpServers ?? []).map((server) => (
            <section key={server.id} className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
              <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">{server.name}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{server.url}</p>
            </section>
          ))}
          {(!mcpServers || mcpServers.length === 0) && (
            <div className="rounded-[1.4rem] border border-dashed border-black/10 bg-transparent p-5 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
              No MCP servers connected.
            </div>
          )}
        </div>
      )}

      {activeTab === "scopes" && (
        <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
          <div className="flex flex-wrap gap-2">
            {agent.platform_scopes.length > 0 ? agent.platform_scopes.map((scope) => (
              <span key={scope} className="rounded-full border border-black/5 bg-black/[0.03] px-3 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
                {scope}
              </span>
            )) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No platform scopes assigned.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "activity" && (
        <TaskExecutionHistory
          emptyDescription="Run a task or conversation with this agent to see its completed execution record here."
          executions={executions}
          isError={executionsError}
          isLoading={executionsLoading}
          onRefresh={onRefreshExecutions}
          title="Agent activity"
        />
      )}

      {activeTab === "settings" && (
        <section className="rounded-[1.4rem] border border-black/10 bg-transparent p-4 dark:border-white/10">
          <MetadataRow label="Type" value={agentSourceLabel(agent)} />
          <MetadataRow label="Prompt lock" value={agent.prompt_locked ? "Locked" : "Editable on desktop"} />
          <MetadataRow label="Model" value={assignedModel?.model ?? "Unassigned"} />
          <MetadataRow label="Created" value={formatTimestamp(agent.created_at)} />
          <MetadataRow label="Updated" value={formatTimestamp(agent.updated_at)} />
        </section>
      )}
    </div>
  );
}
