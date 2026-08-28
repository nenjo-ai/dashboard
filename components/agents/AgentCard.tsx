import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  Cpu,
  Globe2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { agentSourceLabel } from "@/lib/agentWorkspace";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import type { AgentDefinition, Model } from "@/lib/types";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

interface AgentCardProps {
  agent: AgentDefinition;
  models: Model[] | undefined;
  onDelete?: (agent: AgentDefinition) => void;
  isDeleting?: boolean;
}

export function AgentCard({ agent, models, onDelete, isDeleting }: AgentCardProps) {
  const assignedModel = models?.find((model) => model.id === agent.model_id);
  const agentRef = agent.slug?.trim() || agent.id;
  const sourceLabel = agentSourceLabel(agent);
  // Collection responses may intentionally omit expanded assignments. An em dash
  // keeps the overview honest without adding a request per card.
  const domainCount = agent.domain_ids?.length ?? "—";
  // Ability assignments are expanded by the detail endpoint, not the list API.
  const abilityCount = "View";
  const mcpCount = agent.mcp_servers?.length ?? "—";

  return (
    <article className="theme-surface theme-border group relative flex min-h-64 overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-deep-space-blue-300/70 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:hover:border-deep-space-blue-500/30">
      <Link
        aria-label={`Open ${agent.name}`}
        className="flex min-w-0 flex-1 flex-col p-5 outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-deep-space-blue-400"
        href={`/dashboard/agents/${encodeURIComponent(agentRef)}`}
        prefetch={false}
      >
        <div className="flex items-start gap-3.5 pr-8">
          <RoleIdenticon className="shrink-0" color={agent.color} name={agent.name} roleId={agent.id} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="theme-text truncate text-base font-semibold tracking-[-0.015em]">{agent.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceLabel === "Managed" ? "bg-purple-500/10 text-purple-700 dark:text-purple-300" : sourceLabel === "System" ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "theme-surface-muted theme-text-muted"}`}>
                {sourceLabel}
              </span>
            </div>
            <p className="theme-text-muted mt-0.5 truncate font-mono text-[11px]">{agent.slug || agent.id}</p>
          </div>
          <ArrowUpRight className="theme-text-muted h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </div>

        <p className="theme-text-muted mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6">
          {agent.description || "Add a description to define this agent’s focus and responsibilities."}
        </p>

        <div className={`mt-4 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${assignedModel ? "theme-border theme-surface-muted" : "border-amber-200/80 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10"}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${assignedModel ? "bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300" : "bg-amber-500/10 text-amber-600 dark:text-amber-300"}`}>
            {assignedModel ? <Cpu className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="theme-text truncate text-xs font-medium">{assignedModel?.model ?? "Model required"}</p>
            <p className="theme-text-muted mt-0.5 truncate text-[10px]">
              {assignedModel ? `${assignedModel.model_provider} · temperature ${assignedModel.temperature.toFixed(1)}` : "Assign a chat model before running this agent"}
            </p>
          </div>
        </div>

        <div className="theme-border mt-auto grid grid-cols-4 gap-2 border-t pt-4">
          <AgentMetric icon={<Sparkles className="h-3.5 w-3.5" />} label="Abilities" value={abilityCount} />
          <AgentMetric icon={<Globe2 className="h-3.5 w-3.5" />} label="Domains" value={domainCount} />
          <AgentMetric icon={<PlugZap className="h-3.5 w-3.5" />} label="MCP" value={mcpCount} />
          <AgentMetric icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Scopes" value={agent.platform_scopes.length} />
        </div>
        <p className="theme-text-muted mt-3 text-[10px]">Updated {formatExecutionRelativeTime(agent.updated_at)}</p>
      </Link>

      {onDelete && agent.name !== "system" ? (
        <button
          aria-label={`Delete ${agent.name}`}
          className="theme-text-muted absolute right-3.5 top-3.5 z-10 rounded-lg p-2 opacity-0 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-flag-red-500 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 group-hover:opacity-100 disabled:opacity-50 dark:hover:text-flag-red-400"
          disabled={isDeleting}
          onClick={() => onDelete(agent)}
          title="Delete agent"
          type="button"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

function AgentMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="min-w-0 text-center">
      <span className="theme-text-muted mx-auto flex items-center justify-center gap-1 text-xs font-semibold">{icon}{value}</span>
      <span className="theme-text-muted mt-0.5 block truncate text-[9px] uppercase tracking-[0.08em]">{label}</span>
    </div>
  );
}
