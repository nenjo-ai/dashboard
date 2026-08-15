"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";
import { SourceKnowledgeSection } from "@/components/knowledge/SourceKnowledgeSection";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { useKnowledgePacks } from "@/lib/hooks";
import { createKnowledgePack, deleteKnowledgePack } from "@/lib/api";
import type { KnowledgePack } from "@/lib/types";

function knowledgeSelector(pack: KnowledgePack): string {
  return pack.selector || `lib:${pack.slug}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function KnowledgePage() {
  const { packs, isLoading, mutate } = useKnowledgePacks();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeletePack, setConfirmDeletePack] = useState<KnowledgePack | null>(null);
  const [deletingPack, setDeletingPack] = useState(false);

  const platformPacks = useMemo(
    () => (packs ?? []).filter((pack) => pack.source_type !== "package"),
    [packs],
  );
  const selectedPack = platformPacks.find((pack) => pack.id === selectedPackId) ?? null;

  const handleCreatePack = async () => {
    const name = packName.trim();
    if (!name) {
      setError("Pack name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createKnowledgePack({
        name,
        description: packDescription.trim() || null,
      });
      await mutate();
      setSelectedPackId(created.id);
      setPackName("");
      setPackDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create knowledge pack");
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePack = async () => {
    if (!confirmDeletePack) return;
    setDeletingPack(true);
    setError(null);
    try {
      await deleteKnowledgePack(confirmDeletePack.slug);
      await mutate();
      if (selectedPackId === confirmDeletePack.id) {
        setSelectedPackId(null);
      }
      setConfirmDeletePack(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete knowledge pack");
    } finally {
      setDeletingPack(false);
    }
  };

  if (selectedPack) {
    return (
      <>
        <TopBar title="Library" />
        <PageContent className="space-y-4">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Library", href: "/dashboard/library", onClick: () => setSelectedPackId(null) },
              { label: selectedPack.name },
            ]}
          />
          <LibraryTabs />
          {error ? <Notice tone="error">{error}</Notice> : null}

          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-950 dark:text-gray-50">{selectedPack.name}</h1>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{knowledgeSelector(selectedPack)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge>Platform</Badge>
                {selectedPack.version ? <Badge>{selectedPack.version}</Badge> : null}
              </div>
              {!selectedPack.read_only ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDeletePack(selectedPack)}
                  disabled={deletingPack}
                  title="Delete knowledge pack"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
          {selectedPack.source_type === "package" && selectedPack.read_only ? (
            <SourceKnowledgeSection pack={selectedPack} />
          ) : (
            <KnowledgeSection packRef={selectedPack.slug} readOnly={selectedPack.read_only} />
          )}
          <ConfirmDialog
            open={!!confirmDeletePack}
            onClose={() => {
              if (!deletingPack) setConfirmDeletePack(null);
            }}
            onConfirm={handleDeletePack}
            title="Delete Knowledge Pack"
            message={`Delete "${confirmDeletePack?.name ?? "this knowledge pack"}" and all of its documents? This cannot be undone.`}
            confirmLabel="Delete"
            loading={deletingPack}
          />
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar title="Library" />
      <PageContent className="space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Library" }]} />
        <div>
          <h1 className="theme-text text-2xl font-semibold">Knowledge Packs</h1>
          <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
            Platform-managed knowledge documents and editable org knowledge packs.
          </p>
        </div>

        <LibraryTabs />

        {error ? <Notice tone="error">{error}</Notice> : null}

        {isLoading ? (
          <LoadingGrid />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformPacks.map((pack) => (
              <button key={pack.id} type="button" onClick={() => setSelectedPackId(pack.id)} className="h-full text-left">
                <KnowledgePackCard pack={pack} />
              </button>
            ))}
            <CreateKnowledgePackCard
              packName={packName}
              packDescription={packDescription}
              onPackNameChange={setPackName}
              onPackDescriptionChange={setPackDescription}
              onCreatePack={handleCreatePack}
              creatingPack={busy}
            />
          </div>
        )}
      </PageContent>
    </>
  );
}

function KnowledgePackCard({ pack }: { pack: KnowledgePack }) {
  return (
    <div className="h-full min-h-44 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xs transition-colors hover:border-deep-space-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-deep-space-blue-700">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300">
        <BookOpen className="h-5 w-5" />
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">{pack.name}</h3>
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{knowledgeSelector(pack)}</p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600 dark:text-gray-300">
          {pack.description || "No description available."}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge>Platform</Badge>
        <span className="ml-auto text-[11px] text-gray-400">{formatDate(pack.updated_at)}</span>
      </div>
    </div>
  );
}

function CreateKnowledgePackCard({
  packName,
  packDescription,
  onPackNameChange,
  onPackDescriptionChange,
  onCreatePack,
  creatingPack,
}: {
  packName: string;
  packDescription: string;
  onPackNameChange: (value: string) => void;
  onPackDescriptionChange: (value: string) => void;
  onCreatePack: () => void;
  creatingPack: boolean;
}) {
  return (
    <div className="flex min-h-44 h-full flex-col rounded-lg border border-dashed border-gray-300 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">New Knowledge Pack</h3>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <Input value={packName} onChange={(event) => onPackNameChange(event.target.value)} placeholder="Pack name" />
        <Textarea
          value={packDescription}
          onChange={(event) => onPackDescriptionChange(event.target.value)}
          placeholder="Short description"
          className="min-h-16 flex-1"
        />
        <Button size="sm" className="w-full" onClick={onCreatePack} isLoading={creatingPack}>
          <Plus className="h-4 w-4" />
          Create Pack
        </Button>
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {children}
    </span>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      tone === "error"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
    }`}
    >
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-44 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-5 h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}
