"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCouncils } from "@/lib/hooks";
import { createChatSession, deleteCouncil } from "@/lib/api";
import type { CouncilDetail } from "@/lib/types";

import { Button } from "@/components/ui/Button";
import { CouncilList } from "@/components/councils/CouncilList";
import { CouncilFormModal } from "@/components/councils/CouncilFormModal";
import { CouncilDetailModal } from "@/components/councils/CouncilDetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { PageIntro } from "@/components/ui/PageIntro";
import { Plus } from "lucide-react";

interface CouncilsSectionProps {
  allowCreate?: boolean;
}

export function CouncilsSection({ allowCreate = true }: CouncilsSectionProps) {
  const { councils, isLoading, isError, mutate } = useCouncils();
  const router = useRouter();

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

  const handleChat = useCallback(
    async (council: CouncilDetail) => {
      try {
        const session = await createChatSession({
          target_type: "council",
          target_id: council.id,
          title: council.name,
        });
        router.push(`/dashboard/chat?session=${session.id}`);
      } catch {
        toast.error("Failed to start council chat.");
      }
    },
    [router],
  );

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
      <PageIntro
        description="Coordinate multiple agents under a leader and delegation strategy for work that benefits from several perspectives."
        actions={allowCreate ? (
          <Button
            onClick={handleCreate}
          >
            <Plus className="h-4 w-4" />
            New council
          </Button>
        ) : undefined}
      />

      <CouncilList
        councils={councils}
        isLoading={isLoading}
        isError={isError}
        onView={handleView}
        onChat={handleChat}
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
