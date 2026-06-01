"use client";

import { useEffect, useState } from "react";
import matter from "gray-matter";
import { ChevronRight } from "lucide-react";
import { useKnowledgeItems, useKnowledgePacks } from "@/lib/hooks";
import type { KnowledgeItem, KnowledgePack } from "@/lib/types";

interface SourceKnowledgeDoc {
  id?: string;
  selector?: string;
  path?: string;
  source_path?: string;
  title?: string;
}

interface SourceKnowledgeManifest {
  manifest?: { docs?: SourceKnowledgeDoc[] };
  docs?: SourceKnowledgeDoc[];
}

interface SourceKnowledgeInfo {
  owner: string;
  repo: string;
  ref: string;
  manifestPath: string;
}

function normalizeSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function metadataString(metadata: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function parseGitHubRepoUrl(value: string | null): { owner: string; repo: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\.git$/, "").replace(/\/+$/, "");
  const ssh = normalized.match(/^git@github\.com:([^/]+)\/(.+)$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return owner && repo ? { owner, repo } : null;
  } catch {
    const shorthand = normalized.match(/^([^/\s]+)\/([^/\s]+)$/);
    return shorthand ? { owner: shorthand[1], repo: shorthand[2] } : null;
  }
}

function sourceSegments(metadata: Record<string, unknown>): string[] {
  const owner = metadataString(metadata, ["source", "owner"]);
  const repo = metadataString(metadata, ["source", "repo"]);
  if (owner && repo) return [normalizeSegment(owner), normalizeSegment(repo)];
  const parsed = parseGitHubRepoUrl(metadataString(metadata, ["source", "url"]));
  if (parsed) return [normalizeSegment(parsed.owner), normalizeSegment(parsed.repo)];
  const path = metadataString(metadata, ["source", "path"]);
  return path?.startsWith("nenjo/") ? ["nenjo_ai", "packages"] : [];
}

function cleanPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function joinPath(base: string | null | undefined, path: string | null | undefined): string | null {
  const cleanBase = base ? cleanPath(base) : "";
  const cleanChild = path ? cleanPath(path) : "";
  if (!cleanBase && !cleanChild) return null;
  if (!cleanBase) return cleanChild;
  if (!cleanChild) return cleanBase;
  if (cleanChild === cleanBase || cleanChild.startsWith(`${cleanBase}/`)) return cleanChild;
  return `${cleanBase}/${cleanChild}`;
}

function packageLeafFromSourcePath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "nenjo" && parts[1]) return normalizeSegment(parts[1]);
  return parts.length > 0 ? normalizeSegment(parts[parts.length - 1]) : null;
}

function packageLeafFromPath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? normalizeSegment(parts[parts.length - 1]) : null;
}

function knowledgeLeafFromSlug(slug: string, packageLeaf: string | null): string {
  const normalizedSlug = normalizeSegment(slug);
  if (packageLeaf && normalizedSlug.startsWith(`${packageLeaf}_`)) {
    return normalizedSlug.slice(packageLeaf.length + 1) || normalizedSlug;
  }
  return normalizedSlug.split("_").pop() || normalizedSlug || "knowledge";
}

function knowledgePromptPath(pack: KnowledgePack): string {
  const selector = pack.selector?.trim();
  if (pack.source_type !== "package") {
    if (selector?.startsWith("lib:")) return `lib.${normalizeSegment(selector.slice(4))}`;
    return `lib.${normalizeSegment(pack.slug)}`;
  }

  const metadata = pack.metadata ?? {};
  const packageLeaf =
    normalizeSegment(metadataString(metadata, ["package", "name"]) ?? "") ||
    normalizeSegment(metadataString(metadata, ["source", "package"]) ?? "") ||
    packageLeafFromSourcePath(metadataString(metadata, ["source", "path"])) ||
    packageLeafFromPath(metadataString(metadata, ["distribution", "path"])) ||
    "package";
  const segments = [...sourceSegments(metadata), packageLeaf, knowledgeLeafFromSlug(pack.slug, packageLeaf)].filter(Boolean);
  if (segments.length > 0) return `pkg.${segments.join(".")}`;
  if (selector?.startsWith("pkg:")) {
    return `pkg.${selector.slice(4).split(/[./]/).filter(Boolean).map(normalizeSegment).join(".")}`;
  }
  return `pkg.${normalizeSegment(pack.slug)}`;
}

function sourceInfo(pack: KnowledgePack): SourceKnowledgeInfo | null {
  const parsed = parseGitHubRepoUrl(metadataString(pack.metadata, ["source", "url"]));
  const manifestPath =
    metadataString(pack.metadata, ["install", "source_path"]) ??
    joinPath(
      metadataString(pack.metadata, ["source", "path"]),
      metadataString(pack.metadata, ["distribution", "manifest_path"]) ??
        metadataString(pack.metadata, ["package", "manifest_path"]),
    ) ??
    metadataString(pack.metadata, ["source", "path"]);
  if (!manifestPath) return null;
  return {
    owner: metadataString(pack.metadata, ["source", "owner"]) ?? parsed?.owner ?? "nenjo-ai",
    repo: metadataString(pack.metadata, ["source", "repo"]) ?? parsed?.repo ?? "packages",
    ref:
      metadataString(pack.metadata, ["version", "resolved_commit_sha"]) ??
      metadataString(pack.metadata, ["version", "requested_ref"]) ??
      metadataString(pack.metadata, ["version", "ref"]) ??
      "main",
    manifestPath: cleanPath(manifestPath),
  };
}

async function fetchSourceDocs(source: SourceKnowledgeInfo): Promise<SourceKnowledgeDoc[]> {
  const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${source.manifestPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch source manifest: ${response.status}`);
  const text = await response.text();
  const trimmed = text.trimStart();
  const raw = (trimmed.startsWith("{") || trimmed.startsWith("[")
    ? JSON.parse(text)
    : trimmed.startsWith("---")
      ? matter(text).data
      : matter(`---\n${text.trim()}\n---\n`).data) as SourceKnowledgeManifest;
  return raw.docs ?? raw.manifest?.docs ?? [];
}

function documentToken(packPath: string, selector: string): string {
  const path = selector
    .replace(/^library:\/\/[^/]+\//, "")
    .replace(/\.md$/i, "")
    .split(/[./]/)
    .filter(Boolean)
    .map(normalizeSegment)
    .filter(Boolean)
    .join(".");
  return `{{ ${path ? `${packPath}.${path}` : packPath} }}`;
}

function LibraryPackReference({
  pack,
  onInsertVariable,
}: {
  pack: KnowledgePack;
  onInsertVariable: (text: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sourceLoad, setSourceLoad] = useState<{ key: string; docs: SourceKnowledgeDoc[]; error: boolean } | null>(null);
  const { items, isLoading, isError } = useKnowledgeItems(pack.slug);
  const packPath = knowledgePromptPath(pack);
  const packToken = `{{ ${packPath} }}`;
  const sortedItems = (items ?? []).slice().sort((left, right) => (left.path || left.slug).localeCompare(right.path || right.slug));
  const shouldLoadSourceDocs = pack.source_type === "package" && !isLoading && sortedItems.length === 0;
  const source = shouldLoadSourceDocs ? sourceInfo(pack) : null;
  const sourceKey = source ? `${source.owner}/${source.repo}/${source.ref}/${source.manifestPath}` : null;

  useEffect(() => {
    if (!shouldLoadSourceDocs || !source || !sourceKey || sourceLoad?.key === sourceKey) return;
    let cancelled = false;
    fetchSourceDocs(source)
      .then((docs) => {
        if (!cancelled) setSourceLoad({ key: sourceKey, docs, error: false });
      })
      .catch(() => {
        if (!cancelled) setSourceLoad({ key: sourceKey, docs: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [shouldLoadSourceDocs, source, sourceKey, sourceLoad?.key]);

  const sourceDocs = shouldLoadSourceDocs && sourceLoad?.key === sourceKey ? sourceLoad.docs : [];
  const sourceLoading = shouldLoadSourceDocs && !!sourceKey && sourceLoad?.key !== sourceKey;
  const sourceError = shouldLoadSourceDocs && sourceLoad?.key === sourceKey && sourceLoad.error;

  return (
    <div className="rounded-sm">
      <div className="group flex w-full items-start gap-1.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20">
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
          aria-label={isExpanded ? "Collapse knowledge pack" : "Expand knowledge pack"}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>
        <button type="button" onClick={() => onInsertVariable(packToken)} className="min-w-0 flex-1 text-left">
          <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">{packToken}</code>
          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">{pack.name}</p>
        </button>
      </div>
      {isExpanded && (
        <div className="ml-6 border-l border-gray-200 pl-2 dark:border-gray-700">
          {isLoading || sourceLoading ? (
            <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400">Loading documents...</p>
          ) : isError || sourceError ? (
            <p className="px-2 py-1.5 text-[10px] text-red-600 dark:text-red-400">Failed to load documents.</p>
          ) : sortedItems.length === 0 && sourceDocs.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400">No documents.</p>
          ) : (
            <div className="space-y-0.5 py-1">
              {sortedItems.map((item: KnowledgeItem) => {
                const token = documentToken(packPath, item.path || item.slug);
                return (
                  <button key={item.id} type="button" onClick={() => onInsertVariable(token)} className="group flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20">
                    <div className="min-w-0 flex-1">
                      <code className="break-words text-[11px] font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">{token}</code>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">{item.title || item.path || item.filename}</p>
                    </div>
                  </button>
                );
              })}
              {sourceDocs.map((doc) => {
                const token = documentToken(packPath, doc.selector || doc.path || doc.source_path || doc.id || "");
                return (
                  <button key={doc.selector ?? doc.source_path ?? doc.path ?? doc.id} type="button" onClick={() => onInsertVariable(token)} className="group flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20">
                    <div className="min-w-0 flex-1">
                      <code className="break-words text-[11px] font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">{token}</code>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">{doc.title || doc.selector || doc.source_path || doc.path}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LibraryReferenceList({
  onInsertVariable,
}: {
  onInsertVariable: (text: string) => void;
}) {
  const { packs, isLoading, isError } = useKnowledgePacks();
  const activePacks = (packs ?? [])
    .filter((pack) => pack.status === "active")
    .sort((left, right) => left.name.localeCompare(right.name));

  if (isLoading) return <div className="p-2 text-xs text-gray-500 dark:text-gray-400">Loading library...</div>;
  if (isError) return <div className="p-2 text-xs text-red-600 dark:text-red-400">Failed to load library packs.</div>;
  if (activePacks.length === 0) return <div className="p-2 text-xs text-gray-500 dark:text-gray-400">No active library packs.</div>;

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Library</h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Click a pack or document to insert its context variable.</p>
      <div className="space-y-1">
        {activePacks.map((pack) => (
          <LibraryPackReference key={pack.id} pack={pack} onInsertVariable={onInsertVariable} />
        ))}
      </div>
    </div>
  );
}
