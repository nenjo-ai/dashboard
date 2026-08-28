"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Bot, Boxes, Cpu, Plus, Search, ShieldCheck, TriangleAlert } from "lucide-react";

import {
  filterAndSortAgents,
  summarizeAgentWorkspace,
  type AgentWorkspaceFilter,
  type AgentWorkspaceSort,
} from "@/lib/agentWorkspace";
import { deleteAgent } from "@/lib/api";
import { useAgents, useModels } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { AgentDefinition } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { MotionItem, MotionList } from "@/components/ui/motion";
import { Select } from "@/components/ui/Select";
import { AgentCard } from "./AgentCard";

const AgentCreateDialog = dynamic(
  () => import("./MobileAgentCreateDialog").then((module) => module.MobileAgentCreateDialog),
  { ssr: false },
);

export function AgentsSection() {
  const { agents, isLoading, isError, error, mutate } = useAgents();
  const { models } = useModels();
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<AgentWorkspaceFilter>("all");
  const [sort, setSort] = useState<AgentWorkspaceSort>("updated");
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AgentDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summary = useMemo(() => summarizeAgentWorkspace(agents ?? []), [agents]);
  const visibleAgents = useMemo(
    () => filterAndSortAgents(agents ?? [], deferredQuery, filter, sort),
    [agents, deferredQuery, filter, sort],
  );

  const removeAgent = useCallback(async () => {
    if (!confirmDeleteAgent) return;
    setDeleting(true);
    try {
      await deleteAgent(confirmDeleteAgent.id);
      toast.success(`“${confirmDeleteAgent.name}” deleted.`);
      setConfirmDeleteAgent(null);
      await mutate();
    } catch {
      toast.error("Failed to delete agent.");
    } finally {
      setDeleting(false);
    }
  }, [confirmDeleteAgent, mutate]);

  if (isLoading) {
    return <LoadingStatus className="min-h-72" description="Gathering agent identities, model readiness, and assignments." label="Loading agents" />;
  }

  if (isError) {
    return (
      <EmptyState
        action={<Button onClick={() => void mutate()} variant="secondary">Try again</Button>}
        description={error?.message ?? "Check the local worker connection and try again."}
        icon={<TriangleAlert className="h-5 w-5" />}
        title="Agents could not be loaded"
        tone="error"
      />
    );
  }

  return (
    <div className="space-y-5">
      {agents?.length ? (
        <section aria-label="Agent summary" className="theme-surface theme-border grid overflow-hidden rounded-2xl border sm:grid-cols-4">
          <SummaryMetric icon={<Bot className="h-4 w-4" />} label="Agents" value={summary.agents} />
          <SummaryMetric className="theme-border border-t sm:border-l sm:border-t-0" icon={<Cpu className="h-4 w-4" />} label="Model ready" value={summary.ready} />
          <SummaryMetric className="theme-border border-t sm:border-l sm:border-t-0" icon={<ShieldCheck className="h-4 w-4" />} label="Custom" value={summary.custom} />
          <SummaryMetric className="theme-border border-t sm:border-l sm:border-t-0" icon={<Boxes className="h-4 w-4" />} label="Managed" value={summary.managed} />
        </section>
      ) : null}

      {agents?.length ? (
        <div className="theme-surface theme-border flex flex-col gap-3 rounded-2xl border p-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search agents</span>
            <Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
            <Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search names, roles, models, or slugs" value={query} />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <label>
              <span className="sr-only">Filter agents</span>
              <Select className="sm:w-40" onChange={(event) => setFilter(event.target.value as AgentWorkspaceFilter)} value={filter}>
                <option value="all">All agents</option>
                <option value="ready">Model ready</option>
                <option value="needs_model">Needs model</option>
                <option value="custom">Custom</option>
                <option value="managed">Managed</option>
              </Select>
            </label>
            <label>
              <span className="sr-only">Sort agents</span>
              <Select className="sm:w-44" onChange={(event) => setSort(event.target.value as AgentWorkspaceSort)} value={sort}>
                <option value="updated">Recently updated</option>
                <option value="name">Name</option>
              </Select>
            </label>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New agent
          </Button>
        </div>
      ) : null}

      {!agents?.length ? (
        <EmptyState
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create agent</Button>}
          description="Define a focused identity, assign a model, and add only the capabilities it needs."
          icon={<Bot className="h-5 w-5" />}
          title="Create your first agent"
        />
      ) : visibleAgents.length ? (
        <MotionList className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleAgents.map((agent) => (
            <MotionItem className="h-full" key={agent.id}>
              <AgentCard
                agent={agent}
                isDeleting={deleting && confirmDeleteAgent?.id === agent.id}
                models={models}
                onDelete={setConfirmDeleteAgent}
              />
            </MotionItem>
          ))}
        </MotionList>
      ) : (
        <EmptyState
          action={<Button onClick={() => { setQuery(""); setFilter("all"); }} variant="secondary">Clear filters</Button>}
          description="Try a different name, model, source type, or readiness filter."
          icon={<Search className="h-5 w-5" />}
          title="No matching agents"
        />
      )}

      {createOpen ? (
        <AgentCreateDialog
          agents={agents ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => { await mutate(); }}
          open
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Delete agent"
        loading={deleting}
        message={`Delete “${confirmDeleteAgent?.name}”? Its assignments will be removed and this action cannot be undone.`}
        onClose={() => setConfirmDeleteAgent(null)}
        onConfirm={removeAgent}
        open={Boolean(confirmDeleteAgent)}
        title="Delete agent"
        variant="danger"
      />
    </div>
  );
}

function SummaryMetric({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 sm:px-5 ${className ?? ""}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">{icon}</span>
      <div>
        <p className="theme-text text-lg font-semibold leading-none">{value}</p>
        <p className="theme-text-muted mt-1 text-xs">{label}</p>
      </div>
    </div>
  );
}
