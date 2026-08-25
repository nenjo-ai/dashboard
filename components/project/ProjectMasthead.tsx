"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  FolderKanban,
  GitBranch,
  MessageSquare,
  Pencil,
  X,
} from "lucide-react";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { Button } from "@/components/ui/Button";
import { updateProject } from "@/lib/api";
import { useAgents } from "@/lib/hooks";
import type { Project, ProjectRepoSettings } from "@/lib/types";

function ProjectChatLauncher({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { agents, isLoading } = useAgents();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const availableAgents = useMemo(
    () => agents?.filter((agent) => !agent.is_system) ?? [],
    [agents],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full sm:w-auto"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Open in chat
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
      </Button>

      {open ? (
        <div
          className="theme-surface-elevated theme-border absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border p-1.5 shadow-xl"
          role="menu"
        >
          <p className="theme-text-muted px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.13em]">
            Start with an agent
          </p>
          {isLoading ? (
            <div className="theme-text-muted flex items-center gap-2 px-2.5 py-3 text-xs" role="status">
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="animate-loading-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${dot * 120}ms` }} />
                ))}
              </span>
              Loading agents
            </div>
          ) : availableAgents.length === 0 ? (
            <p className="theme-text-muted px-2.5 py-3 text-xs">
              Create an agent before starting a project conversation.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  role="menuitem"
                  onClick={() => router.push(`/dashboard/chat?project=${encodeURIComponent(projectId)}&agent=${encodeURIComponent(agent.id)}`)}
                  className="theme-text flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:[background:var(--app-hover)]"
                >
                  <RoleIdenticon roleId={agent.id} color={agent.color} size={24} name={agent.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{agent.name}</span>
                    {agent.description ? <span className="theme-text-muted block truncate text-xs">{agent.description}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectMasthead({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState<"name" | "description" | null>(null);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const repo = project.settings as ProjectRepoSettings;

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
  }, [project.description, project.name]);

  const cancelEditing = useCallback(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setEditing(null);
  }, [project.description, project.name]);

  const saveField = useCallback(async () => {
    if (editing === "name" && !name.trim()) return;
    setSaving(true);
    try {
      await updateProject(
        project.id,
        editing === "name"
          ? { name: name.trim() }
          : { description: description.trim() || null },
      );
      setEditing(null);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }, [description, editing, name, onUpdated, project.id]);

  return (
    <section className="theme-border theme-surface relative overflow-visible rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-deep-space-blue-500/[0.07] blur-3xl dark:bg-deep-space-blue-400/[0.08]" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
            <FolderKanban className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              {editing === "name" ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveField();
                      if (event.key === "Escape") cancelEditing();
                    }}
                    className="theme-surface theme-border theme-text min-w-0 max-w-md rounded-lg border px-2.5 py-1 text-xl font-semibold outline-hidden focus:border-deep-space-blue-400"
                    autoFocus
                    disabled={saving}
                    aria-label="Project name"
                  />
                  <button type="button" onClick={() => void saveField()} className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" aria-label="Save project name"><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={cancelEditing} className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" aria-label="Cancel editing project name"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setEditing("name")} className="group flex min-w-0 items-center gap-2 text-left">
                  <h2 className="theme-text truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{project.name}</h2>
                  <Pencil className="theme-text-muted h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                  <span className="sr-only">Edit project name</span>
                </button>
              )}
              <code className="theme-surface-muted theme-border theme-text-muted rounded-md border px-2 py-0.5 text-[11px]">{project.slug}</code>
            </div>

            {editing === "description" ? (
              <div className="mt-2 flex max-w-2xl items-start gap-1.5">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="theme-surface theme-border theme-text min-h-20 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400"
                  autoFocus
                  disabled={saving}
                  aria-label="Project description"
                />
                <button type="button" onClick={() => void saveField()} className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" aria-label="Save project description"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={cancelEditing} className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" aria-label="Cancel editing project description"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => setEditing("description")} className="group mt-2 flex max-w-2xl items-start gap-1.5 text-left">
                <span className="theme-text-muted text-sm leading-6">{project.description || "Add a short description to orient agents and collaborators."}</span>
                <Pencil className="theme-text-muted mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                <span className="sr-only">Edit project description</span>
              </button>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="theme-surface-muted theme-border theme-text-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {repo.repo_url ? repo.target_branch || "main" : "No repository"}
              </span>
              {repo.repo_sync_status ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${repo.repo_sync_status === "synced" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300" : repo.repo_sync_status === "error" ? "border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300" : "border-blue-200/80 bg-blue-50/80 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300"}`} role="status">
                  <span className={`h-1.5 w-1.5 rounded-full bg-current ${repo.repo_sync_status === "syncing" ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                  {repo.repo_sync_status === "synced" ? "Repository synced" : repo.repo_sync_status === "error" ? "Sync needs attention" : "Syncing repository"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <ProjectChatLauncher projectId={project.id} />
      </div>
    </section>
  );
}
