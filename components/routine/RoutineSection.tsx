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
import { EmptyState } from "@/components/ui/EmptyState";
import { PageIntro } from "@/components/ui/PageIntro";
import { ListTree, Plus, TriangleAlert } from "lucide-react";

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
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title="Routines could not be loaded"
        description={error?.message ?? "Check the local worker connection and try again."}
        tone="error"
      />
    );
  }

  return (
    <>
      <PageIntro
        description="Build reusable agent workflows, then attach them to tasks or run them on a recurring schedule."
        actions={allowCreate ? (
          <Button
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" />
            New routine
          </Button>
        ) : undefined}
      />

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
        <EmptyState
          icon={<ListTree className="h-5 w-5" />}
          title="Create your first routine"
          description="Define a repeatable sequence of agent steps for work you run more than once."
          action={allowCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create routine
            </Button>
          ) : undefined}
        />
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
