"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { MotionList, MotionItem } from "@/components/ui/motion";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RoutineSummary, CreateRoutineRequest } from "@/lib/types";
import { ROUTINE_TRIGGERS } from "@/lib/types";
import { createRoutine, deleteRoutine, triggerRoutine } from "@/lib/api";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RoutineListProps {
  routines: RoutineSummary[] | undefined;
  isLoading: boolean;
  onSelectRoutine: (routineId: string) => void;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoutineList({
  routines,
  isLoading,
  onSelectRoutine,
  onRefresh,
}: RoutineListProps) {
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTrigger, setNewTrigger] = useState("task");
  const [newSchedule, setNewSchedule] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (newTrigger === "cron" && !newSchedule.trim()) {
      setError("Schedule is required for cron triggers");
      return;
    }
    setCreating(true);
    setError(null);

    try {
      const routine = await createRoutine({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        trigger: newTrigger as CreateRoutineRequest["trigger"],
        ...(newTrigger === "cron" && newSchedule.trim()
          ? { metadata: { schedule: newSchedule.trim() } }
          : {}),
      });
      setNewName("");
      setNewDescription("");
      setNewSchedule("");
      setShowCreateForm(false);
      onRefresh();
      // Open the newly created routine
      onSelectRoutine(routine.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create routine");
    } finally {
      setCreating(false);
    }
  };

  const [triggering, setTriggering] = useState<string | null>(null);

  const handleTrigger = async (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggering(routineId);
    setError(null);
    try {
      await triggerRoutine(routineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger routine");
    } finally {
      setTriggering(null);
    }
  };

  const handleDelete = (routineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(routineId);
  };

  const executeDeleteRoutine = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteRoutine(confirmDeleteId);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete routine");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="theme-text text-lg font-semibold">
            Routines
          </h3>
          <p className="theme-text-muted text-sm">
            Configure agent execution routines that can be used across projects
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">New Routine</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <Card className="p-4">
          <div className="space-y-3">
            <div>
              <label className="theme-text-muted mb-1 block text-xs font-medium">
                Routine Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Code Review Routine"
                className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--app-text-muted)] focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="theme-text-muted mb-1 block text-xs font-medium">
                Description <span className="font-normal text-[var(--app-text-muted)]">(optional)</span>
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this routine do?"
                className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--app-text-muted)] focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="theme-text-muted mb-1 block text-xs font-medium">
                Trigger
              </label>
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
              >
                {ROUTINE_TRIGGERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {newTrigger === "cron" && (
              <div>
                <label className="theme-text-muted mb-1 block text-xs font-medium">
                  Schedule
                </label>
                <input
                  type="text"
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)}
                  placeholder="e.g., 0 9 * * * or 30m"
                  className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--app-text-muted)] focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <p className="theme-text-muted mt-1 text-xs">
                  Cron expression (e.g. &quot;0 9 * * *&quot;) or interval (e.g. &quot;30m&quot;, &quot;6h&quot;)
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleCreate} size="sm" disabled={creating || !newName.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName("");
                  setNewDescription("");
                  setNewSchedule("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Routine list */}
      {(!routines || routines.length === 0) && !showCreateForm ? (
        <Card className="p-8 text-center">
          <div className="theme-surface-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <svg className="theme-text-muted h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No routines yet. Create one to get started.
          </p>
        </Card>
      ) : (
        <MotionList className="space-y-2">
          {routines?.map((p) => {
            const triggerInfo = ROUTINE_TRIGGERS.find((t) => t.id === p.trigger);
            return (
              <MotionItem key={p.id}>
              <Card
                className="p-4 cursor-pointer hover:border-deep-space-blue-300 dark:hover:border-deep-space-blue-600 transition-colors"
                onClick={() => onSelectRoutine(p.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-deep-space-blue-50 dark:bg-deep-space-blue-900/30">
                      {p.trigger === "cron" ? (
                        <svg className="h-5 w-5 text-deep-space-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-deep-space-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {p.name}
                        </span>
                        {p.is_default && (
                          <Badge variant="ready">Default</Badge>
                        )}
                        {!p.is_active && (
                          <Badge variant="inactive">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {triggerInfo?.label ?? p.trigger}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">&bull;</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {p.step_count} step{p.step_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {p.trigger === "cron" && (
                      <button
                        onClick={(e) => handleTrigger(p.id, e)}
                        disabled={triggering === p.id}
                        className="text-gray-400 hover:text-emerald-500 transition-colors p-1 disabled:opacity-50"
                        title="Run now"
                      >
                        {triggering === p.id ? (
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Delete routine"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              </Card>
              </MotionItem>
            );
          })}
        </MotionList>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={executeDeleteRoutine}
        title="Delete Routine"
        message="Delete this routine? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
