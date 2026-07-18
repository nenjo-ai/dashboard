"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRoutines } from "@/lib/hooks";
import { createRoutine, deleteRoutine } from "@/lib/api";
import type { RoutineSummary, CreateRoutineRequest } from "@/lib/types";
import { RoutineCard } from "./RoutineCard";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MotionList, MotionItem } from "@/components/ui/motion";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// RoutineSection — card grid of task-targetable routines
// ---------------------------------------------------------------------------

interface RoutineSectionProps {
  allowCreate?: boolean;
}

export function RoutineSection({ allowCreate = true }: RoutineSectionProps) {
  const router = useRouter();
  const { routines: allRoutines, isLoading, isError, error, mutate } = useRoutines();

  const routines = allRoutines;

  // ── Create form ─────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // ── Delete state ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<RoutineSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = useCallback(() => {
    setNewName("");
    setNewDescription("");
    setShowCreate(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const data: CreateRoutineRequest = {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
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
  }, [newName, newDescription, resetForm, mutate, router]);

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
          <div key={i} className="theme-surface theme-border rounded-xl border p-5">
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
        <p className="theme-text-muted text-sm">
          Manage routine definitions. Assign routines and recurring schedules from tasks.
        </p>
        {allowCreate ? (
          <Button
            onClick={() => setShowCreate(true)}
            className="h-10 w-10 shrink-0 !bg-deep-space-blue-500 !px-0 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
            title="New Routine"
            aria-label="New Routine"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Button>
        ) : null}
      </div>

      {/* Create form */}
      {allowCreate && showCreate && (
        <div className="theme-surface theme-border mb-6 rounded-xl border p-5 shadow-xs">
          <h3 className="theme-text mb-4 text-sm font-semibold">
            New Routine
          </h3>
          <div className="space-y-3">
            <div>
              <label className="theme-text-muted mb-1 block text-xs font-medium">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Code Review Pipeline"
                autoFocus
                className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--app-text-muted)] focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
              />
            </div>

            <div>
              <label className="theme-text-muted mb-1 block text-xs font-medium">
                Description
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
                className="theme-surface theme-border theme-text w-full rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--app-text-muted)] focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400"
              />
            </div>


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
        <div className="theme-border rounded-xl border-2 border-dashed py-16 text-center">
          <div className="theme-surface-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
            <svg className="theme-text-muted h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <p className="theme-text text-sm font-medium">
            No routines yet
          </p>
          <p className="theme-text-muted mt-1 text-xs">
            Create your first routine to define how agents process work.
          </p>
          <Button
            className="mt-6 !bg-deep-space-blue-500 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
            onClick={() => setShowCreate(true)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
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
