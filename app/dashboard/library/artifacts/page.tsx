"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, File, Folder, FolderInput, FolderPen, Pencil, Trash2, Upload } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

import { ArtifactBrowserToolbar, type ArtifactTypeFilter } from "@/components/artifacts/ArtifactBrowserToolbar";
import { ArtifactImportDialog, type ArtifactImportMode, type ArtifactImportOptions } from "@/components/artifacts/ArtifactImportDialog";
import { ArtifactPathDialog } from "@/components/artifacts/ArtifactPathDialog";
import { ArtifactViewer, evictLoadedArtifacts } from "@/components/artifacts/ArtifactViewer";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";
import {
  createArtifactFolder,
  deleteArtifact,
  deleteArtifactFolder,
  fetchArtifactCatalog,
  fetchArtifactDetail,
  putArtifactCatalogEntry,
  updateArtifactFolder,
  uploadArtifact,
} from "@/lib/api";
import {
  chatArtifactCacheContainsAny,
  withoutDeletedArtifactDetails,
} from "@/lib/chatArtifacts";
import { artifactImportPublishPath, MAX_ARTIFACT_IMPORTS } from "@/lib/artifactCatalog";
import { useOrgContext } from "@/lib/org-context";
import { toast } from "@/lib/toast";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import type {
  ArtifactCatalogEntry,
  ArtifactCatalogFolder,
  ArtifactCatalog,
  ArtifactDetail,
  UnfiledArtifactEntry,
} from "@/lib/types";

type BrowserArtifact = (ArtifactCatalogEntry | UnfiledArtifactEntry) & { unfiled?: boolean };
type CatalogPathAction =
  | { mode: "create-folder" }
  | { mode: "edit-folder"; folder: ArtifactCatalogFolder }
  | { mode: "edit-file"; artifact: BrowserArtifact };

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function browserArtifactPath(artifact: BrowserArtifact): string {
  return "path" in artifact ? artifact.path : artifact.name;
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function artifactKindLabel(artifact: BrowserArtifact): string {
  if (artifact.media_type === "application/pdf") return "PDF";
  if (artifact.media_type === "application/json") return "JSON";
  if (artifact.media_type === "text/csv") return "CSV";
  if (artifact.media_type.startsWith("text/")) return "Text";
  if (artifact.media_type.startsWith("image/")) return "Image";
  if (artifact.media_type.startsWith("audio/")) return "Audio";
  if (artifact.media_type.startsWith("video/")) return "Video";
  const extension = artifact.name.includes(".") ? artifact.name.split(".").pop() : null;
  return extension ? extension.toUpperCase().slice(0, 10) : "File";
}

function ArtifactBrowser() {
  const mobile = useIsMobileViewport();
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const searchParams = useSearchParams();
  const { activeOrgId, hasScope } = useOrgContext();
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ArtifactTypeFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ArtifactImportMode>("files");
  const [pathAction, setPathAction] = useState<CatalogPathAction | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<ArtifactCatalogFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const path = searchParams.get("path")?.replace(/^\/+|\/+$/g, "") ?? "";
  const selectedArtifactId = searchParams.get("artifact");
  const {
    data: catalogPages,
    error,
    isLoading,
    size: catalogPageCount,
    setSize: setCatalogPageCount,
  } = useSWRInfinite<ArtifactCatalog>(
    (_pageIndex, previousPage: ArtifactCatalog | null) => {
      if (!activeOrgId || (previousPage && !previousPage.next_cursor)) return null;
      return [
        "artifact-catalog",
        activeOrgId,
        path,
        deferredQuery,
        typeFilter,
        previousPage?.next_cursor ?? null,
      ] as const;
    },
    (key) => {
      const [, , currentPath, currentQuery, media, cursor] = key as readonly [
        string,
        string,
        string,
        string,
        ArtifactTypeFilter,
        string | null,
      ];
      return fetchArtifactCatalog(currentPath, cursor ?? undefined, {
        query: currentQuery,
        media,
      });
    },
  );
  const { data: detail, isLoading: detailLoading } = useSWR(
    activeOrgId && selectedArtifactId
      ? ["artifact-detail", activeOrgId, selectedArtifactId] as const
      : null,
    ([, , artifactId]) => fetchArtifactDetail(artifactId),
  );
  const catalog = useMemo<ArtifactCatalog | undefined>(() => {
    if (!catalogPages?.length) return undefined;
    return {
      path: catalogPages[0].path,
      folders: catalogPages.flatMap((page) => page.folders),
      artifacts: catalogPages.flatMap((page) => page.artifacts),
      unfiled: catalogPages.flatMap((page) => page.unfiled),
      next_cursor: catalogPages.at(-1)?.next_cursor ?? null,
    };
  }, [catalogPages]);
  const loadingMoreCatalogItems = isLoading || catalogPageCount > (catalogPages?.length ?? 0);

  const directFolders = useMemo(
    () => catalog?.folders.filter((folder) => parentPath(folder.path) === path) ?? [],
    [catalog?.folders, path],
  );
  const directArtifacts = useMemo<BrowserArtifact[]>(() => {
    const placed = catalog?.artifacts.filter((artifact) => parentPath(artifact.path) === path) ?? [];
    if (path || !catalog) return placed;
    return [...placed, ...catalog.unfiled.map((artifact) => ({ ...artifact, unfiled: true }))];
  }, [catalog, path]);
  const visibleFolders = useMemo(() => directFolders.filter((folder) => !deferredQuery || folder.name.toLocaleLowerCase().includes(deferredQuery)), [deferredQuery, directFolders]);
  const visibleArtifacts = useMemo(() => directArtifacts.filter((artifact) => {
    if (deferredQuery && !artifact.name.toLocaleLowerCase().includes(deferredQuery)) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "images") return artifact.media_type.startsWith("image/");
    if (typeFilter === "documents") return artifact.media_type.startsWith("text/") || artifact.media_type.includes("pdf") || artifact.media_type.includes("json");
    return !artifact.media_type.startsWith("image/") && !artifact.media_type.startsWith("text/") && !artifact.media_type.includes("pdf") && !artifact.media_type.includes("json");
  }), [deferredQuery, directArtifacts, typeFilter]);
  const selectedCatalogArtifact = useMemo(() => directArtifacts.find((artifact) => (
    artifact.artifact_id === selectedArtifactId
    || (detail && artifact.lineage_id === detail.artifact.lineage_id)
  )), [detail, directArtifacts, selectedArtifactId]);
  const revisionCount = detail?.revisions.length ?? 1;

  useEffect(() => () => {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
  }, [activeOrgId]);

  function navigate(nextPath: string, artifactId?: string) {
    setQuery("");
    setTypeFilter("all");
    const next = new URLSearchParams();
    if (nextPath) next.set("path", nextPath);
    if (artifactId) next.set("artifact", artifactId);
    router.push(`/dashboard/library/artifacts${next.size ? `?${next}` : ""}`);
  }

  function openImport(mode: ArtifactImportMode) {
    setImportMode(mode);
    setImportOpen(true);
  }

  async function refreshArtifactCatalogs() {
    await setCatalogPageCount(1);
    await mutateCache(
      (key) => Array.isArray(key) && key[0] === "artifact-catalog" && key[1] === activeOrgId,
    );
  }

  async function handleCreateFolder(destination: string) {
    try {
      const folder = await createArtifactFolder(destination);
      setPathAction(null);
      await refreshArtifactCatalogs();
      toast.success(`Folder “${folder.name}” created.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Folder could not be created.");
    }
  }

  async function handleUpdateFolder(folder: ArtifactCatalogFolder, destination: string) {
    try {
      const updated = await updateArtifactFolder(folder.folder_id, destination);
      setPathAction(null);
      await refreshArtifactCatalogs();
      toast.success(`Folder moved to “${updated.path}”.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Folder could not be updated.");
    }
  }

  async function handleDeleteFolder() {
    if (!folderToDelete || deletingFolder) return;
    setDeletingFolder(true);
    try {
      await deleteArtifactFolder(folderToDelete.folder_id);
      const name = folderToDelete.name;
      setFolderToDelete(null);
      await refreshArtifactCatalogs();
      toast.success(`Folder “${name}” deleted.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Only empty folders can be deleted.");
    } finally {
      setDeletingFolder(false);
    }
  }

  async function handlePutCatalogEntry(artifact: BrowserArtifact, destination: string) {
    try {
      const entry = await putArtifactCatalogEntry(artifact.artifact_id, destination);
      setPathAction(null);
      await refreshArtifactCatalogs();
      navigate(parentPath(entry.path), entry.artifact_id);
      toast.success(`File moved to “${entry.path}”.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "File could not be organized.");
    }
  }

  async function handleUploadArtifacts(files: File[], options: ArtifactImportOptions) {
    if (!activeOrgId || uploadingCount > 0 || !catalog) return;
    const selectedFiles = files.slice(0, MAX_ARTIFACT_IMPORTS);
    if (selectedFiles.length === 0) return;
    if (files.length > MAX_ARTIFACT_IMPORTS) {
      toast.warning(`Only the first ${MAX_ARTIFACT_IMPORTS} files will be uploaded.`);
    }

    const uploadOrgId = activeOrgId;
    const uploadPath = catalog.path;
    let plannedUploads: Array<{ file: File; publishPath: string }>;
    try {
      plannedUploads = selectedFiles.map((file) => ({
        file,
        publishPath: artifactImportPublishPath(file, {
          currentPath: uploadPath,
          newSubfolder: options.newSubfolder,
          preserveFolderStructure: options.preserveFolderStructure,
        }),
      }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The artifact destination is not valid.");
      return;
    }
    const controller = new AbortController();
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = controller;
    setUploadingCount(selectedFiles.length);
    setImportOpen(false);

    try {
      const results = await Promise.allSettled(plannedUploads.map(({ file, publishPath }) => (
        uploadArtifact(file, uploadOrgId, {
          signal: controller.signal,
          publishPath,
        })
      )));
      if (controller.signal.aborted) return;

      const uploaded = results.flatMap((result, index) => (
        result.status === "fulfilled" ? [{ artifact: result.value, publishPath: plannedUploads[index].publishPath }] : []
      ));
      const failed = results.flatMap((result) => (
        result.status === "rejected" ? [result.reason] : []
      ));

      if (uploaded.length > 0) {
        await refreshArtifactCatalogs();
        navigate(parentPath(uploaded[0].publishPath), uploaded[0].artifact.id);
      }
      if (failed.length === 0) {
        toast.success(`${uploaded.length} ${uploaded.length === 1 ? "artifact" : "artifacts"} uploaded.`);
      } else if (uploaded.length > 0) {
        toast.warning(`${uploaded.length} uploaded; ${failed.length} failed.`);
      } else {
        const cause = failed[0];
        toast.error(cause instanceof Error ? cause.message : "Artifacts could not be uploaded.");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        toast.error(cause instanceof Error ? cause.message : "The artifact catalog could not be refreshed.");
      }
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
        setUploadingCount(0);
      }
    }
  }

  async function handleDeleteArtifact() {
    if (!selectedArtifactId || deleting) return;
    const artifactName = detail?.artifact.name ?? "Artifact";
    setDeleting(true);
    try {
      await deleteArtifact(selectedArtifactId);
      const deletedArtifactIds = Array.from(new Set([
        selectedArtifactId,
        ...(detail?.revisions.map((revision) => revision.id) ?? []),
      ]));
      evictLoadedArtifacts(
        deletedArtifactIds,
        activeOrgId,
      );
      await mutateCache<ArtifactDetail[]>(
        (key) => chatArtifactCacheContainsAny(key, deletedArtifactIds),
        (current) => withoutDeletedArtifactDetails(current, deletedArtifactIds),
        { revalidate: false },
      );
      setConfirmingDelete(false);
      const next = new URLSearchParams();
      if (path) next.set("path", path);
      router.replace(`/dashboard/library/artifacts${next.size ? `?${next}` : ""}`, { scroll: false });
      await refreshArtifactCatalogs();
      toast.success(`"${artifactName}" and its revisions were deleted.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Artifact could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  const pathSegments = path ? path.split("/") : [];
  const breadcrumbs = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Library", href: "/dashboard/library" },
    { label: "Artifacts", href: "/dashboard/library/artifacts", onClick: () => navigate("") },
    ...pathSegments.map((segment, index) => {
      const segmentPath = pathSegments.slice(0, index + 1).join("/");
      return { label: segment, href: `/dashboard/library/artifacts?path=${encodeURIComponent(segmentPath)}`, onClick: () => navigate(segmentPath) };
    }),
  ];
  const body = <div className="space-y-4">
      <div className="hidden md:block"><Breadcrumbs items={breadcrumbs} /></div>
      <header>
        <PageIntro
          eyebrow="Artifact workspace"
          description="Store organization files and agent outputs with immutable revision history and direct links back to reviews."
          actions={hasScope("artifacts:write") ? (
            <>
              <Button type="button" variant="secondary" onClick={() => openImport("folder")} disabled={!catalog || Boolean(error) || uploadingCount > 0}><FolderInput aria-hidden="true" className="h-4 w-4" />Import folder</Button>
              <Button type="button" onClick={() => openImport("files")} isLoading={uploadingCount > 0} disabled={!catalog || Boolean(error)}><Upload aria-hidden="true" className="h-4 w-4" />{uploadingCount > 0 ? `Uploading ${uploadingCount}…` : "Upload artifacts"}</Button>
            </>
          ) : undefined}
          className="mb-0"
        />
      </header>

      <LibraryTabs />

      <section className="theme-surface theme-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <ArtifactBrowserToolbar path={path} query={query} typeFilter={typeFilter} onBack={() => router.back()} onNavigate={(nextPath) => navigate(nextPath)} onQueryChange={setQuery} onTypeFilterChange={setTypeFilter} onCreateFolder={hasScope("artifacts:write") ? () => setPathAction({ mode: "create-folder" }) : undefined} />
        <div className="grid min-h-[34rem] xl:grid-cols-[minmax(24rem,0.95fr)_minmax(30rem,1.25fr)]">
        <section className="theme-border min-w-0 overflow-hidden border-b xl:border-b-0 xl:border-r">
          <div className="theme-surface-muted theme-border hidden grid-cols-[minmax(0,1fr)_7.5rem_6rem] gap-3 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] sm:grid"><span>Name</span><span>Kind</span><span className="text-right">Size</span></div>
          {isLoading ? <p className="theme-text-muted flex items-center gap-2 p-4 text-sm" role="status">Loading artifacts<span className="flex gap-0.5" aria-hidden="true">{[0, 1, 2].map((dot) => <span key={dot} className="animate-loading-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${dot * 120}ms` }} />)}</span></p> : null}
          {error ? <p className="p-4 text-sm text-red-600" role="alert">Artifacts could not be loaded.</p> : null}
          {!isLoading && !error && visibleFolders.length === 0 && visibleArtifacts.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Folder aria-hidden="true" className="h-8 w-8 text-amber-400" /><p className="theme-text mt-3 text-sm font-medium">{query || typeFilter !== "all" ? "No matching items" : "This folder is empty"}</p><p className="theme-text-muted mt-1 max-w-xs text-xs leading-5">{query || typeFilter !== "all" ? "Try changing the search or file-type filter." : "Create a folder or import files to organize artifacts here."}</p>{hasScope("artifacts:write") && !query && typeFilter === "all" ? <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setPathAction({ mode: "create-folder" })}><FolderPen className="h-3.5 w-3.5" />New folder</Button><Button size="sm" onClick={() => openImport("files")}><Upload className="h-3.5 w-3.5" />Import here</Button></div> : null}</div> : null}
          <div className="divide-y theme-border">
            {visibleFolders.map((folder) => <div className="group relative" key={folder.folder_id}>
              <button
                type="button"
                onClick={() => navigate(folder.path)}
                className="theme-text grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 pr-24 text-left hover:theme-surface-muted sm:grid-cols-[minmax(0,1fr)_7.5rem_6rem]"
              >
                <span className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10"><Folder aria-hidden="true" className="h-4 w-4 text-amber-500" /></span><span className="min-w-0 truncate text-sm font-medium">{folder.name}</span></span>
                <span className="theme-text-muted hidden text-xs sm:block">Folder</span>
                <ChevronRight aria-hidden="true" className="theme-text-muted h-4 w-4 justify-self-end sm:hidden" />
              </button>
              {hasScope("artifacts:write") ? <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button type="button" aria-label={`Rename or move ${folder.name}`} title="Rename or move" className="theme-text-muted rounded-md p-2 hover:[background:var(--app-hover)] hover:[color:var(--app-text)]" onClick={() => setPathAction({ mode: "edit-folder", folder })}><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Delete ${folder.name}`} title="Delete empty folder" className="theme-text-muted rounded-md p-2 hover:bg-red-500/10 hover:text-red-600" onClick={() => setFolderToDelete(folder)}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
              </div> : null}
            </div>)}
            {visibleArtifacts.map((artifact) => <button
              key={`${artifact.unfiled ? "unfiled" : "placed"}:${artifact.artifact_id}`}
              type="button"
              onClick={() => navigate(path, artifact.artifact_id)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:theme-surface-muted sm:grid-cols-[minmax(0,1fr)_7.5rem_6rem] ${selectedArtifactId === artifact.artifact_id ? "theme-selected" : ""}`}
            >
              <span className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10"><File aria-hidden="true" className="h-4 w-4 text-cyan-600" /></span><span className="min-w-0"><span className="theme-text block truncate text-sm font-medium">{artifact.name}</span><span className="theme-text-muted block truncate text-xs">Revision {artifact.revision_number}{artifact.revision_count > 1 ? ` of ${artifact.revision_count}` : ""}{artifact.unfiled ? " · Unfiled" : ""}</span></span></span>
              <span className="theme-text-muted hidden truncate text-xs sm:block">{artifactKindLabel(artifact)}</span>
              <span className="theme-text-muted text-right text-xs">{formatBytes(artifact.size_bytes)}</span>
            </button>)}
          </div>
          <div className="theme-surface-muted theme-border flex min-h-9 items-center justify-between gap-3 border-t px-4 py-2 text-[11px]">
            <span className="theme-text-muted">Showing {visibleFolders.length} {visibleFolders.length === 1 ? "folder" : "folders"} · {visibleArtifacts.length} {visibleArtifacts.length === 1 ? "file" : "files"}</span>
            {catalog?.next_cursor ? <button type="button" className="theme-text rounded-md px-2 py-1 font-medium hover:[background:var(--app-hover)]" disabled={loadingMoreCatalogItems} onClick={() => void setCatalogPageCount((count) => count + 1)}>{loadingMoreCatalogItems ? "Loading…" : "Load more"}</button> : null}
          </div>
        </section>

        <section className="theme-surface min-w-0 p-4 sm:p-5">
          {!selectedArtifactId ? <div className="theme-text-muted flex h-full min-h-72 flex-col items-center justify-center text-sm"><File aria-hidden="true" className="mb-3 h-7 w-7 opacity-45" /><span>Select a file to preview it.</span></div> : null}
          {selectedArtifactId ? <>
            <ArtifactViewer
              artifactId={selectedArtifactId}
              framed={false}
              actions={detail && selectedCatalogArtifact && hasScope("artifacts:write") ? <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPathAction({ mode: "edit-file", artifact: selectedCatalogArtifact })}><FolderInput aria-hidden="true" className="h-4 w-4" />Organize</Button>
                <Button type="button" variant="danger" size="sm" onClick={() => setConfirmingDelete(true)} disabled={deleting}><Trash2 aria-hidden="true" className="h-4 w-4" />Delete</Button>
              </> : undefined}
            />
            {detailLoading ? <p className="theme-text-muted mt-4 text-xs">Loading revision history…</p> : null}
            {detail ? <div className="theme-border mt-4 space-y-4 border-t pt-4">
              <section>
                <h2 className="theme-text text-sm font-semibold">Revisions</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.revisions.map((revision) => <button
                    key={revision.id}
                    type="button"
                    onClick={() => navigate(path, revision.id)}
                    className={`theme-border rounded-lg border px-3 py-1.5 text-xs ${selectedArtifactId === revision.id ? "bg-cyan-600 text-white" : "theme-text hover:theme-surface-muted"}`}
                  >
                    Revision {revision.revision_number}
                  </button>)}
                </div>
              </section>
              {detail.used_in_reviews ? <details>
                <summary className="theme-text cursor-pointer text-sm font-semibold">Used in reviews ({detail.used_in_reviews.length})</summary>
                <div className="mt-2 space-y-2">
                  {detail.used_in_reviews.map((usage) => <Link
                    key={`${usage.review_id}:${usage.artifact_id}`}
                    href={`/dashboard/reviews?execution_id=${usage.execution_id}`}
                    className="theme-surface-muted block rounded-lg p-3 text-xs"
                  >
                    <span className="theme-text block font-medium">{usage.title}</span>
                    <span className="theme-text-muted">{usage.step} · round {usage.round} · {usage.status}</span>
                  </Link>)}
                  {detail.used_in_reviews.length === 0 ? <p className="theme-text-muted text-xs">This artifact has not been used in a review.</p> : null}
                </div>
              </details> : null}
            </div> : null}
          </> : null}
        </section>
      </div>
      </section>
      {importOpen ? <ArtifactImportDialog currentPath={catalog?.path ?? path} initialMode={importMode} onClose={() => setImportOpen(false)} onImport={(files, options) => void handleUploadArtifacts(files, options)} /> : null}
      {pathAction?.mode === "create-folder" ? <ArtifactPathDialog mode="create-folder" currentPath={catalog?.path ?? path} onClose={() => setPathAction(null)} onSubmit={handleCreateFolder} /> : null}
      {pathAction?.mode === "edit-folder" ? <ArtifactPathDialog mode="edit-folder" initialPath={pathAction.folder.path} onClose={() => setPathAction(null)} onSubmit={(destination) => handleUpdateFolder(pathAction.folder, destination)} /> : null}
      {pathAction?.mode === "edit-file" ? <ArtifactPathDialog mode="edit-file" initialPath={browserArtifactPath(pathAction.artifact)} onClose={() => setPathAction(null)} onSubmit={(destination) => handlePutCatalogEntry(pathAction.artifact, destination)} /> : null}
      <ConfirmDialog
        open={Boolean(folderToDelete)}
        onClose={() => { if (!deletingFolder) setFolderToDelete(null); }}
        onConfirm={handleDeleteFolder}
        title="Delete folder"
        message={`Delete “${folderToDelete?.name ?? "this folder"}”? Only empty folders can be deleted; files and nested folders are never removed automatically.`}
        confirmLabel="Delete folder"
        loading={deletingFolder}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => {
          if (!deleting) setConfirmingDelete(false);
        }}
        onConfirm={handleDeleteArtifact}
        title="Delete artifact"
        message={`Delete "${detail?.artifact.name ?? "this artifact"}" and its complete revision history (${revisionCount} ${revisionCount === 1 ? "revision" : "revisions"})? Its encrypted contents will be permanently removed, and historical references will no longer open.`}
        confirmLabel="Delete"
        loading={deleting}
      />
  </div>;

  return mobile
    ? <MobilePageShell title="Artifacts" backHref="/dashboard/library" backLabel="Library">{body}</MobilePageShell>
    : <><TopBar title="Library" /><PageContent>{body}</PageContent></>;
}

export default function ArtifactsPage() {
  return <Suspense fallback={<PreviewFallback />}><ArtifactBrowser /></Suspense>;
}

function PreviewFallback() {
  return <><TopBar title="Library" /><PageContent><p className="theme-text-muted text-sm">Loading artifacts…</p></PageContent></>;
}
