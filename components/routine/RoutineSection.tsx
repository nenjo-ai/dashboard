"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRoutines } from "@/lib/hooks";
import { createRoutine, deleteRoutine } from "@/lib/api";
import type { RoutineSummary, RoutineTrigger, CreateRoutineRequest } from "@/lib/types";
import { ROUTINE_TRIGGERS } from "@/lib/types";
import { RoutineCard } from "./RoutineCard";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MotionList, MotionItem } from "@/components/ui/motion";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// RoutineSection — card grid of routines, optionally filtered by trigger type
// ---------------------------------------------------------------------------

interface RoutineSectionProps {
  triggerFilter?: RoutineTrigger[];
}

export function RoutineSection({ triggerFilter }: RoutineSectionProps) {
  const router = useRouter();
  const { routines: allRoutines, isLoading, isError, error, mutate } = useRoutines();

  const routines = triggerFilter && allRoutines
    ? allRoutines.filter((r) => triggerFilter.includes(r.trigger as RoutineTrigger))
    : allRoutines;

  // ── Create form ─────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const availableTriggers = triggerFilter
    ? ROUTINE_TRIGGERS.filter((t) => triggerFilter.includes(t.id))
    : ROUTINE_TRIGGERS;
  const [newTrigger, setNewTrigger] = useState<RoutineTrigger>(availableTriggers[0]?.id ?? "task.ready");
  const [newSchedule, setNewSchedule] = useState("");

  // ── Delete state ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<RoutineSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setNewTrigger(availableTriggers[0]?.id ?? "task.ready");
    setNewSchedule("");
    setShowCreate(false);
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const data: CreateRoutineRequest = {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        trigger: newTrigger,
        metadata: newTrigger === "cron" && newSchedule.trim()
          ? { schedule: newSchedule.trim() }
          : undefined,
      };
      const created = await createRoutine(data);
      resetForm();
      mutate();
      toast.success("Routine created.");
      router.push(`/dashboard/routines/${created.id}?tab=edit`);
    } catch {
      toast.error("Failed to create routine.");
    } finally {
      setCreating(false);
    }
  }, [newName, newDescription, newTrigger, newSchedule, mutate]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteRoutine(confirmDelete.id);
      setConfirmDelete(null);
      mutate();
      toast.success(`"${confirmDelete.name}" deleted.`);
    } catch {
      toast.error("Failed to delete routine.");
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, mutate]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load routines: {error?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Header with create button */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {triggerFilter?.includes("cron") && triggerFilter.length === 1
            ? "Scheduled routines that run agents automatically on a cron schedule."
            : "Manage agent execution routines. Routines define the sequence of steps agents follow when processing tasks."}
        </p>
        <Button onClick={() => setShowCreate(true)} className="shrink-0">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Routine
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            New Routine
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Code Review Pipeline"
                autoFocus
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Description
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>

            {availableTriggers.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Trigger Type
                </label>
                <select
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value as RoutineTrigger)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  {availableTriggers.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            {newTrigger === "cron" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Schedule
                </label>
                <input
                  type="text"
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)}
                  placeholder='e.g., "30m", "1h", or "0 9 * * *"'
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Interval (30s, 5m, 1h) or cron expression. Can be set later.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={resetForm} disabled={creating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                isLoading={creating}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card grid */}
      {routines && routines.length > 0 ? (
        <MotionList className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {routines.map((routine) => (
            <MotionItem key={routine.id}>
              <RoutineCard
                routine={routine}
                onDelete={setConfirmDelete}
                isDeleting={deleting && confirmDelete?.id === routine.id}
              />
            </MotionItem>
          ))}
        </MotionList>
      ) : !showCreate ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {triggerFilter?.includes("cron") && triggerFilter.length === 1
              ? "No scheduled routines yet"
              : "No routines yet"}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {triggerFilter?.includes("cron") && triggerFilter.length === 1
              ? "Create a scheduled routine to run agents on a cron schedule."
              : "Create your first routine to define how agents process work."}
          </p>
          <Button variant="primary" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            Create Routine
          </Button>
        </div>
      ) : null}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete Routine"
        message={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
