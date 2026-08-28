"use client";

import {
  Clock3,
  Cpu,
  Globe2,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { agentIsManaged, agentSourceLabel } from "@/lib/agentWorkspace";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import type { AgentDefinition, Model } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

interface AgentDetailHeaderProps {
  agent: AgentDefinition;
  models?: Model[];
  abilityCount?: number;
  domainCount?: number;
  onOpenSettings: () => void;
}

export function AgentDetailHeader({ agent, models, abilityCount, domainCount, onOpenSettings }: AgentDetailHeaderProps) {
  const assignedModel = models?.find((model) => model.id === agent.model_id);
  const sourceLabel = agentSourceLabel(agent);

  return (
    <section className="theme-surface theme-border relative overflow-hidden rounded-[1.5rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute -right-14 -top-24 h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: agent.color }} aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <RoleIdenticon className="shrink-0" color={agent.color} name={agent.name} roleId={agent.id} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="theme-text truncate text-2xl font-semibold tracking-[-0.03em]">{agent.name}</h1>
              <code className="theme-surface-muted theme-border theme-text-muted rounded-md border px-2 py-0.5 text-[11px]">{agent.slug || agent.id}</code>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${agentIsManaged(agent) ? "bg-purple-500/10 text-purple-700 dark:text-purple-300" : "theme-surface-muted theme-text-muted"}`}>{sourceLabel}</span>
            </div>
            <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">
              {agent.description || "Add a description to define this agent’s focus and responsibilities."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <MetadataPill icon={<Cpu className="h-3 w-3" />} label={assignedModel ? `${assignedModel.model_provider} / ${assignedModel.model}` : "No model assigned"} tone={assignedModel ? "default" : "warning"} />
              <MetadataPill icon={<Sparkles className="h-3 w-3" />} label={formatAssignmentCount(abilityCount, "abilities")} />
              <MetadataPill icon={<Globe2 className="h-3 w-3" />} label={formatAssignmentCount(domainCount, "domains")} />
              <MetadataPill icon={<ShieldCheck className="h-3 w-3" />} label={`${agent.platform_scopes.length} scopes`} />
              {agent.prompt_locked ? <MetadataPill icon={<LockKeyhole className="h-3 w-3" />} label="Prompt locked" /> : null}
              <MetadataPill icon={<Clock3 className="h-3 w-3" />} label={`Updated ${formatExecutionRelativeTime(agent.updated_at)}`} />
            </div>
          </div>
        </div>
        <Button className="w-full sm:w-auto" onClick={onOpenSettings} variant="secondary">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Agent settings
        </Button>
      </div>
    </section>
  );
}

function formatAssignmentCount(count: number | undefined, label: string) {
  return count === undefined ? `${label[0].toUpperCase()}${label.slice(1)}` : `${count} ${label}`;
}

function MetadataPill({ icon, label, tone = "default" }: { icon: React.ReactNode; label: string; tone?: "default" | "warning" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone === "warning" ? "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300" : "theme-surface-muted theme-border theme-text-muted"}`}>
      {icon}
      {label}
    </span>
  );
}
