"use client";

import { useState, useCallback } from "react";
import { useCouncils } from "@/lib/hooks";
import { deleteCouncil } from "@/lib/api";
import type { CouncilDetail } from "@/lib/types";

import { Button } from "@/components/ui/Button";
import { CouncilList } from "@/components/councils/CouncilList";
import { CouncilFormModal } from "@/components/councils/CouncilFormModal";
import { CouncilDetailModal } from "@/components/councils/CouncilDetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";

interface CouncilsSectionProps {
  allowCreate?: boolean;
}

export function CouncilsSection({ allowCreate = true }: CouncilsSectionProps) {
  const { councils, isLoading, isError, mutate } = useCouncils();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<CouncilDetail | null>(null);
  const [viewingCouncil, setViewingCouncil] = useState<CouncilDetail | null>(null);
  const [deletingCouncil, setDeletingCouncil] = useState<CouncilDetail | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleCreate = useCallback(() => {
    setEditingCouncil(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((council: CouncilDetail) => {
    setViewingCouncil(null);
    setEditingCouncil(council);
    setFormOpen(true);
  }, []);

  const handleView = useCallback((council: CouncilDetail) => {
    setViewingCouncil(council);
  }, []);

  const handleDeleteRequest = useCallback((council: CouncilDetail) => {
    setDeletingCouncil(council);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingCouncil) return;
    setDeleteLoading(true);
    try {
      await deleteCouncil(deletingCouncil.id);
      setViewingCouncil(null);
      setDeletingCouncil(null);
      mutate();
      toast.success(`"${deletingCouncil.name}" deleted.`);
    } catch {
      toast.error("Failed to delete council.");
    } finally {
      setDeleteLoading(false);
    }
  }, [deletingCouncil, mutate]);

  const handleSaved = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="theme-text-muted text-sm">
          Manage agent councils for multi-agent collaboration. Councils group agents with a leader
          and delegation strategy to work together on complex tasks.
        </p>
        {allowCreate ? (
          <Button className="shrink-0" onClick={handleCreate}>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Council
          </Button>
        ) : null}
      </div>

      <CouncilList
        councils={councils}
        isLoading={isLoading}
        isError={isError}
        onView={handleView}
        onCreate={allowCreate ? handleCreate : undefined}
      />

      <CouncilFormModal
        open={allowCreate && formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingCouncil(null);
        }}
        onSaved={handleSaved}
        council={editingCouncil}
      />

      <CouncilDetailModal
        council={viewingCouncil}
        onClose={() => setViewingCouncil(null)}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
      />

      <ConfirmDialog
        open={!!deletingCouncil}
        onClose={() => setDeletingCouncil(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Council"
        message={`Are you sure you want to delete "${deletingCouncil?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteLoading}
      />
    </>
  );
}
