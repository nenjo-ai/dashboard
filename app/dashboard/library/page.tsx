"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Files, FolderTree, Network, Plus, RefreshCw, Upload } from "lucide-react";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
import { fetchArtifactCatalog } from "@/lib/api";
import { useKnowledgePacks } from "@/lib/hooks";
import { isLibraryKnowledgeGraph, knowledgeGraphSourceLabel, summarizeKnowledgeGraphs } from "@/lib/libraryWorkspace";
import { useOrgContext } from "@/lib/org-context";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function LibraryPage() {
  const mobile = useIsMobileViewport();
  const { activeOrgId } = useOrgContext();
  const { packs, isLoading: packsLoading } = useKnowledgePacks();
  const { data: artifactCatalog, isLoading: artifactsLoading } = useSWR(
    activeOrgId ? ["library-overview-artifacts", activeOrgId] as const : null,
    () => fetchArtifactCatalog(""),
  );
  const graphs = (packs ?? []).filter(isLibraryKnowledgeGraph);
  const summary = summarizeKnowledgeGraphs(graphs);
  const artifactCount = (artifactCatalog?.artifacts.length ?? 0) + (artifactCatalog?.unfiled.length ?? 0);
  const recentGraphs = graphs.toSorted((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()).slice(0, 4);

  const body = <div className="space-y-5 md:space-y-6">
    <div className="hidden md:block"><Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Library" }]} /></div>
    <PageIntro
      eyebrow="Knowledge workspace"
      description="Curate connected knowledge for agents and preserve the files, outputs, and revisions that support it."
      actions={<>
        <Link className="theme-surface theme-border theme-text inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:[background:var(--app-hover)]" href="/dashboard/library/artifacts"><Upload className="h-4 w-4" />Upload artifacts</Link>
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-4 text-sm font-medium text-[var(--app-accent-foreground)] hover:bg-[var(--app-accent-hover)]" href="/dashboard/library/graphs?create=1"><Plus className="h-4 w-4" />New graph</Link>
      </>}
      className="mb-0"
    />
    <LibraryTabs />

    {packsLoading || artifactsLoading ? <LoadingStatus className="min-h-44" label="Loading Library" description="Gathering knowledge graphs and artifact activity." /> : <>
      <section className="theme-surface theme-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-label="Library pulse">
        <div className="grid grid-cols-2 divide-x divide-y theme-border sm:grid-cols-4 sm:divide-y-0">
          <Metric icon={Network} label="Knowledge graphs" value={summary.totalCount} tone="text-violet-600 dark:text-violet-400" />
          <Metric icon={FolderTree} label="Workspace graphs" value={summary.workspaceCount} tone="text-blue-600 dark:text-blue-400" />
          <Metric icon={RefreshCw} label="Managed sources" value={summary.managedCount} tone="text-amber-600 dark:text-amber-400" />
          <Metric icon={Files} label="Artifacts" value={artifactCount} tone="text-emerald-600 dark:text-emerald-400" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <LibraryDestination
          href="/dashboard/library/graphs"
          icon={Network}
          eyebrow="Connected context"
          title="Knowledge Graphs"
          description="Organize documents, concepts, and relationships into context agents can retrieve by meaning."
          meta={`${summary.totalCount} graph${summary.totalCount === 1 ? "" : "s"} · ${summary.recentlyUpdatedCount} updated this week`}
        />
        <LibraryDestination
          href="/dashboard/library/artifacts"
          icon={Files}
          eyebrow="Immutable files"
          title="Artifacts"
          description="Browse uploaded references and agent outputs with revision history and review provenance."
          meta={`${artifactCount} artifact${artifactCount === 1 ? "" : "s"} · ${artifactCatalog?.folders.length ?? 0} folders`}
        />
      </div>

      <section className="theme-surface theme-border overflow-hidden rounded-2xl border">
        <div className="theme-border flex items-center justify-between border-b px-4 py-3.5 sm:px-5">
          <div><h2 className="theme-text text-sm font-semibold">Recently updated graphs</h2><p className="theme-text-muted mt-0.5 text-xs">Continue curating the knowledge agents use most recently.</p></div>
          <Link className="theme-text-muted text-xs font-medium hover:theme-text" href="/dashboard/library/graphs">View all</Link>
        </div>
        {recentGraphs.length ? <div className="theme-border divide-y">{recentGraphs.map((graph) => <Link className="group flex items-center gap-3 px-4 py-3.5 hover:[background:var(--app-hover)] sm:px-5" href={`/dashboard/library/graphs/${graph.slug}`} key={graph.id}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Network className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="theme-text block truncate text-sm font-medium">{graph.name}</span><span className="theme-text-muted block truncate text-xs">{knowledgeGraphSourceLabel(graph)} · updated {new Date(graph.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span>
          <ArrowRight className="theme-text-muted h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>)}</div> : <div className="px-6 py-9 text-center"><p className="theme-text text-sm font-medium">No knowledge graphs yet</p><p className="theme-text-muted mt-1 text-sm">Create a graph to give agents reusable, connected context.</p></div>}
      </section>
    </>}
  </div>;

  return mobile
    ? <MobilePageShell title="Library">{body}</MobilePageShell>
    : <><TopBar title="Library" /><PageContent>{body}</PageContent></>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Network; label: string; value: number; tone: string }) {
  return <div className="px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${tone}`} /><span className="theme-text-muted text-xs font-medium">{label}</span></div><p className="theme-text mt-2 text-2xl font-semibold tracking-[-0.03em]">{value}</p></div>;
}

function LibraryDestination({ href, icon: Icon, eyebrow, title, description, meta }: { href: string; icon: typeof Network; eyebrow: string; title: string; description: string; meta: string }) {
  return <Link className="theme-surface theme-border group relative overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:[border-color:var(--app-border-strong)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:p-6" href={href}>
    <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-violet-500/[0.06] blur-2xl" />
    <div className="relative flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.14em]">{eyebrow}</p><h2 className="theme-text mt-1 text-lg font-semibold tracking-[-0.02em]">{title}</h2><p className="theme-text-muted mt-2 text-sm leading-6">{description}</p><p className="theme-text-muted mt-4 text-xs">{meta}</p></div><ArrowRight className="theme-text-muted mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" /></div>
  </Link>;
}
