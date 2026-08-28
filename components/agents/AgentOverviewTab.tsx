import {
  Braces,
  Cpu,
  Globe2,
  ImageIcon,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { agentIsManaged, agentSourceLabel } from "@/lib/agentWorkspace";
import type { AgentDefinition, Model } from "@/lib/types";

type CapabilityTab = "prompts" | "abilities" | "domains" | "media" | "mcp" | "scopes" | "settings";

export function AgentOverviewTab({
  agent,
  models,
  assignmentCounts,
  onNavigate,
}: {
  agent: AgentDefinition;
  models: Model[] | undefined;
  assignmentCounts: { abilities?: number; domains?: number; mcp?: number };
  onNavigate: (tab: CapabilityTab) => void;
}) {
  const model = models?.find((item) => item.id === agent.model_id);
  const assignments = [
    { id: "abilities" as const, label: "Abilities", value: assignmentCounts.abilities ?? "—", description: "Reusable specialist behaviors", icon: <Sparkles className="h-4 w-4" /> },
    { id: "domains" as const, label: "Domains", value: assignmentCounts.domains ?? "—", description: "Structured workflow surfaces", icon: <Globe2 className="h-4 w-4" /> },
    { id: "media" as const, label: "Media", value: "Configure", description: "Analysis and generation models", icon: <ImageIcon className="h-4 w-4" /> },
    { id: "mcp" as const, label: "MCP", value: assignmentCounts.mcp ?? "—", description: "External tool connections", icon: <PlugZap className="h-4 w-4" /> },
    { id: "scopes" as const, label: "Scopes", value: agent.platform_scopes.length, description: "Platform access grants", icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <section className="theme-surface theme-border overflow-hidden rounded-2xl border">
        <div className="theme-border border-b px-5 py-4">
          <h2 className="theme-text text-base font-semibold">Capability map</h2>
          <p className="theme-text-muted mt-1 text-sm">The resources and permissions that shape what this agent can do.</p>
        </div>
        <div className="grid sm:grid-cols-2">
          {assignments.map((assignment, index) => (
            <button
              className={`group flex items-start gap-3 p-5 text-left transition-colors hover:[background:var(--app-hover)] ${index > 0 ? "theme-border border-t" : ""} ${index % 2 === 1 ? "sm:border-l" : ""} ${index === 1 ? "sm:border-t-0" : ""}`}
              key={assignment.id}
              onClick={() => onNavigate(assignment.id)}
              type="button"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">{assignment.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="theme-text text-sm font-medium">{assignment.label}</span>
                  <span className="theme-text-muted text-xs font-semibold">{assignment.value}</span>
                </span>
                <span className="theme-text-muted mt-1 block text-xs leading-5">{assignment.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-5">
        <section className="theme-surface theme-border rounded-2xl border p-5">
          <h2 className="theme-text text-base font-semibold">Operational readiness</h2>
          <div className="mt-4 space-y-3">
            <ReadinessRow
              detail={model ? `${model.model_provider} / ${model.model}` : "Assign a model before running this agent."}
              icon={<Cpu className="h-4 w-4" />}
              label="Chat model"
              ready={Boolean(model)}
              onClick={() => onNavigate("settings")}
            />
            <ReadinessRow
              detail={agent.prompt_locked ? "Managed and protected from local edits." : "Available for workspace editing."}
              icon={agent.prompt_locked ? <LockKeyhole className="h-4 w-4" /> : <Braces className="h-4 w-4" />}
              label="Prompt configuration"
              ready
              onClick={() => onNavigate("prompts")}
            />
            <ReadinessRow
              detail={`${agent.platform_scopes.length} explicit platform grants.`}
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Access policy"
              ready={agent.platform_scopes.length > 0}
              onClick={() => onNavigate("scopes")}
            />
          </div>
        </section>

        <section className="theme-surface theme-border rounded-2xl border p-5">
          <p className="theme-text-muted text-[10px] font-semibold uppercase tracking-[0.14em]">Source</p>
          <p className="theme-text mt-2 text-sm font-medium">{agentSourceLabel(agent)} agent</p>
          <p className="theme-text-muted mt-1 text-xs leading-5">
            {agentIsManaged(agent)
              ? "This identity is backed by an installed package or managed source. Source-controlled prompt content may be read-only."
              : "This identity belongs to the workspace and can be configured directly."}
          </p>
        </section>
      </div>
    </div>
  );
}

function ReadinessRow({
  detail,
  icon,
  label,
  ready,
  onClick,
}: {
  detail: string;
  icon: React.ReactNode;
  label: string;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <button className="theme-border flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:[background:var(--app-hover)]" onClick={onClick} type="button">
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ready ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-600 dark:text-amber-300"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="theme-text block text-sm font-medium">{label}</span>
        <span className="theme-text-muted mt-0.5 block text-xs leading-5">{detail}</span>
      </span>
    </button>
  );
}
