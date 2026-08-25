"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { FileText, GitBranch, LayoutDashboard, Network, Settings2, Share2, Trash2 } from "lucide-react";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { deleteKnowledgePack, updateKnowledgePack } from "@/lib/api";
import { useKnowledgeItems, useKnowledgePacks, useTabParam } from "@/lib/hooks";
import { knowledgeGraphSourceLabel } from "@/lib/libraryWorkspace";
import { useSafeRouter } from "@/lib/safeRouter";
import type { KnowledgePack } from "@/lib/types";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

const KnowledgeSection = dynamic(() => import("@/components/knowledge/KnowledgeSection").then((module) => module.KnowledgeSection), { ssr: false, loading: () => <LoadingStatus className="min-h-[34rem]" label="Loading graph documents" description="Preparing document content, metadata, and relationships." /> });
const SourceKnowledgeSection = dynamic(() => import("@/components/knowledge/SourceKnowledgeSection").then((module) => module.SourceKnowledgeSection), { ssr: false, loading: () => <LoadingStatus className="min-h-[34rem]" label="Loading managed graph" /> });

const TABS = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "documents", label: "Documents", icon: <FileText className="h-4 w-4" /> },
  { id: "map", label: "Map", icon: <Share2 className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings2 className="h-4 w-4" /> },
] as const;
type GraphTab = (typeof TABS)[number]["id"];

export function KnowledgeGraphDetailClient({ graphRef }: { graphRef: string }) {
  const mobile = useIsMobileViewport();
  const router = useSafeRouter();
  const [activeTab, setActiveTab] = useTabParam<GraphTab>("overview", ["overview", "documents", "map", "settings"] as const);
  const { packs, isLoading, isError, mutate } = useKnowledgePacks();
  const graph = packs?.find((pack) => pack.slug === graphRef || pack.id === graphRef);
  const { items, isLoading: itemsLoading } = useKnowledgeItems(graph?.slug);
  const [workspaceVisited, setWorkspaceVisited] = useState(activeTab === "documents" || activeTab === "map");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!graph) return;
    setName(graph.name);
    setDescription(graph.description ?? "");
  }, [graph]);
  useEffect(() => {
    if (activeTab === "documents" || activeTab === "map") setWorkspaceVisited(true);
  }, [activeTab]);

  const relationshipCount = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items ?? []) for (const edge of item.edges ?? []) ids.add(edge.id);
    return ids.size;
  }, [items]);

  if (isLoading) return <GraphShell mobile={mobile} title="Knowledge Graph"><LoadingStatus className="min-h-72" label="Loading knowledge graph" /></GraphShell>;
  if (isError || !graph) return <GraphShell mobile={mobile} title="Knowledge Graph"><EmptyState tone="error" title="Knowledge graph unavailable" description="This graph may have been removed or could not be loaded." /></GraphShell>;

  const dirty = name.trim() !== graph.name || description !== (graph.description ?? "");
  const save = async () => {
    if (!dirty || !name.trim()) return;
    setPending(true); setError(null);
    try { await updateKnowledgePack(graph.slug, { name: name.trim(), description: description.trim() || null }); await mutate(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Knowledge graph could not be saved"); }
    finally { setPending(false); }
  };
  const remove = async () => {
    setPending(true); setError(null);
    try { await deleteKnowledgePack(graph.slug); router.replace("/dashboard/library/graphs"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Knowledge graph could not be deleted"); setDeleteOpen(false); }
    finally { setPending(false); }
  };
  const sourceManaged = graph.source_type !== "uploaded";
  const body = <div className="space-y-5 md:space-y-6">
    <div className="hidden md:block"><Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Library", href: "/dashboard/library" }, { label: "Knowledge Graphs", href: "/dashboard/library/graphs" }, { label: graph.name }]} /></div>
    <LibraryTabs />
    <GraphMasthead graph={graph} documentCount={items?.length ?? 0} relationshipCount={relationshipCount} loadingCounts={itemsLoading} />
    <Tabs tabs={[...TABS]} activeTab={activeTab} onChange={(id) => setActiveTab(id as GraphTab)} layoutId="knowledge-graph-detail-tab" indicatorAnimation="slide" mobileVariant="scroll" />
    <div className="min-h-[32rem]">
      {activeTab === "overview" ? <GraphOverview graph={graph} items={items} relationshipCount={relationshipCount} onNavigate={setActiveTab} /> : null}
      {workspaceVisited ? <div className={activeTab === "documents" || activeTab === "map" ? "block" : "hidden"}>
        {graph.source_type === "package" && graph.read_only
          ? <SourceKnowledgeSection pack={graph} activeView={activeTab === "map" ? "graph" : "documents"} />
          : <KnowledgeSection packRef={graph.slug} readOnly={graph.read_only} activeView={activeTab === "map" ? "graph" : "documents"} />}
      </div> : null}
      {activeTab === "settings" ? <div className="space-y-5">
        <section className="theme-surface theme-border rounded-2xl border p-4 sm:p-6"><div className="mb-5"><h2 className="theme-text text-base font-semibold">Graph settings</h2><p className="theme-text-muted mt-1 text-sm">Manage the graph’s identity and retrieval description.</p></div>{graph.read_only ? <div className="theme-surface-muted theme-border rounded-xl border p-4"><p className="theme-text text-sm font-medium">Source-managed graph</p><p className="theme-text-muted mt-1 text-sm">Name and content are controlled by its source package.</p></div> : <div className="grid gap-4"><label className="theme-text text-sm font-medium">Graph name<Input className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="theme-text text-sm font-medium">Description<Textarea className="mt-1.5 min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="flex justify-end"><Button disabled={!dirty || !name.trim()} isLoading={pending} onClick={() => void save()}>Save settings</Button></div></div>}</section>
        {!graph.read_only ? <section className="rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-6 dark:border-red-900/60 dark:bg-red-950/15"><h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Danger zone</h2><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="theme-text-muted max-w-xl text-sm">Delete this graph and all of its documents and relationships. This cannot be undone.</p><Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" />Delete graph</Button></div></section> : null}
      </div> : null}
    </div>
    {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300" role="alert">{error}</p> : null}
  </div>;

  return <>
    <GraphShell mobile={mobile} title={graph.name}>{body}</GraphShell>
    <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={remove} title="Delete knowledge graph" message={`Delete “${graph.name}” and all of its documents and relationships? This cannot be undone.`} confirmLabel="Delete graph" loading={pending} variant="danger" />
  </>;
}

function GraphShell({ mobile, title, children }: { mobile: boolean; title: string; children: React.ReactNode }) {
  return mobile ? <MobilePageShell title={title} backHref="/dashboard/library/graphs" backLabel="Knowledge Graphs">{children}</MobilePageShell> : <><TopBar title="Library" /><PageContent>{children}</PageContent></>;
}

function GraphMasthead({ graph, documentCount, relationshipCount, loadingCounts }: { graph: KnowledgePack; documentCount: number; relationshipCount: number; loadingCounts: boolean }) {
  return <section className="theme-surface theme-border relative overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6"><div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-violet-500/[0.08] blur-3xl" /><div className="relative flex min-w-0 gap-3.5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Network className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="theme-text truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{graph.name}</h2><span className="theme-surface-muted theme-text-muted rounded-full px-2.5 py-1 text-[11px] font-medium">{knowledgeGraphSourceLabel(graph)}</span>{graph.version ? <span className="theme-surface-muted theme-text-muted rounded-full px-2.5 py-1 text-[11px]">v{graph.version}</span> : null}</div><p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">{graph.description || "Add a description so collaborators understand when agents should use this graph."}</p><div className="theme-text-muted mt-4 flex flex-wrap items-center gap-2 text-[11px]"><code className="theme-surface-muted theme-border rounded-md border px-2 py-1">{graph.selector || `lib:${graph.slug}`}</code><span>{loadingCounts ? "Counting documents…" : `${documentCount} documents`}</span><span>·</span><span>{loadingCounts ? "Counting relationships…" : `${relationshipCount} relationships`}</span></div></div></div></section>;
}

function GraphOverview({ graph, items, relationshipCount, onNavigate }: { graph: KnowledgePack; items: ReturnType<typeof useKnowledgeItems>["items"]; relationshipCount: number; onNavigate: (tab: GraphTab) => void }) {
  const recent = (items ?? []).toSorted((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()).slice(0, 5);
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"><section className="theme-surface theme-border overflow-hidden rounded-2xl border"><div className="theme-border border-b px-4 py-3.5 sm:px-5"><h2 className="theme-text text-sm font-semibold">Recent documents</h2><p className="theme-text-muted mt-0.5 text-xs">The latest context added to this graph.</p></div>{recent.length ? <div className="theme-border divide-y">{recent.map((item) => <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:[background:var(--app-hover)] sm:px-5" key={item.id} onClick={() => onNavigate("documents")} type="button"><FileText className="theme-text-muted h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="theme-text block truncate text-sm font-medium">{item.title || item.filename}</span><span className="theme-text-muted block truncate text-xs">{item.path || item.filename}</span></span></button>)}</div> : <div className="px-6 py-10 text-center"><p className="theme-text text-sm font-medium">No documents yet</p><p className="theme-text-muted mt-1 text-sm">Open Documents to upload or create the first source.</p><Button className="mt-4" size="sm" onClick={() => onNavigate("documents")}>Add documents</Button></div>}</section><aside className="space-y-4"><section className="theme-surface theme-border rounded-2xl border p-5"><h2 className="theme-text text-sm font-semibold">Graph pulse</h2><div className="mt-4 grid grid-cols-2 gap-3"><GraphMetric label="Documents" value={items?.length ?? 0} /><GraphMetric label="Relationships" value={relationshipCount} /><GraphMetric label="Source" value={graph.source_type === "uploaded" ? "Workspace" : "Managed"} /><GraphMetric label="Access" value={graph.read_only ? "Read only" : "Editable"} /></div></section><button className="theme-surface theme-border group flex w-full items-center gap-3 rounded-2xl border p-4 text-left hover:[background:var(--app-hover)]" onClick={() => onNavigate("map")} type="button"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><GitBranch className="h-4 w-4" /></span><span><span className="theme-text block text-sm font-medium">Explore relationship map</span><span className="theme-text-muted mt-0.5 block text-xs">See how documents and concepts connect.</span></span></button></aside></div>;
}

function GraphMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="theme-surface-muted rounded-xl p-3"><p className="theme-text-muted text-[11px] font-medium">{label}</p><p className="theme-text mt-1 truncate text-sm font-semibold">{value}</p></div>;
}
