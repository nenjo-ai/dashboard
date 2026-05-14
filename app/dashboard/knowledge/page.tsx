"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Boxes, Clock3, Plus, Search, Tags } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";
import { useKnowledgePacks } from "@/lib/hooks";
import { createKnowledgePack } from "@/lib/api";
import type { KnowledgePack } from "@/lib/types";

function formatLibraryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function packTags(pack: KnowledgePack): string[] {
  const slugTags = pack.slug
    .split(/[-_.]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 2)
    .slice(0, 2);

  return Array.from(new Set([pack.status, ...slugTags])).slice(0, 3);
}

function libraryVarName(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function KnowledgePage() {
  const { packs, isLoading, mutate } = useKnowledgePacks();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activePacks = useMemo(
    () => (packs ?? []).filter((pack) => pack.status !== "archived"),
    [packs],
  );

  const filteredPacks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activePacks;

    return activePacks.filter((pack) =>
      [pack.name, pack.slug, pack.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activePacks, search]);

  const groupedPacks = useMemo(() => {
    const groups = new Map<string, KnowledgePack[]>();
    for (const pack of filteredPacks) {
      const key = pack.slug.includes(".")
        ? pack.slug.split(".")[0]
        : pack.slug.includes("-")
          ? pack.slug.split("-")[0]
          : "workspace";
      const label = key.replaceAll("_", " ").replaceAll("-", " ");
      groups.set(label, [...(groups.get(label) ?? []), pack]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredPacks]);

  const selectedPack = activePacks.find((pack) => pack.id === selectedPackId) ?? null;

  useEffect(() => {
    if (!selectedPackId) return;
    if (!activePacks.some((pack) => pack.id === selectedPackId)) {
      setSelectedPackId(null);
    }
  }, [activePacks, selectedPackId]);

  const handleCreatePack = async () => {
    const name = packName.trim();
    if (!name) {
      setError("Pack name is required");
      return;
    }
    setIsCreating(true);
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
      setError(err instanceof Error ? err.message : "Failed to create pack");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <TopBar title="Library" />
      <PageContent className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Library" },
          ]}
        />

        {selectedPack ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedPackId(null)}
                  className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to library
                </button>
                <h1 className="truncate text-xl font-semibold text-gray-950 dark:text-gray-50">{selectedPack.name}</h1>
                <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                  lib.{libraryVarName(selectedPack.slug)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {packTags(selectedPack).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <KnowledgeSection packId={selectedPack.id} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <main className="min-w-0 space-y-5">
              <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    <Boxes className="h-3.5 w-3.5" />
                    {(activePacks.length).toLocaleString()} active packs
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-950 dark:text-gray-50">
                    Library
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Browse reusable knowledge packs, scan their grouping and tags, then open a pack to manage its documents.
                  </p>
                </div>
                <div className="relative w-full lg:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search packs"
                    className="pl-9"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <div key={item} className="h-44 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
                  ))}
                </div>
              ) : filteredPacks.length === 0 ? (
                <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  {activePacks.length === 0 ? "Create a knowledge pack to start building your library." : "No packs match that search."}
                </div>
              ) : (
                <div className="space-y-7">
                  {groupedPacks.map(([group, groupPacks]) => (
                    <section key={group} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-gray-400" />
                        <h2 className="text-sm font-semibold capitalize text-gray-800 dark:text-gray-200">{group}</h2>
                        <span className="text-xs text-gray-400">{groupPacks.length}</span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {groupPacks.map((pack) => (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => setSelectedPackId(pack.id)}
                            className="group flex min-h-44 flex-col rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-deep-space-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-deep-space-blue-700"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300">
                                <BookOpen className="h-5 w-5" />
                              </div>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium capitalize text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                {pack.status}
                              </span>
                            </div>
                            <div className="mt-4 min-w-0">
                              <h3 className="truncate text-base font-semibold text-gray-950 group-hover:text-deep-space-blue-700 dark:text-gray-50 dark:group-hover:text-deep-space-blue-300">
                                {pack.name}
                              </h3>
                              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                                lib.{libraryVarName(pack.slug)}
                              </p>
                              <p className="mt-3 line-clamp-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
                                {pack.description || "No description yet."}
                              </p>
                            </div>
                            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                              {packTags(pack).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                >
                                  {tag}
                                </span>
                              ))}
                              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatLibraryDate(pack.updated_at)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </main>

            <aside className="h-fit rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">New pack</h2>
              </div>
              <div className="mt-4 space-y-3">
                <Input
                  value={packName}
                  onChange={(event) => setPackName(event.target.value)}
                  placeholder="Pack name"
                />
                <Textarea
                  value={packDescription}
                  onChange={(event) => setPackDescription(event.target.value)}
                  placeholder="Short description"
                  className="min-h-[92px]"
                />
                {error ? <div className="text-xs text-red-600 dark:text-red-400">{error}</div> : null}
                <Button size="sm" className="w-full" onClick={handleCreatePack} disabled={isCreating}>
                  <Plus className="h-4 w-4" />
                  {isCreating ? "Creating..." : "Create Pack"}
                </Button>
              </div>
            </aside>
          </div>
        )}
      </PageContent>
    </>
  );
}
