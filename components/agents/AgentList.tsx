"use client";

import { cn } from "@/lib/cn";
import { useState, useMemo } from "react";
import type { Model, AgentDefinition } from "@/lib/types";
import { ModelCard } from "./ModelCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { MotionList, MotionItem } from "@/components/ui/motion";
import { Button } from "@/components/ui/Button";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { agentColorBg, agentColorText } from "@/lib/agent-colors";


interface AgentListProps {
  agents: Model[] | undefined;
  roles: AgentDefinition[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (agent: Model) => void;
  onView: (agent: Model) => void;
  onDelete: (agent: Model) => void;
  onCreate?: () => void;
}

/** Check if a model has a given agent (via tag match). */
function modelHasAgent(
  model: Model,
  agentName: string,
): boolean {
  return model.tags.includes(agentName);
}

function CardSkeleton() {
  return (
    <div className="theme-border theme-surface rounded-xl border p-5 shadow-xs">
      <div className="flex items-start gap-2">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="mt-3 h-3 w-full" />
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="theme-border theme-surface flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16">
      <div className="rounded-full bg-deep-space-blue-50 p-4 dark:bg-deep-space-blue-900/50">
        <svg
          className="h-10 w-10 text-deep-space-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No models yet</h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
        Create your first AI model to start automating work. Models are assigned to tasks based on their agents.
      </p>
      {onCreate ? (
        <Button onClick={onCreate} className="mt-6">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Model
        </Button>
      ) : null}
    </div>
  );
}

export function AgentList({
  agents,
  roles,
  isLoading,
  isError,
  onEdit,
  onView,
  onDelete,
  onCreate,
}: AgentListProps) {
  const [agentFilter, setAgentFilter] = useState<string>("all");

  // Count models per agent
  const agentCounts = useMemo(() => {
    if (!agents) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const agentDef of roles) {
      let count = 0;
      for (const a of agents) {
        if (modelHasAgent(a, agentDef.name)) {
          count++;
        }
      }
      if (count > 0) counts[agentDef.id] = count;
    }
    return counts;
  }, [agents, roles]);

  // Agents that have at least one model
  const activeAgents = useMemo(
    () => roles.filter((r) => (agentCounts[r.id] ?? 0) > 0),
    [roles, agentCounts],
  );

  // Filter models
  const filtered = useMemo(() => {
    if (!agents) return [];
    if (agentFilter === "all") return agents;
    const agentDef = roles.find((r) => r.id === agentFilter);
    if (!agentDef) return agents;
    return agents.filter((a) => modelHasAgent(a, agentDef.name));
  }, [agents, agentFilter, roles]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
        <svg className="h-10 w-10 text-flag-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Failed to load models</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Please check your connection and try again.</p>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return <EmptyState onCreate={onCreate} />;
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      {activeAgents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setAgentFilter("all")}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap border",
              agentFilter === "all"
                ? "bg-deep-space-blue-50 text-deep-space-blue-700 border-deep-space-blue-200 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300 dark:border-deep-space-blue-700"
                : "text-gray-500 hover:[background:var(--app-hover)] border-transparent dark:text-gray-400",
            )}
          >
            All
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px]",
              agentFilter === "all"
                ? "bg-deep-space-blue-100 text-deep-space-blue-600 dark:bg-deep-space-blue-900/50 dark:text-deep-space-blue-300"
                : "theme-surface-muted theme-text-muted",
            )}>
              {agents.length}
            </span>
          </button>
          {activeAgents.map((agentDef) => {
            const isSelected = agentFilter === agentDef.id;
            return (
              <button
                key={agentDef.id}
                onClick={() => setAgentFilter(isSelected ? "all" : agentDef.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap border",
                  isSelected
                    ? "border-current"
                    : "border-transparent hover:[background:var(--app-hover)]",
                )}
                style={
                  isSelected
                    ? { backgroundColor: agentColorBg(agentDef.color), color: agentColorText(agentDef.color) }
                    : { color: agentColorText(agentDef.color) }
                }
              >
                <RoleIdenticon roleId={agentDef.id} color={agentDef.color} size={14} roleName={agentDef.name} />
                {agentDef.name}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px]"
                  style={
                    isSelected
                      ? { backgroundColor: agentColorBg(agentDef.color), color: agentColorText(agentDef.color) }
                      : { backgroundColor: "rgb(229,231,235)", color: "rgb(107,114,128)" }
                  }
                >
                  {agentCounts[agentDef.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          No models match the current filters.
        </div>
      ) : (
        <MotionList className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {filtered.map((model) => (
            <MotionItem key={model.id}>
              <ModelCard
                model={model}
                onEdit={onEdit}
                onView={onView}
                onDelete={onDelete}
              />
            </MotionItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
