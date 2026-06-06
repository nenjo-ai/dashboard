"use client";

import { Suspense, use, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useRoutine,
  useAgents,
  useCouncils,
  useProjects,
} from "@/lib/hooks";
import { updateRoutine } from "@/lib/api";
import type { Project } from "@/lib/types";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { RoutineEditor } from "@/components/routine/RoutineEditor";
import { RoutineRunTab } from "@/components/routine/RoutineRunTab";

// ---------------------------------------------------------------------------
// Detail page for a single routine
// ---------------------------------------------------------------------------

export default function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense>
      <RoutineDetailContent params={params} />
    </Suspense>
  );
}

function RoutineDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") as "edit" | "run" | null;

  const { routine, isLoading, isError, mutate: mutateRoutine } = useRoutine(id);
  const { agents, isLoading: agentsLoading } = useAgents();
  const { councils } = useCouncils();
  const { projects } = useProjects();

  const isCron = routine?.trigger === "cron";
  const needsTabs = isCron;
  const initialTabValue =
    initialTab === "edit" || initialTab === "run" ? initialTab : null;
  const defaultTab = initialTabValue ?? (isCron ? "run" : "edit");
  const [selectedTab, setSelectedTab] = useState<"edit" | "run" | null>(
    initialTabValue,
  );
  const activeTab = selectedTab ?? defaultTab;

  const handleSaved = useCallback(() => {
    mutateRoutine();
  }, [mutateRoutine]);

  // ── Loading / Error ─────────────────────────────────────────────────────
  if (isLoading || agentsLoading) {
    return (
      <>
        <TopBar title="Routine" />
        <PageContent>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
          <div className="mt-4 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        </PageContent>
      </>
    );
  }

  if (isError || !routine) {
    return (
      <>
        <TopBar title="Routine" />
        <PageContent>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              Routine not found or failed to load.
            </p>
          </div>
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar title={routine.name} />
      <PageContent>
        {/* Back + header */}
        <div className="mb-1">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
        </div>

        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
              {routine.name}
            </h2>
            <div className="mt-1">
              <InlineDescription
                routineId={routine.id}
                value={routine.description}
                onSaved={handleSaved}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={routine.is_active ? "active" : "inactive"}>
              {routine.is_active ? "Active" : "Inactive"}
            </Badge>
            {routine.is_default && <Badge variant="ready">Default</Badge>}
          </div>
        </div>

        {/* Project association (cron routines) */}
        {isCron && projects && (
          <div className="mb-5">
            <ProjectBinding
              routineId={routine.id}
              projectId={routine.project_id}
              projects={projects}
              onSaved={handleSaved}
            />
          </div>
        )}

        {/* Tabs for cron, direct editor for others */}
        {needsTabs ? (
          <>
            <div className="mb-4">
              <Tabs
                tabs={[
                  { id: "run", label: "Run" },
                  { id: "edit", label: "Editor" },
                ]}
                activeTab={activeTab}
                onChange={(id) => setSelectedTab(id as "edit" | "run")}
                layoutId="routine-detail-tab"
              />
            </div>

            {activeTab === "edit" && (
              <div
                className="theme-border theme-surface overflow-hidden rounded-xl border"
                style={{ height: "calc(100vh - 22rem)" }}
              >
                <RoutineEditor
                  routine={routine}
                  agents={agents ?? []}
                  councils={councils}
                  onSaved={handleSaved}
                />
              </div>
            )}

            {activeTab === "run" && (
              <div className="theme-border theme-surface overflow-hidden rounded-xl border">
                <RoutineRunTab routine={routine} onSaved={handleSaved} />
              </div>
            )}
          </>
        ) : (
          <div
            className="theme-border theme-surface overflow-hidden rounded-xl border"
            style={{ height: "calc(100vh - 18rem)" }}
          >
            <RoutineEditor
              routine={routine}
              agents={agents ?? []}
              councils={councils}
              onSaved={handleSaved}
            />
          </div>
        )}
      </PageContent>
    </>
  );
}

// ---------------------------------------------------------------------------
// Back arrow icon
// ---------------------------------------------------------------------------

function BackArrow() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable description (reused pattern)
// ---------------------------------------------------------------------------

function InlineDescription({
  routineId,
  value,
  onSaved,
}: {
  routineId: string;
  value: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateRoutine(routineId, { description: trimmed });
      onSaved();
    } catch {
      setDraft(value ?? "");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, value, routineId, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder="Add a description..."
        className="w-full rounded-sm border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 disabled:opacity-50"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-full text-left group flex items-center gap-1"
      title="Click to edit description"
    >
      <span className={value ? "" : "italic"}>
        {value || "Add a description..."}
      </span>
      <svg
        className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 shrink-0"
        fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Project assignment picker (cron routines)
// ---------------------------------------------------------------------------

function ProjectBinding({
  routineId,
  projectId,
  projects,
  onSaved,
}: {
  routineId: string;
  projectId: string | null;
  projects: Project[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelectProject = async (nextProjectId: string | null) => {
    setAssigning(true);
    try {
      await updateRoutine(routineId, { project_id: nextProjectId });
      onSaved();
      setOpen(false);
    } catch (err) {
      console.error("Failed to update routine project:", err);
    } finally {
      setAssigning(false);
    }
  };

  const assignedProject = projects.find((p) => p.id === projectId) ?? null;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Project Assignment
      </label>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={assigning}
        className="w-full flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left transition-all hover:border-solid group
          border-gray-200 hover:border-deep-space-blue-300 dark:border-gray-600 dark:hover:border-deep-space-blue-500"
      >
        {assignedProject ? (
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-deep-space-blue-50 dark:bg-deep-space-blue-900/40">
              <svg className="h-3.5 w-3.5 text-deep-space-blue-500 dark:text-deep-space-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
                {assignedProject.name}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Project-scoped cron context
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-gray-600">
              <svg className="h-3 w-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Assign to a project
            </span>
          </>
        )}
        <svg className="h-3.5 w-3.5 ml-auto text-gray-300 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800 max-h-56 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">
              No projects available
            </p>
          ) : (
            <>
              <button
                onClick={() => handleSelectProject(null)}
                disabled={assigning}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  projectId === null
                    ? "bg-deep-space-blue-50 dark:bg-deep-space-blue-900/30"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${projectId === null ? "text-deep-space-blue-600 dark:text-deep-space-blue-300" : "text-gray-700 dark:text-gray-200"}`}>
                    No project
                  </p>
                </div>
              </button>
              {projects.map((project) => {
                const isAssigned = project.id === projectId;
                return (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
                    disabled={assigning}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                      ${isAssigned
                        ? "bg-deep-space-blue-50 dark:bg-deep-space-blue-900/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isAssigned ? "text-deep-space-blue-600 dark:text-deep-space-blue-300" : "text-gray-700 dark:text-gray-200"}`}>
                        {project.name}
                      </p>
                      {project.description && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                          {project.description}
                        </p>
                      )}
                    </div>
                    {isAssigned && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-deep-space-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
