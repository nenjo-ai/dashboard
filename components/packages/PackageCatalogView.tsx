"use client";

import {
  BookOpen,
  Bot,
  Braces,
  Check,
  Download,
  GitBranch,
  LayoutList,
  Network,
  Package,
  PlugZap,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

import { PackageInstallProgressBar } from "@/components/packages/PackageInstallProgressBar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type {
  MarketplacePackage,
  MarketplacePackageKind,
  PackageCatalogSort,
} from "@/lib/packageHub";
import type { PackageInstallProgress, PackageSource } from "@/lib/types";

export interface PackageCatalogItem {
  pkg: MarketplacePackage;
  installed: boolean;
  sourceLabel: string;
}

export function PackageCatalogView({
  sources,
  selectedSourceId,
  onSourceChange,
  items,
  totalPackageCount,
  isLoading,
  kindFilter,
  onKindFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  visibleCount,
  onLoadMore,
  onOpen,
  onOpenDetails,
  onInstall,
  onRefresh,
  busyKey,
  installProgress,
}: {
  sources: PackageSource[];
  selectedSourceId: string | undefined;
  onSourceChange: (id: string) => void;
  items: PackageCatalogItem[];
  totalPackageCount: number;
  isLoading: boolean;
  kindFilter: MarketplacePackageKind | "all";
  onKindFilterChange: (kind: MarketplacePackageKind | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: PackageCatalogSort;
  onSortChange: (sort: PackageCatalogSort) => void;
  visibleCount: number;
  onLoadMore: () => void;
  onOpen: (pkg: MarketplacePackage) => void;
  onOpenDetails: (pkg: MarketplacePackage) => void;
  onInstall: (pkg: MarketplacePackage) => void;
  onRefresh: () => void;
  busyKey: string | null;
  installProgress: Record<string, PackageInstallProgress>;
}) {
  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      <CatalogToolbar
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSourceChange={onSourceChange}
        search={search}
        onSearchChange={onSearchChange}
        kindFilter={kindFilter}
        onKindFilterChange={onKindFilterChange}
        sort={sort}
        onSortChange={onSortChange}
        onRefresh={onRefresh}
        visibleCount={items.length}
        totalPackageCount={totalPackageCount}
      />

      {isLoading ? (
        <CatalogLoading />
      ) : items.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <PackageCatalogCard
                key={item.pkg.id}
                item={item}
                busyKey={busyKey}
                installProgress={installProgress[item.pkg.id]}
                onOpen={onOpen}
                onOpenDetails={onOpenDetails}
                onInstall={onInstall}
              />
            ))}
          </div>
          {visibleItems.length < items.length ? (
            <div className="flex justify-center pt-1">
              <Button variant="secondary" onClick={onLoadMore}>
                <LayoutList className="h-4 w-4" />
                Show more packages
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <CatalogEmpty filtered={Boolean(search || kindFilter !== "all")} />
      )}
    </div>
  );
}

function CatalogToolbar({
  sources,
  selectedSourceId,
  onSourceChange,
  search,
  onSearchChange,
  kindFilter,
  onKindFilterChange,
  sort,
  onSortChange,
  onRefresh,
  visibleCount,
  totalPackageCount,
}: {
  sources: PackageSource[];
  selectedSourceId: string | undefined;
  onSourceChange: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  kindFilter: MarketplacePackageKind | "all";
  onKindFilterChange: (kind: MarketplacePackageKind | "all") => void;
  sort: PackageCatalogSort;
  onSortChange: (sort: PackageCatalogSort) => void;
  onRefresh: () => void;
  visibleCount: number;
  totalPackageCount: number;
}) {
  return (
    <div className="theme-surface theme-border space-y-4 rounded-2xl border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="theme-text text-xs font-medium">Search packages</span>
          <span className="relative block">
            <Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search names, descriptions, or types" className="pl-9" />
          </span>
        </label>
        <CatalogSelect label="Source" className="lg:w-52">
          <Select value={selectedSourceId ?? ""} onChange={(event) => onSourceChange(event.target.value)} disabled={!sources.length}>
            {sources.length ? sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>) : <option value="">No package sources</option>}
          </Select>
        </CatalogSelect>
        <CatalogSelect label="Type" className="lg:w-48">
          <Select value={kindFilter} onChange={(event) => onKindFilterChange(event.target.value as MarketplacePackageKind | "all")}>
            <option value="all">All types</option>
            <option value="package">Packages</option>
            <option value="knowledge">Knowledge</option>
            <option value="agent">Agents</option>
            <option value="ability">Abilities</option>
            <option value="domain">Domains</option>
            <option value="context_block">Context blocks</option>
            <option value="mcp">MCP</option>
            <option value="routine">Routines</option>
            <option value="skill">Skills</option>
            <option value="command">Commands</option>
            <option value="hook">Hooks</option>
            <option value="script_tool">Script tools</option>
            <option value="plugin">Plugins</option>
          </Select>
        </CatalogSelect>
        <CatalogSelect label="Sort" className="lg:w-44">
          <Select value={sort} onChange={(event) => onSortChange(event.target.value as PackageCatalogSort)}>
            <option value="relevance">Relevant</option>
            <option value="recent">Recently synced</option>
            <option value="name">Name</option>
          </Select>
        </CatalogSelect>
        <Button variant="secondary" onClick={onRefresh} disabled={!selectedSourceId} aria-label="Refresh selected package source">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <div className="theme-border flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
        <span className="theme-text-muted">
          {visibleCount === totalPackageCount ? `${visibleCount} package${visibleCount === 1 ? "" : "s"}` : `${visibleCount} of ${totalPackageCount} packages`}
        </span>
        {search ? <button type="button" className="theme-selection-accent-soft theme-selected-text rounded-full px-2.5 py-1 font-medium" onClick={() => onSearchChange("")}>Clear search</button> : null}
        {kindFilter !== "all" ? <button type="button" className="theme-selection-accent-soft theme-selected-text rounded-full px-2.5 py-1 font-medium" onClick={() => onKindFilterChange("all")}>Clear type</button> : null}
      </div>
    </div>
  );
}

function CatalogSelect({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return <label className={`space-y-1.5 ${className}`}><span className="theme-text text-xs font-medium">{label}</span>{children}</label>;
}

function PackageCatalogCard({
  item,
  busyKey,
  installProgress,
  onOpen,
  onOpenDetails,
  onInstall,
}: {
  item: PackageCatalogItem;
  busyKey: string | null;
  installProgress?: PackageInstallProgress;
  onOpen: (pkg: MarketplacePackage) => void;
  onOpenDetails: (pkg: MarketplacePackage) => void;
  onInstall: (pkg: MarketplacePackage) => void;
}) {
  const { pkg, installed } = item;
  const isSkillLike = pkg.kind === "plugin" || pkg.kind === "skill";
  const kindLabel = packageKindLabel(pkg.kind);

  return (
    <article className="theme-surface theme-border flex h-full flex-col rounded-2xl border p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] hover:border-deep-space-blue-300 hover:shadow-sm dark:hover:border-deep-space-blue-700">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300">{packageKindIcon(pkg.kind)}</span>
        {installed ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3 w-3" /> Installed</span> : null}
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="theme-text truncate text-base font-semibold">{pkg.display_name ?? pkg.name}</h3>
        <p className="theme-text-muted mt-1 truncate text-xs">{kindLabel === "Package" ? "Reusable package" : `${kindLabel} package`}</p>
        <p className="theme-text-muted mt-3 line-clamp-2 min-h-10 text-sm leading-5">{pkg.description || "No description available."}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pkg.kind !== "plugin" ? <><CatalogBadge>{pkg.kind.replaceAll("_", " ")}</CatalogBadge><CatalogBadge>{item.sourceLabel}</CatalogBadge>{pkg.latest_version ? <CatalogBadge>{pkg.latest_version}</CatalogBadge> : null}</> : null}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <Button size="sm" variant="secondary" className="w-full" onClick={() => isSkillLike ? onOpen(pkg) : onOpenDetails(pkg)} isLoading={busyKey === `review:${pkg.id}`}>
          <BookOpen className="h-4 w-4" /> {isSkillLike ? "View" : "Details"}
        </Button>
        {!installed ? <Button size="sm" className="w-full" onClick={() => onInstall(pkg)} isLoading={busyKey === `install:${pkg.id}` || busyKey === `install-arguments:${pkg.id}`}><Download className="h-4 w-4" /> Install</Button> : <Button size="sm" variant="secondary" className="w-full" disabled><Check className="h-4 w-4" /> Installed</Button>}
      </div>
      {busyKey === `install:${pkg.id}` && installProgress ? <PackageInstallProgressBar progress={installProgress} className="mt-3" /> : null}
    </article>
  );
}

function CatalogBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{children}</span>;
}

function CatalogEmpty({ filtered }: { filtered: boolean }) {
  return <div className="theme-surface theme-border flex min-h-32 items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm theme-text-muted">{filtered ? "No packages match these filters." : "No packages found for this source."}</div>;
}

function CatalogLoading() {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="theme-border h-60 animate-pulse rounded-2xl border bg-gray-100 motion-reduce:animate-none dark:bg-gray-800" />)}</div>;
}

function packageKindLabel(kind: MarketplacePackageKind): string {
  return kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function packageKindIcon(kind: MarketplacePackageKind) {
  const className = "h-5 w-5";
  switch (kind) {
    case "agent": return <Bot className={className} />;
    case "ability": return <Zap className={className} />;
    case "knowledge":
    case "knowledge_pack": return <Network className={className} />;
    case "mcp": return <PlugZap className={className} />;
    case "command": return <Terminal className={className} />;
    case "context_block":
    case "script_tool": return <Braces className={className} />;
    case "domain": return <GitBranch className={className} />;
    case "skill":
    case "plugin": return <Sparkles className={className} />;
    default: return <Package className={className} />;
  }
}
