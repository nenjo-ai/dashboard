"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { File, Folder, LibraryBig, Loader2, Trash2, Upload } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";

import { ArtifactViewer, evictLoadedArtifacts } from "@/components/artifacts/ArtifactViewer";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageContent } from "@/components/ui/PageContent";
import {
  deleteArtifact,
  fetchArtifactCatalog,
  fetchArtifactDetail,
  uploadArtifact,
} from "@/lib/api";
import {
  chatArtifactCacheContainsAny,
  withoutDeletedArtifactDetails,
} from "@/lib/chatArtifacts";
import { useOrgContext } from "@/lib/org-context";
import { toast } from "@/lib/toast";
import type {
  ArtifactCatalogEntry,
  ArtifactDetail,
  UnfiledArtifactEntry,
} from "@/lib/types";

type BrowserArtifact = (ArtifactCatalogEntry | UnfiledArtifactEntry) & { unfiled?: boolean };

const MAX_DIRECT_UPLOADS = 16;

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function ArtifactBrowser() {
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const searchParams = useSearchParams();
  const { activeOrgId, hasScope } = useOrgContext();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const path = searchParams.get("path")?.replace(/^\/+|\/+$/g, "") ?? "";
  const selectedArtifactId = searchParams.get("artifact");
  const { data: catalog, error, isLoading, mutate: refreshCatalog } = useSWR(
    activeOrgId ? ["artifact-catalog", activeOrgId, path] as const : null,
    ([, , currentPath]) => fetchArtifactCatalog(currentPath),
  );
  const { data: detail, isLoading: detailLoading } = useSWR(
    activeOrgId && selectedArtifactId
      ? ["artifact-detail", activeOrgId, selectedArtifactId] as const
      : null,
    ([, , artifactId]) => fetchArtifactDetail(artifactId),
  );

  const directFolders = useMemo(
    () => catalog?.folders.filter((folder) => parentPath(folder.path) === path) ?? [],
    [catalog?.folders, path],
  );
  const directArtifacts = useMemo<BrowserArtifact[]>(() => {
    const placed = catalog?.artifacts.filter((artifact) => parentPath(artifact.path) === path) ?? [];
    if (path || !catalog) return placed;
    return [...placed, ...catalog.unfiled.map((artifact) => ({ ...artifact, unfiled: true }))];
  }, [catalog, path]);
  const revisionCount = detail?.revisions.length ?? 1;

  useEffect(() => () => {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
  }, [activeOrgId]);

  function navigate(nextPath: string, artifactId?: string) {
    const next = new URLSearchParams();
    if (nextPath) next.set("path", nextPath);
    if (artifactId) next.set("artifact", artifactId);
    router.push(`/dashboard/library/artifacts${next.size ? `?${next}` : ""}`);
  }

  async function handleUploadArtifacts(files: FileList) {
    if (!activeOrgId || uploadingCount > 0 || !catalog) return;
    const selectedFiles = Array.from(files).slice(0, MAX_DIRECT_UPLOADS);
    if (selectedFiles.length === 0) return;
    if (files.length > MAX_DIRECT_UPLOADS) {
      toast.warning(`Only the first ${MAX_DIRECT_UPLOADS} files will be uploaded.`);
    }

    const uploadOrgId = activeOrgId;
    const uploadPath = catalog.path;
    const controller = new AbortController();
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = controller;
    setUploadingCount(selectedFiles.length);

    try {
      const results = await Promise.allSettled(selectedFiles.map((file) => (
        uploadArtifact(file, uploadOrgId, {
          signal: controller.signal,
          publishPath: uploadPath ? `${uploadPath}/${file.name}` : file.name,
        })
      )));
      if (controller.signal.aborted) return;

      const uploaded = results.flatMap((result) => (
        result.status === "fulfilled" ? [result.value] : []
      ));
      const failed = results.flatMap((result) => (
        result.status === "rejected" ? [result.reason] : []
      ));

      if (uploaded.length > 0) {
        await refreshCatalog();
        navigate(uploadPath, uploaded[0].id);
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
      await refreshCatalog();
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

  return <>
    <TopBar title="Library" />
    <PageContent className="space-y-4">
      <Breadcrumbs items={breadcrumbs} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="theme-text text-2xl font-semibold">Artifacts</h1>
          <p className="theme-text-muted mt-1 text-sm">Organization files with immutable revision history.</p>
        </div>
        {hasScope("artifacts:write") ? <>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void handleUploadArtifacts(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => uploadInputRef.current?.click()}
            isLoading={uploadingCount > 0}
            disabled={!catalog || Boolean(error)}
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            {uploadingCount > 0 ? `Uploading ${uploadingCount}…` : "Upload artifacts"}
          </Button>
        </> : null}
      </header>

      <LibraryTabs />

      <div className="grid min-h-[36rem] gap-4 xl:grid-cols-[minmax(24rem,1fr)_minmax(30rem,1.25fr)]">
        <section className="theme-border overflow-hidden rounded-xl border">
          <div className="theme-surface-muted theme-border flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <LibraryBig aria-hidden="true" className="h-4 w-4" />
            {path || "All artifacts"}
          </div>
          {isLoading ? <p className="theme-text-muted flex items-center gap-2 p-4 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading artifacts…</p> : null}
          {error ? <p className="p-4 text-sm text-red-600" role="alert">Artifacts could not be loaded.</p> : null}
          {!isLoading && !error && directFolders.length === 0 && directArtifacts.length === 0 ? <p className="theme-text-muted p-4 text-sm">This folder is empty.</p> : null}
          <div className="divide-y theme-border">
            {directFolders.map((folder) => <button
              key={folder.folder_id}
              type="button"
              onClick={() => navigate(folder.path)}
              className="theme-text flex w-full items-center gap-3 px-4 py-3 text-left hover:theme-surface-muted"
            >
              <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
            </button>)}
            {directArtifacts.map((artifact) => <button
              key={`${artifact.unfiled ? "unfiled" : "placed"}:${artifact.artifact_id}`}
              type="button"
              onClick={() => navigate(path, artifact.artifact_id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:theme-surface-muted ${selectedArtifactId === artifact.artifact_id ? "bg-cyan-50 dark:bg-cyan-950/30" : ""}`}
            >
              <File aria-hidden="true" className="h-5 w-5 shrink-0 text-cyan-600" />
              <span className="min-w-0 flex-1">
                <span className="theme-text block truncate text-sm font-medium">{artifact.name}</span>
                <span className="theme-text-muted block truncate text-xs">
                  {formatBytes(artifact.size_bytes)} · revision {artifact.revision_number}
                  {artifact.unfiled ? " · Unfiled" : ""}
                </span>
              </span>
              {artifact.revision_count > 1 ? <span className="theme-surface-muted theme-text-muted rounded-full px-2 py-0.5 text-[11px]">{artifact.revision_count} revisions</span> : null}
            </button>)}
          </div>
        </section>

        <section className="theme-border min-w-0 rounded-xl border p-4">
          {!selectedArtifactId ? <div className="theme-text-muted flex h-full min-h-72 items-center justify-center text-sm">Select an artifact to preview it.</div> : null}
          {selectedArtifactId ? <>
            <ArtifactViewer
              artifactId={selectedArtifactId}
              framed={false}
              actions={detail && hasScope("library:write") ? <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Delete
              </Button> : undefined}
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
    </PageContent>
  </>;
}

export default function ArtifactsPage() {
  return <Suspense fallback={<PreviewFallback />}><ArtifactBrowser /></Suspense>;
}

function PreviewFallback() {
  return <><TopBar title="Library" /><PageContent><p className="theme-text-muted text-sm">Loading artifacts…</p></PageContent></>;
}
