"use client";

import { ArrowLeft, ArrowUp, ChevronRight, FolderOpen, FolderPlus, Search } from "lucide-react";

export type ArtifactTypeFilter = "all" | "documents" | "images" | "other";

interface ArtifactBrowserToolbarProps {
  path: string;
  query: string;
  typeFilter: ArtifactTypeFilter;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onQueryChange: (query: string) => void;
  onTypeFilterChange: (filter: ArtifactTypeFilter) => void;
  onCreateFolder?: () => void;
}

export function ArtifactBrowserToolbar({
  path,
  query,
  typeFilter,
  onBack,
  onNavigate,
  onQueryChange,
  onTypeFilterChange,
  onCreateFolder,
}: ArtifactBrowserToolbarProps) {
  const segments = path ? path.split("/") : [];
  const parentPath = segments.slice(0, -1).join("/");

  return <div className="theme-surface-muted theme-border border-b p-2.5 sm:p-3">
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Back" className="theme-border theme-surface theme-text-muted flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:[background:var(--app-hover)] hover:[color:var(--app-text)]" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" /></button>
        <button aria-label="Up one level" className="theme-border theme-surface theme-text-muted flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:[background:var(--app-hover)] hover:[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-40" disabled={!path} onClick={() => onNavigate(parentPath)} type="button"><ArrowUp className="h-4 w-4" /></button>
      </div>

      <nav aria-label="Artifact folder path" className="theme-border theme-surface flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border px-1">
        <button className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:[background:var(--app-hover)] ${!path ? "theme-text" : "theme-text-muted"}`} onClick={() => onNavigate("")} type="button"><FolderOpen className="h-3.5 w-3.5" />Artifacts</button>
        {segments.map((segment, index) => {
          const segmentPath = segments.slice(0, index + 1).join("/");
          const current = index === segments.length - 1;
          return <span className="flex shrink-0 items-center" key={segmentPath}><ChevronRight aria-hidden="true" className="theme-text-muted h-3.5 w-3.5" /><button aria-current={current ? "page" : undefined} className={`max-w-44 truncate rounded-md px-2 py-1 text-xs font-medium transition-colors hover:[background:var(--app-hover)] ${current ? "theme-text" : "theme-text-muted"}`} onClick={() => onNavigate(segmentPath)} title={segment} type="button">{segment}</button></span>;
        })}
      </nav>
    </div>

    <div className="mt-2 flex gap-2 sm:ml-[5rem]">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search this folder</span><Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><input className="theme-border theme-surface h-9 w-full rounded-lg border pl-9 pr-3 text-sm" type="search" placeholder="Search this folder…" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>
      <select aria-label="Artifact type" className="theme-border theme-surface h-9 max-w-36 rounded-lg border px-2.5 text-xs sm:max-w-none" value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as ArtifactTypeFilter)}><option value="all">All types</option><option value="documents">Documents</option><option value="images">Images</option><option value="other">Other files</option></select>
      {onCreateFolder ? <button className="theme-border theme-surface theme-text flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors hover:[background:var(--app-hover)]" onClick={onCreateFolder} type="button"><FolderPlus aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">New folder</span></button> : null}
    </div>
  </div>;
}
