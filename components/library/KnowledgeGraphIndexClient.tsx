"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, Network, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
import { useKnowledgePacks, useQueryParam } from "@/lib/hooks";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import {
  isLibraryKnowledgeGraph,
  knowledgeGraphSourceDetail,
  knowledgeGraphSourceLabel,
  selectKnowledgeGraphs,
  summarizeKnowledgeGraphs,
  type KnowledgeGraphSourceFilter,
} from "@/lib/libraryWorkspace";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

const KnowledgeGraphCreateDialog = dynamic(() => import("./KnowledgeGraphCreateDialog").then((module) => module.KnowledgeGraphCreateDialog), { ssr: false });

export function KnowledgeGraphIndexClient() {
  const mobile = useIsMobileViewport();
  const searchParams = useSearchParams();
  const { packs, isLoading, isError, mutate } = useKnowledgePacks();
  const [query = "", setQuery] = useQueryParam("q", "");
  const [rawSource = "all", setSource] = useQueryParam("source", "all");
  const [creating, setCreating] = useState(searchParams.get("create") === "1");
  const source: KnowledgeGraphSourceFilter = rawSource === "workspace" || rawSource === "managed" ? rawSource : "all";
  const deferredQuery = useDeferredValue(query);
  const graphs = useMemo(() => (packs ?? []).filter(isLibraryKnowledgeGraph), [packs]);
  const visibleGraphs = useMemo(() => selectKnowledgeGraphs(graphs, deferredQuery, source), [deferredQuery, graphs, source]);
  const summary = useMemo(() => summarizeKnowledgeGraphs(graphs), [graphs]);
  const sourceOptions: Array<{ id: KnowledgeGraphSourceFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: summary.totalCount },
    { id: "workspace", label: "Workspace", count: summary.workspaceCount },
    { id: "managed", label: "Managed", count: summary.managedCount },
  ];

  const body = <div className="space-y-5 md:space-y-6">
    <div className="hidden md:block"><Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Library", href: "/dashboard/library" }, { label: "Knowledge Graphs" }]} /></div>
    <PageIntro eyebrow="Connected knowledge" description="Create focused graphs of documents and relationships that agents can discover and reuse." actions={!mobile ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New graph</Button> : undefined} className="mb-0" />
    <LibraryTabs />
    <section className="theme-surface theme-border space-y-3 rounded-2xl border p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search knowledge graphs</span><Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><input className="theme-surface theme-border w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm" type="search" placeholder="Search graphs, selectors, or descriptions…" value={query} onChange={(event) => setQuery(event.target.value || undefined)} /></label>
        <div className="theme-surface-muted theme-border grid grid-cols-3 rounded-xl border p-1" aria-label="Graph source">
          {sourceOptions.map((option) => <button aria-pressed={source === option.id} className={`rounded-lg px-3 py-2 text-xs font-medium ${source === option.id ? "theme-surface-elevated theme-border theme-text border shadow-xs" : "theme-text-muted"}`} key={option.id} onClick={() => setSource(option.id === "all" ? undefined : option.id)} type="button">{option.label} <span className="ml-1 opacity-70">{option.count}</span></button>)}
        </div>
      </div>
    </section>

    {isLoading ? <LoadingStatus className="min-h-64" label="Loading knowledge graphs" /> : isError ? <div className="rounded-2xl border border-red-200 bg-red-50/50 px-6 py-10 text-center dark:border-red-900/60 dark:bg-red-950/20"><p className="text-sm font-medium text-red-600 dark:text-red-300">Knowledge graphs are temporarily unavailable.</p></div> : visibleGraphs.length ? <section className="theme-surface theme-border overflow-hidden rounded-2xl border">
      <div className="theme-border flex items-center justify-between border-b px-4 py-3.5 sm:px-5"><div><h2 className="theme-text text-sm font-semibold">Knowledge graphs</h2><p className="theme-text-muted mt-0.5 text-xs">{visibleGraphs.length} graph{visibleGraphs.length === 1 ? "" : "s"} in this view</p></div></div>
      <div className="theme-border divide-y">{visibleGraphs.map((graph) => <Link className="group flex items-center gap-3 px-4 py-4 transition-colors [content-visibility:auto] hover:[background:var(--app-hover)] sm:gap-4 sm:px-5" href={`/dashboard/library/graphs/${graph.slug}`} key={graph.id}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Network className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="theme-text block truncate text-sm font-semibold">{graph.name}</span><span className="theme-text-muted mt-1 block truncate text-xs">{graph.description || "No description yet."}</span><span className="theme-text-muted mt-2 flex flex-wrap items-center gap-1.5 text-[11px]"><code className="theme-surface-muted rounded px-1.5 py-0.5">{graph.selector || `lib:${graph.slug}`}</code><span>·</span><span>{knowledgeGraphSourceLabel(graph)}</span>{knowledgeGraphSourceDetail(graph) ? <><span>·</span><span>{knowledgeGraphSourceDetail(graph)}</span></> : null}<span>·</span><span>Updated {formatExecutionRelativeTime(graph.updated_at)}</span></span></span>
        {graph.version ? <span className="theme-surface-muted theme-text-muted hidden rounded-full px-2.5 py-1 text-xs sm:block">v{graph.version}</span> : null}<ChevronRight className="theme-text-muted h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>)}</div>
    </section> : <div className="theme-surface theme-border flex min-h-72 flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center"><span className="theme-surface-muted theme-text-muted flex h-11 w-11 items-center justify-center rounded-xl"><Network className="h-5 w-5" /></span><h2 className="theme-text mt-4 text-base font-semibold">{query || source !== "all" ? "No graphs match this view" : "Create your first knowledge graph"}</h2><p className="theme-text-muted mt-1.5 max-w-md text-sm leading-6">{query || source !== "all" ? "Try a different search or source filter." : "Add focused documents and relationships that agents can retrieve across conversations and workflows."}</p>{!query && source === "all" ? <Button className="mt-5" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create graph</Button> : null}</div>}
    {creating ? <KnowledgeGraphCreateDialog open onClose={() => setCreating(false)} onCreated={() => void mutate()} /> : null}
  </div>;

  return mobile
    ? <MobilePageShell title="Knowledge Graphs" backHref="/dashboard/library" actionLabel="New graph" onAction={() => setCreating(true)}>{body}</MobilePageShell>
    : <><TopBar title="Library" /><PageContent>{body}</PageContent></>;
}
