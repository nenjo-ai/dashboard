"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Cpu, Sparkles } from "lucide-react";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAgentAbilities, useAgentDomains, useAgents, useModels } from "@/lib/hooks";
import type { AgentDefinition } from "@/lib/types";

function AgentMetaChip({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
      {icon}
      {label}
    </span>
  );
}

function MobileAgentRow({ agent }: { agent: AgentDefinition }) {
  const { agentDomains } = useAgentDomains(agent.id);
  const { abilities } = useAgentAbilities(agent.id);
  const { models } = useModels();

  const domainCount = agentDomains?.filter((assignment) => assignment.enabled).length ?? 0;
  const abilityCount = abilities?.length ?? 0;
  const model = models?.find((item) => item.id === agent.model_id);

  return (
    <Link
      href={`/dashboard/agents/${agent.id}`}
      className="group block rounded-[1.6rem] border border-black/10 bg-transparent p-4 transition-transform active:scale-[0.99] dark:border-white/10"
    >
      <div className="flex items-start gap-3">
        <RoleIdenticon
          roleId={agent.id}
          color={agent.color}
          size={48}
          className="shrink-0"
          roleName={agent.name}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">
                {agent.display_name || agent.name}
              </h2>
              <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400 dark:text-gray-500">
                {agent.name}
              </p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-active:translate-x-0.5 dark:text-gray-600" />
          </div>
          {agent.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {agent.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <AgentMetaChip label={agent.source_agent_id ? "System" : "Custom"} />
        <AgentMetaChip icon={<Sparkles className="h-3 w-3" />} label={`${domainCount} domains`} />
        <AgentMetaChip icon={<Sparkles className="h-3 w-3" />} label={`${abilityCount} abilities`} />
        <AgentMetaChip
          icon={<Cpu className="h-3 w-3" />}
          label={model ? model.model : "No model"}
        />
      </div>
    </Link>
  );
}

export function MobileAgentList() {
  const { agents, isLoading, isError } = useAgents();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.6rem] border border-black/10 bg-transparent p-4 dark:border-white/10"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[1.6rem] border border-red-200/80 bg-red-50/90 p-5 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
        Failed to load agents.
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="rounded-[1.8rem] border border-dashed border-black/10 bg-transparent px-6 py-12 text-center dark:border-white/10">
        <p className="text-base font-semibold text-gray-950 dark:text-gray-50">No agents yet</p>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Agents will appear here as a clean mobile stack instead of the desktop grid.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <MobileAgentRow key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
