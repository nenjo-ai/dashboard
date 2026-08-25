"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  GitBranch,
  Link2,
  Plus,
  Tags,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteProject, disconnectRepo, syncRepo, updateProject } from "@/lib/api";
import type { Project, ProjectRepoSettings } from "@/lib/types";

type MetadataEntry = { key: string; value: string };

function getMetadata(project: Project): MetadataEntry[] {
  const raw = (project.settings as Record<string, unknown>).metadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

function normalizedMetadata(entries: MetadataEntry[]) {
  return entries
    .filter((entry) => entry.key.trim())
    .map((entry) => ({ key: entry.key.trim(), value: entry.value }));
}

export function ProjectSettingsTab({ project, onUpdated }: { project: Project | undefined; onUpdated: () => void }) {
  const router = useRouter();
  const repo = (project?.settings ?? {}) as ProjectRepoSettings;
  const repoUrl = repo.repo_url ?? "";
  const targetBranch = repo.target_branch ?? "main";
  const [showRepoForm, setShowRepoForm] = useState(Boolean(repoUrl));
  const [repoUrlInput, setRepoUrlInput] = useState(repoUrl);
  const [branchInput, setBranchInput] = useState(targetBranch);
  const [syncing, setSyncing] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [entries, setEntries] = useState<MetadataEntry[]>(project ? getMetadata(project) : []);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataSaved, setMetadataSaved] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!project) return;
    setRepoUrlInput(repoUrl);
    setBranchInput(targetBranch);
    setShowRepoForm(Boolean(repoUrl));
    setEntries(getMetadata(project));
  }, [project, repoUrl, targetBranch]);

  const repositoryDirty = repoUrlInput.trim() !== repoUrl || (branchInput.trim() || "main") !== targetBranch;
  const metadataDirty = useMemo(() => {
    if (!project) return false;
    return JSON.stringify(normalizedMetadata(entries)) !== JSON.stringify(normalizedMetadata(getMetadata(project)));
  }, [entries, project]);

  const saveAndSync = useCallback(async () => {
    if (!project || !repoUrlInput.trim()) return;
    setSyncing(true);
    setRepoError(null);
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, target_branch: branchInput.trim() || "main" },
      });
      await syncRepo(project.id, repoUrlInput.trim());
      onUpdated();
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : "Could not connect the repository.");
    } finally {
      setSyncing(false);
    }
  }, [branchInput, onUpdated, project, repoUrlInput]);

  const disconnect = useCallback(async () => {
    if (!project) return;
    setDisconnecting(true);
    setRepoError(null);
    try {
      await disconnectRepo(project.id);
      setDisconnectOpen(false);
      setShowRepoForm(false);
      setRepoUrlInput("");
      onUpdated();
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : "Could not disconnect the repository.");
    } finally {
      setDisconnecting(false);
    }
  }, [onUpdated, project]);

  const saveMetadata = useCallback(async () => {
    if (!project || !metadataDirty) return;
    setSavingMetadata(true);
    setMetadataError(null);
    setMetadataSaved(false);
    const metadata = Object.fromEntries(normalizedMetadata(entries).map((entry) => [entry.key, entry.value]));
    try {
      await updateProject(project.id, { settings: { ...project.settings, metadata } });
      onUpdated();
      setMetadataSaved(true);
      window.setTimeout(() => setMetadataSaved(false), 2000);
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : "Could not save metadata.");
    } finally {
      setSavingMetadata(false);
    }
  }, [entries, metadataDirty, onUpdated, project]);

  const removeProject = useCallback(async () => {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push("/dashboard/projects");
    } finally {
      setDeleting(false);
    }
  }, [project, router]);

  if (!project) return null;

  return (
    <div className="space-y-5">
      <Card static>
        <CardHeader className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="theme-text-muted h-4 w-4" aria-hidden="true" />
                <CardTitle className="text-base">Repository</CardTitle>
                {repo.repo_sync_status ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${repo.repo_sync_status === "synced" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300" : repo.repo_sync_status === "error" ? "border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300" : "border-blue-200/80 bg-blue-50/80 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300"}`} role="status">
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${repo.repo_sync_status === "syncing" ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                    {repo.repo_sync_status === "synced" ? "Synced" : repo.repo_sync_status === "error" ? "Sync failed" : "Syncing"}
                  </span>
                ) : null}
              </div>
              <CardDescription className="mt-1.5">Connect source code so agents can work with the project repository.</CardDescription>
            </div>
            {repoUrl ? (
              <a href={repoUrl} target="_blank" rel="noreferrer" className="theme-text-muted inline-flex items-center gap-1.5 text-xs font-medium hover:text-deep-space-blue-600 dark:hover:text-deep-space-blue-300">
                Open repository <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </CardHeader>

        {!repoUrl && !showRepoForm ? (
          <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
            <div className="theme-surface-muted theme-border flex flex-col items-center rounded-xl border border-dashed px-6 py-9 text-center">
              <span className="theme-surface theme-border theme-text-muted flex h-11 w-11 items-center justify-center rounded-xl border"><Link2 className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="theme-text mt-3 text-sm font-semibold">No repository connected</h3>
              <p className="theme-text-muted mt-1 max-w-md text-sm leading-6">Connect a Git repository when this project needs code-aware agents. You can also keep the project context-only.</p>
              <Button className="mt-4" size="sm" onClick={() => setShowRepoForm(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Connect repository</Button>
            </div>
          </CardContent>
        ) : (
          <>
            <CardContent className="grid gap-4 px-5 md:grid-cols-[minmax(0,1fr)_14rem] md:px-6">
              <label className="space-y-1.5">
                <span className="theme-text block text-xs font-medium">Repository URL</span>
                <input type="url" value={repoUrlInput} onChange={(event) => setRepoUrlInput(event.target.value)} placeholder="https://github.com/owner/repository.git" className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400" disabled={syncing} />
              </label>
              <label className="space-y-1.5">
                <span className="theme-text block text-xs font-medium">Working branch</span>
                <input value={branchInput} onChange={(event) => setBranchInput(event.target.value)} placeholder="main" className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400" disabled={syncing} />
              </label>
              {repo.repo_sync_error ? <p className="text-sm text-rose-600 dark:text-rose-300 md:col-span-2">{repo.repo_sync_error}</p> : null}
              {repoError ? <p className="text-sm text-rose-600 dark:text-rose-300 md:col-span-2">{repoError}</p> : null}
            </CardContent>
            <CardFooter className="flex-wrap gap-2 px-5 pb-5 md:px-6 md:pb-6">
              <Button size="sm" onClick={() => void saveAndSync()} disabled={syncing || !repoUrlInput.trim()} isLoading={syncing}>
                {repoUrl ? (repositoryDirty ? "Save & sync" : "Sync now") : "Connect & sync"}
              </Button>
              {!repoUrl ? <Button size="sm" variant="ghost" onClick={() => setShowRepoForm(false)}>Cancel</Button> : null}
              {repoUrl ? <Button size="sm" variant="ghost" className="ml-auto text-rose-600 dark:text-rose-300" onClick={() => setDisconnectOpen(true)}><Unlink className="h-3.5 w-3.5" aria-hidden="true" />Disconnect</Button> : null}
            </CardFooter>
          </>
        )}
      </Card>

      <Card static>
        <CardHeader className="p-5 md:p-6">
          <div className="flex items-center gap-2"><Tags className="theme-text-muted h-4 w-4" aria-hidden="true" /><CardTitle className="text-base">Metadata</CardTitle></div>
          <CardDescription>Optional key-value details exposed to agents during project work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-5 md:px-6">
          {entries.length === 0 ? (
            <div className="theme-surface-muted theme-border rounded-xl border border-dashed px-5 py-6 text-center"><p className="theme-text text-sm font-medium">No metadata fields</p><p className="theme-text-muted mt-1 text-xs">Add only the structured details agents need repeatedly.</p></div>
          ) : entries.map((entry, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_2.25rem]">
              <input value={entry.key} onChange={(event) => setEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder="Key" aria-label={`Metadata key ${index + 1}`} className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 font-mono text-sm outline-hidden focus:border-deep-space-blue-400" />
              <input value={entry.value} onChange={(event) => setEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Value" aria-label={`Metadata value ${index + 1}`} className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400" />
              <button type="button" onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="theme-text-muted flex h-9 w-9 items-center justify-center rounded-lg hover:bg-rose-500/10 hover:text-rose-600" aria-label={`Remove metadata field ${index + 1}`}><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setEntries((current) => [...current, { key: "", value: "" }])} className="theme-border theme-text-muted inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm hover:border-deep-space-blue-400 hover:text-deep-space-blue-600"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add field</button>
          {metadataError ? <p className="text-sm text-rose-600 dark:text-rose-300">{metadataError}</p> : null}
        </CardContent>
        <CardFooter className="gap-3 px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <Button size="sm" onClick={() => void saveMetadata()} disabled={!metadataDirty || savingMetadata} isLoading={savingMetadata}>Save metadata</Button>
          <span className="theme-text-muted text-xs" role="status" aria-live="polite">{metadataSaved ? "Saved" : metadataDirty ? "Unsaved changes" : "Up to date"}</span>
        </CardFooter>
      </Card>

      <section className="rounded-[1.4rem] border border-rose-200/80 bg-rose-50/40 p-5 dark:border-rose-400/20 dark:bg-rose-500/[0.055] md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-300"><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>
            <div><h2 className="text-sm font-semibold text-rose-900 dark:text-rose-100">Danger zone</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-rose-700/80 dark:text-rose-200/70">Deleting this project permanently removes its project record. This action cannot be undone.</p></div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete project</Button>
        </div>
      </section>

      <ConfirmDialog open={disconnectOpen} onClose={() => setDisconnectOpen(false)} onConfirm={() => void disconnect()} title="Disconnect repository?" message="This removes the synced repository and project worktrees. Project tasks, conversations, and history will remain." confirmLabel="Disconnect" loading={disconnecting} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => void removeProject()} title={`Delete ${project.name}?`} message="This permanently removes the project. This action cannot be undone." confirmLabel="Delete project" loading={deleting} />
    </div>
  );
}
