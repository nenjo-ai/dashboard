"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectRepoSettings, RepoSyncStatus } from "@/lib/types";
import { updateProject, deleteProject, syncRepo, disconnectRepo } from "@/lib/api";
import { useAgents } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

// ---------------------------------------------------------------------------
// Chat agent picker dropdown
// ---------------------------------------------------------------------------

function ChatAgentDropdown({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { agents } = useAgents();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  const handleSelect = (agentId: string) => {
    setOpen(false);
    router.push(`/dashboard/chat?project=${projectId}&agent=${agentId}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        Open in Chat
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && agents && agents.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
            Select Agent
          </div>
          <div className="max-h-64 overflow-y-auto">
            {agents.filter((a) => !a.is_system).map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => handleSelect(agent.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <RoleIdenticon
                  roleId={agent.id}
                  color={agent.color}
                  size={22}
                  className="shrink-0"
                  roleName={agent.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{agent.name}</p>
                  {agent.description && (
                    <p className="text-xs text-gray-400 truncate dark:text-gray-500">
                      {agent.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project header
// ---------------------------------------------------------------------------

interface ProjectHeaderProps {
  project: Project | undefined;
  projectId: string;
  isLoading: boolean;
  onUpdated: () => void;
}

export function ProjectHeader({
  project,
  projectId,
  isLoading,
  onUpdated,
}: ProjectHeaderProps) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [repoModalOpen, setRepoModalOpen] = useState(false);
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingBranch, setEditingBranch] = useState(false);
  const [branchInput, setBranchInput] = useState("");

  const startEditName = useCallback(() => {
    if (!project) return;
    setName(project.name);
    setEditingName(true);
  }, [project]);

  const startEditDesc = useCallback(() => {
    if (!project) return;
    setDescription(project.description ?? "");
    setEditingDesc(true);
  }, [project]);

  const saveName = useCallback(async () => {
    if (!project || !name.trim()) return;
    setSaving(true);
    try {
      await updateProject(project.id, { name: name.trim() });
      setEditingName(false);
      onUpdated();
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  }, [project, name, onUpdated]);

  const saveDescription = useCallback(async () => {
    if (!project) return;
    setSaving(true);
    try {
      await updateProject(project.id, {
        description: description.trim() || null,
      });
      setEditingDesc(false);
      onUpdated();
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  }, [project, description, onUpdated]);

  // Extract typed repo settings from the JSONB settings field
  const repoSettings: ProjectRepoSettings = (project?.settings ?? {}) as ProjectRepoSettings;
  const repoUrl = repoSettings.repo_url ?? null;
  const repoSyncStatus: RepoSyncStatus | undefined = repoSettings.repo_sync_status;
  const repoSyncError = repoSettings.repo_sync_error;
  const targetBranch = repoSettings.target_branch ?? "main";

  const handleSyncRepo = useCallback(
    async (url: string) => {
      if (!project || !url.trim()) return;
      setSyncing(true);
      try {
        await syncRepo(project.id, url.trim());
        setRepoModalOpen(false);
        setRepoUrlInput("");
        onUpdated();
      } catch {
        // keep modal open
      } finally {
        setSyncing(false);
      }
    },
    [project, onUpdated],
  );

  const handleDisconnectRepo = useCallback(async () => {
    if (!project) return;
    setDisconnecting(true);
    try {
      await disconnectRepo(project.id);
      setConfirmDisconnect(false);
      onUpdated();
    } catch {
      // keep modal open
    } finally {
      setDisconnecting(false);
    }
  }, [project, onUpdated]);

  const startEditBranch = useCallback(() => {
    setBranchInput(targetBranch);
    setEditingBranch(true);
  }, [targetBranch]);

  const saveBranch = useCallback(async () => {
    if (!project || !branchInput.trim()) return;
    setSaving(true);
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, target_branch: branchInput.trim() },
      });
      setEditingBranch(false);
      onUpdated();
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  }, [project, branchInput, onUpdated]);

  const syncStatusBadge = (() => {
    if (!repoSyncStatus) return null;
    const map: Record<RepoSyncStatus, { variant: string; label: string }> = {
      syncing: { variant: "running", label: "Syncing..." },
      synced: { variant: "completed", label: "Synced" },
      error: { variant: "failed", label: "Sync failed" },
    };
    const { variant, label } = map[repoSyncStatus];
    return (
      <Badge
        variant={variant}
        showDot
        title={repoSyncStatus === "error" ? repoSyncError : undefined}
      >
        {label}
      </Badge>
    );
  })();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-2">
      {/* Name row */}
      <div className="flex items-center justify-between">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold text-gray-900 border-b-2 border-deep-space-blue-400 bg-transparent outline-hidden px-1 py-0.5 dark:text-gray-100"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              disabled={saving}
            />
            <Button size="sm" onClick={saveName} disabled={saving}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingName(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <h1
            className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-deep-space-blue-600 transition-colors group inline-flex items-center gap-2 dark:text-gray-100 dark:hover:text-deep-space-blue-400"
            onClick={startEditName}
          >
            {project.name}
            <span className="text-sm font-normal text-gray-400 dark:text-gray-500">
              — {project.slug}
            </span>
            <svg
              className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </h1>
        )}

        <ChatAgentDropdown projectId={projectId} />
      </div>

      {/* Description */}
      {editingDesc ? (
        <div className="flex items-start gap-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-sm text-gray-600 border border-gray-300 rounded-lg bg-white px-3 py-2 outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 w-full max-w-lg resize-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
            rows={2}
            autoFocus
            disabled={saving}
          />
          <div className="flex flex-col gap-1">
            <Button size="sm" onClick={saveDescription} disabled={saving}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingDesc(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 transition-colors inline-flex items-center gap-1 group dark:text-gray-400 dark:hover:text-gray-200"
          onClick={startEditDesc}
        >
          {project.description || "Add a description..."}
          <svg
            className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
            />
          </svg>
        </p>
      )}

      {/* Repo link + sync status + actions */}
      <div className="flex items-center gap-4 flex-wrap">
        {repoUrl ? (
          <>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-deep-space-blue-500 hover:text-deep-space-blue-700 transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.814a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757"
                />
              </svg>
              {repoUrl}
            </a>
            {syncStatusBadge}
            {editingBranch ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Target:</span>
                <input
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  className="w-28 rounded-sm border border-gray-300 bg-white px-1.5 py-0.5 text-xs outline-hidden focus:border-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBranch();
                    if (e.key === "Escape") setEditingBranch(false);
                  }}
                  disabled={saving}
                />
                <Button size="sm" onClick={saveBranch} disabled={saving}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingBranch(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <button
                type="button"
                onClick={startEditBranch}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors group dark:text-gray-400 dark:hover:text-gray-200"
              >
                <span>Target: <span className="font-medium">{targetBranch}</span></span>
                <svg
                  className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                  />
                </svg>
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSyncRepo(repoUrl)}
              disabled={syncing}
            >
              Re-sync
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRepoUrlInput(repoUrl);
                setRepoModalOpen(true);
              }}
            >
              Edit
            </Button>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.181 8.68a4.503 4.503 0 0 1 1.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 0 0 6.364 6.364l3.75-3.75m-6-6 3.75-3.75a4.5 4.5 0 0 1 6.364 0m-4.773 4.773L18.44 5.56"
                />
              </svg>
              Disconnect
            </button>
          </>
        ) : null}

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            Delete project
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 dark:border-red-800 dark:bg-red-950/30">
            <span className="text-xs text-red-700 dark:text-red-400">
              Delete &ldquo;{project.name}&rdquo;? This cannot be undone.
            </span>
            <button
              type="button"
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteProject(project.id);
                  router.push("/dashboard");
                } catch {
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              disabled={deleting}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Connect / Edit Repo Modal */}
      <Modal
        open={repoModalOpen}
        onClose={() => setRepoModalOpen(false)}
        title={repoUrl ? "Edit Repository" : "Connect Repository"}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {repoUrl
              ? "Update the git repository URL for this project. This will re-sync the repo."
              : "Enter the URL of the git repository to clone for this project."}
          </p>
          <input
            type="url"
            value={repoUrlInput}
            onChange={(e) => setRepoUrlInput(e.target.value)}
            placeholder="https://github.com/owner/repo.git"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSyncRepo(repoUrlInput);
            }}
            disabled={syncing}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRepoModalOpen(false)}
              disabled={syncing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleSyncRepo(repoUrlInput)}
              disabled={syncing || !repoUrlInput.trim()}
            >
              {syncing ? "Connecting..." : repoUrl ? "Save & Sync" : "Connect"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disconnect Repo Confirmation Modal */}
      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Repository"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will remove the synced repository and all worktrees for this
            project. Task history and project data will be preserved.
          </p>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDisconnect(false)}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleDisconnectRepo}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
