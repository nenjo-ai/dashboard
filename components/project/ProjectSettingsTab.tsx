"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import { updateProject, syncRepo, disconnectRepo } from "@/lib/api";
import type { Project, ProjectRepoSettings, RepoSyncStatus } from "@/lib/types";

interface ProjectSettingsTabProps {
  project: Project | undefined;
  onUpdated: () => void;
}

type MetadataEntry = { key: string; value: string };

function getMetadata(project: Project): MetadataEntry[] {
  const raw = (project.settings as Record<string, unknown>)?.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, string>).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }
  return [];
}

export function ProjectSettingsTab({ project, onUpdated }: ProjectSettingsTabProps) {
  // -- Git settings state --
  const repoSettings = (project?.settings ?? {}) as ProjectRepoSettings;
  const repoUrl = repoSettings.repo_url ?? "";
  const repoSyncStatus: RepoSyncStatus | undefined = repoSettings.repo_sync_status;
  const repoSyncError = repoSettings.repo_sync_error;
  const targetBranch = repoSettings.target_branch ?? "main";

  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [branchInput, setBranchInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // -- Metadata state --
  const [entries, setEntries] = useState<MetadataEntry[]>([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setRepoUrlInput(repoUrl);
      setBranchInput(targetBranch);
      setEntries(getMetadata(project));
    }
  }, [project, repoUrl, targetBranch]);

  // -- Git handlers --
  const handleSaveAndSync = useCallback(async () => {
    if (!project || !repoUrlInput.trim()) return;
    setSyncing(true);
    setGitError(null);
    try {
      // Save branch setting alongside sync
      await updateProject(project.id, {
        settings: {
          ...project.settings,
          target_branch: branchInput.trim() || "main",
        },
      });
      await syncRepo(project.id, repoUrlInput.trim());
      onUpdated();
    } catch (err) {
      setGitError(err instanceof Error ? err.message : "Failed to save & sync repo");
    } finally {
      setSyncing(false);
    }
  }, [project, repoUrlInput, branchInput, onUpdated]);

  const handleDisconnect = useCallback(async () => {
    if (!project) return;
    setDisconnecting(true);
    try {
      await disconnectRepo(project.id);
      setConfirmDisconnect(false);
      setRepoUrlInput("");
      onUpdated();
    } catch (err) {
      setGitError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }, [project, onUpdated]);

  // -- Metadata handlers --
  const addEntry = () => setEntries((prev) => [...prev, { key: "", value: "" }]);

  const updateEntry = (index: number, field: "key" | "value", val: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)));
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const saveMetadata = useCallback(async () => {
    if (!project) return;
    setSavingMeta(true);
    setMetaError(null);
    setMetaSaved(false);
    const metadata: Record<string, string> = {};
    for (const e of entries) {
      const k = e.key.trim();
      if (k) metadata[k] = e.value;
    }
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, metadata },
      });
      onUpdated();
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2000);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setSavingMeta(false);
    }
  }, [project, entries, onUpdated]);

  // -- Derived --
  const syncStatusBadge = (() => {
    if (!repoSyncStatus) return null;
    const map: Record<RepoSyncStatus, { variant: string; label: string }> = {
      syncing: { variant: "running", label: "Syncing..." },
      synced: { variant: "completed", label: "Synced" },
      error: { variant: "failed", label: "Sync failed" },
    };
    const { variant, label } = map[repoSyncStatus];
    return (
      <Badge variant={variant} showDot title={repoSyncStatus === "error" ? repoSyncError : undefined}>
        {label}
      </Badge>
    );
  })();

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  const gitDirty = repoUrlInput.trim() !== repoUrl || branchInput.trim() !== targetBranch;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Git Repository Card                                              */}
      {/* ---------------------------------------------------------------- */}
      <Card static>
        <CardHeader>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <CardTitle>Git Repository</CardTitle>
            {syncStatusBadge}
          </div>
          <CardDescription>
            Connect a git repository so agents can read and write code for this project.
            To switch repositories, disconnect the current one first.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Repo URL */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Repository URL
            </label>
            <input
              type="url"
              value={repoUrlInput}
              onChange={(e) => setRepoUrlInput(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              disabled={syncing}
            />
          </div>

          {/* Branch */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Branch
            </label>
            <input
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              placeholder="main"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              disabled={syncing}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Agents will pull and push from this branch
            </p>
          </div>

          {gitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {gitError}
            </div>
          )}
        </CardContent>

        <CardFooter className="gap-3 flex-wrap">
          <Button size="sm" onClick={handleSaveAndSync} disabled={syncing || !repoUrlInput.trim().endsWith(".git")}>
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
              </svg>
              {syncing ? "Syncing..." : gitDirty ? "Save & Sync" : "Sync"}
            </span>
          </Button>
          {repoUrl && !confirmDisconnect && (
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 0 1 1.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 0 0 6.364 6.364l3.75-3.75m-6-6 3.75-3.75a4.5 4.5 0 0 1 6.364 0m-4.773 4.773L18.44 5.56" />
              </svg>
              Disconnect
            </button>
          )}
          {repoUrl && confirmDisconnect && (
            <div className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 dark:border-red-800 dark:bg-red-950/30">
              <span className="text-xs text-red-700 dark:text-red-400">
                Disconnect repo? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {disconnecting ? "..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                disabled={disconnecting}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Metadata Card                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Card static>
        <CardHeader>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            <CardTitle>Metadata</CardTitle>
          </div>
          <CardDescription>
            Custom key-value metadata attached to this project. Available to agents during execution.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {entries.length > 0 && (
            <div className="space-y-2">
              {/* Header row */}
              <div className="flex items-center gap-2 px-1">
                <span className="w-80 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Key</span>
                <span className="flex-1 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Value</span>
                <span className="w-9" />
              </div>
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={entry.key}
                    onChange={(e) => updateEntry(i, "key", e.target.value)}
                    placeholder="key"
                    className="w-80 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <input
                    value={entry.value}
                    onChange={(e) => updateEntry(i, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(i)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors dark:hover:bg-red-950/30"
                    title="Remove"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {entries.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-8 text-center dark:border-gray-600 dark:bg-gray-800/50">
              <svg className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                No metadata yet
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={addEntry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-deep-space-blue-400 hover:text-deep-space-blue-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-deep-space-blue-400 dark:hover:text-deep-space-blue-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add field
          </button>
        </CardContent>

        <CardFooter className="gap-3">
          <Button size="sm" onClick={saveMetadata} disabled={savingMeta}>
            {savingMeta ? "Saving..." : "Save Metadata"}
          </Button>
          {metaSaved && (
            <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
          )}
          {metaError && (
            <span className="text-sm text-flag-red-600 dark:text-flag-red-400">{metaError}</span>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
