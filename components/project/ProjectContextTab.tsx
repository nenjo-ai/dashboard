"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import matter from "gray-matter";
import { BookOpen, Braces, ChevronRight, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { TemplateVariableReference } from "@/components/agents/TemplateVariableReference";
import { updateProject } from "@/lib/api";
import { useKnowledgeItems, useKnowledgePacks } from "@/lib/hooks";
import type { KnowledgeItem, KnowledgePack, Project } from "@/lib/types";

interface ProjectContextTabProps {
  project: Project | undefined;
  onUpdated: () => void;
}

interface SourceKnowledgeDoc {
  id?: string;
  selector?: string;
  path?: string;
  source_path?: string;
  title?: string;
  summary?: string;
}

interface SourceKnowledgeManifest {
  manifest?: {
    docs?: SourceKnowledgeDoc[];
  };
  docs?: SourceKnowledgeDoc[];
}

interface SourceKnowledgeInfo {
  owner: string;
  repo: string;
  ref: string;
  basePath: string;
  manifestPath: string;
}

function normalizeLibraryVarSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function metadataString(
  metadata: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function githubOwnerRepoSegments(url: string | null): string[] {
  if (!url) return [];
  const normalized = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const path =
    normalized.replace(/^git@github\.com:/, "") === normalized
      ? normalized.replace(/^https?:\/\/github\.com\//, "")
      : normalized.replace(/^git@github\.com:/, "");
  const [owner, repo] = path.split("/");
  return owner && repo
    ? [normalizeLibraryVarSegment(owner), normalizeLibraryVarSegment(repo)]
    : [];
}

function packageSourceSegments(metadata: Record<string, unknown>): string[] {
  const owner = metadataString(metadata, ["source", "owner"]);
  const repo = metadataString(metadata, ["source", "repo"]);
  if (owner && repo) {
    return [normalizeLibraryVarSegment(owner), normalizeLibraryVarSegment(repo)];
  }
  const githubSegments = githubOwnerRepoSegments(
    metadataString(metadata, ["source", "url"]),
  );
  if (githubSegments.length > 0) return githubSegments;
  const sourcePath = metadataString(metadata, ["source", "path"]);
  if (sourcePath?.startsWith("nenjo/")) {
    return ["nenjo_ai", "packages"];
  }
  return [];
}

function packageLeafFromPath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0
    ? normalizeLibraryVarSegment(parts[parts.length - 1])
    : null;
}

function packageLeafFromSourcePath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "nenjo" && parts[1]) {
    return normalizeLibraryVarSegment(parts[1]);
  }
  return packageLeafFromPath(path);
}

function knowledgeLeafFromSlug(slug: string, packageLeaf: string | null): string {
  const normalizedSlug = normalizeLibraryVarSegment(slug);
  if (packageLeaf && normalizedSlug.startsWith(`${packageLeaf}_`)) {
    return normalizedSlug.slice(packageLeaf.length + 1) || normalizedSlug;
  }
  return normalizedSlug.split("_").pop() || normalizedSlug || "knowledge";
}

function knowledgePromptPath(pack: KnowledgePack): string {
  const selector = pack.selector?.trim();
  if (pack.source_type !== "package") {
    if (selector?.startsWith("lib:")) {
      return `lib.${normalizeLibraryVarSegment(selector.slice(4))}`;
    }
    return `lib.${normalizeLibraryVarSegment(pack.slug)}`;
  }

  const metadata = pack.metadata ?? {};
  const sourceSegments = packageSourceSegments(metadata);
  const packageLeaf =
    normalizeLibraryVarSegment(metadataString(metadata, ["package", "name"]) ?? "") ||
    normalizeLibraryVarSegment(metadataString(metadata, ["source", "package"]) ?? "") ||
    packageLeafFromSourcePath(metadataString(metadata, ["source", "path"])) ||
    packageLeafFromPath(metadataString(metadata, ["distribution", "path"])) ||
    "package";
  const knowledgeLeaf = knowledgeLeafFromSlug(pack.slug, packageLeaf);
  const segments = [...sourceSegments, packageLeaf, knowledgeLeaf].filter(Boolean);
  if (segments.length > 0) {
    return `pkg.${segments.join(".")}`;
  }
  if (selector?.startsWith("pkg:")) {
    return `pkg.${selector
      .slice(4)
      .split(/[./]/)
      .filter(Boolean)
      .map(normalizeLibraryVarSegment)
      .join(".")}`;
  }
  return `pkg.${normalizeLibraryVarSegment(pack.slug)}`;
}

function knowledgePromptToken(pack: KnowledgePack): string {
  return `{{ ${knowledgePromptPath(pack)} }}`;
}

function knowledgeDocumentPromptToken(
  packPath: string,
  item: KnowledgeItem,
): string {
  const selector = item.path || item.slug;
  const path = selector
    .replace(/\.md$/i, "")
    .split(/[./]/)
    .filter(Boolean)
    .map(normalizeLibraryVarSegment)
    .filter(Boolean)
    .join(".");
  return `{{ ${path ? `${packPath}.${path}` : packPath} }}`;
}

function sourceKnowledgeDocumentPromptToken(
  packPath: string,
  doc: SourceKnowledgeDoc,
): string {
  const selector = doc.selector || doc.path || doc.source_path || doc.id || "";
  const path = selector
    .replace(/^library:\/\/[^/]+\//, "")
    .replace(/\.md$/i, "")
    .split(/[./]/)
    .filter(Boolean)
    .map(normalizeLibraryVarSegment)
    .filter(Boolean)
    .join(".");
  return `{{ ${path ? `${packPath}.${path}` : packPath} }}`;
}

function sourceInfo(pack: KnowledgePack): SourceKnowledgeInfo | null {
  const parsedSourceUrl = parseGitHubRepoUrl(
    metadataString(pack.metadata, ["source", "url"]),
  );
  const owner =
    metadataString(pack.metadata, ["source", "owner"]) ?? parsedSourceUrl?.owner;
  const repo =
    metadataString(pack.metadata, ["source", "repo"]) ?? parsedSourceUrl?.repo;
  const fallbackOwner = owner ?? "nenjo-ai";
  const fallbackRepo = repo ?? "packages";
  const installedManifestPath = metadataString(pack.metadata, [
    "install",
    "source_path",
  ]);
  const sourcePath = metadataString(pack.metadata, ["source", "path"]);
  const distributionManifestPath =
    metadataString(pack.metadata, ["distribution", "manifest_path"]) ??
    metadataString(pack.metadata, ["package", "manifest_path"]);
  const manifestPath =
    installedManifestPath ??
    joinPath(sourcePath, distributionManifestPath) ??
    sourcePath;
  const ref =
    metadataString(pack.metadata, ["version", "resolved_commit_sha"]) ??
    metadataString(pack.metadata, ["version", "requested_ref"]) ??
    metadataString(pack.metadata, ["version", "ref"]) ??
    "main";
  if (!manifestPath) return null;
  return {
    owner: fallbackOwner,
    repo: fallbackRepo,
    ref,
    basePath: dirname(manifestPath),
    manifestPath: cleanPath(manifestPath),
  };
}

function repoRawUrl(source: SourceKnowledgeInfo, path: string): string {
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${path}`;
}

function parseGitHubRepoUrl(
  value: string | null,
): { owner: string; repo: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\.git$/, "").replace(/\/+$/, "");
  const ssh = normalized.match(/^git@github\.com:([^/]+)\/(.+)$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com")
      return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return owner && repo ? { owner, repo } : null;
  } catch {
    const shorthand = normalized.match(/^([^/\s]+)\/([^/\s]+)$/);
    return shorthand ? { owner: shorthand[1], repo: shorthand[2] } : null;
  }
}

function cleanPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function joinPath(
  base: string | null | undefined,
  path: string | null | undefined,
): string | null {
  const cleanBase = base ? cleanPath(base) : "";
  const cleanChild = path ? cleanPath(path) : "";
  if (!cleanBase && !cleanChild) return null;
  if (!cleanBase) return cleanChild;
  if (!cleanChild) return cleanBase;
  if (cleanChild === cleanBase || cleanChild.startsWith(`${cleanBase}/`))
    return cleanChild;
  return `${cleanBase}/${cleanChild}`;
}

function dirname(path: string): string {
  const clean = cleanPath(path);
  const index = clean.lastIndexOf("/");
  return index === -1 ? "" : clean.slice(0, index);
}

async function fetchSourceKnowledgeDocs(
  source: SourceKnowledgeInfo,
): Promise<SourceKnowledgeDoc[]> {
  const res = await fetch(repoRawUrl(source, source.manifestPath));
  if (!res.ok) throw new Error(`Failed to fetch source manifest: ${res.status}`);
  const text = await res.text();
  const trimmed = text.trimStart();
  const raw = (
    trimmed.startsWith("{") || trimmed.startsWith("[")
      ? JSON.parse(text)
      : trimmed.startsWith("---")
        ? matter(text).data
        : matter(`---\n${text.trim()}\n---\n`).data
  ) as SourceKnowledgeManifest;
  return raw.docs ?? raw.manifest?.docs ?? [];
}

function LibraryPackReference({
  pack,
  onInsertVariable,
}: {
  pack: KnowledgePack;
  onInsertVariable: (text: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sourceDocsLoad, setSourceDocsLoad] = useState<{
    key: string;
    docs: SourceKnowledgeDoc[];
    error: boolean;
  } | null>(null);
  const { items, isLoading, isError } = useKnowledgeItems(pack.slug);
  const packPath = knowledgePromptPath(pack);
  const packToken = `{{ ${packPath} }}`;
  const sortedItems = (items ?? [])
    .slice()
    .sort((left, right) =>
      (left.path || left.slug).localeCompare(right.path || right.slug),
    );
  const shouldLoadSourceDocs =
    pack.source_type === "package" && !isLoading && sortedItems.length === 0;
  const source = shouldLoadSourceDocs ? sourceInfo(pack) : null;
  const sourceDocsKey = source ? repoRawUrl(source, source.manifestPath) : null;

  useEffect(() => {
    if (!shouldLoadSourceDocs || !source || !sourceDocsKey) return;
    if (sourceDocsLoad?.key === sourceDocsKey) return;
    let cancelled = false;
    fetchSourceKnowledgeDocs(source)
      .then((docs) => {
        if (!cancelled) {
          setSourceDocsLoad({ key: sourceDocsKey, docs, error: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceDocsLoad({ key: sourceDocsKey, docs: [], error: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shouldLoadSourceDocs, source, sourceDocsKey, sourceDocsLoad?.key]);

  const visibleSourceDocs =
    shouldLoadSourceDocs && sourceDocsLoad?.key === sourceDocsKey
      ? sourceDocsLoad.docs
      : [];
  const sourceDocsLoading =
    shouldLoadSourceDocs &&
    !!sourceDocsKey &&
    sourceDocsLoad?.key !== sourceDocsKey;
  const sourceDocsError =
    shouldLoadSourceDocs &&
    sourceDocsLoad?.key === sourceDocsKey &&
    sourceDocsLoad.error;

  return (
    <div className="rounded-sm">
      <div className="group flex w-full items-start gap-1.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20">
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
          aria-label={isExpanded ? "Collapse knowledge pack" : "Expand knowledge pack"}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => onInsertVariable(packToken)}
          className="min-w-0 flex-1 text-left"
        >
          <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
            {packToken}
          </code>
          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">
            {pack.name}
          </p>
          {pack.description && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-500 dark:text-gray-400">
              {pack.description}
            </p>
          )}
        </button>
        <span className="mt-0.5 text-sm text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600">
          +
        </span>
      </div>

      {isExpanded && (
        <div className="ml-6 border-l border-gray-200 pl-2 dark:border-gray-700">
          {isLoading || sourceDocsLoading ? (
            <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400">
              Loading documents...
            </p>
          ) : isError || sourceDocsError ? (
            <p className="px-2 py-1.5 text-[10px] text-red-600 dark:text-red-400">
              Failed to load documents.
            </p>
          ) : sortedItems.length === 0 && visibleSourceDocs.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400">
              No documents.
            </p>
          ) : (
            <div className="space-y-0.5 py-1">
              {sortedItems.map((item) => {
                const token = knowledgeDocumentPromptToken(packPath, item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onInsertVariable(token)}
                    className="group flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20"
                  >
                    <div className="min-w-0 flex-1">
                      <code className="break-words text-[11px] font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
                        {token}
                      </code>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {item.title || item.path || item.filename}
                      </p>
                    </div>
                    <span className="mt-0.5 text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600">
                      +
                    </span>
                  </button>
                );
              })}
              {visibleSourceDocs.map((doc) => {
                const token = sourceKnowledgeDocumentPromptToken(packPath, doc);
                return (
                  <button
                    key={doc.selector ?? doc.source_path ?? doc.path ?? doc.id}
                    type="button"
                    onClick={() => onInsertVariable(token)}
                    className="group flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20"
                  >
                    <div className="min-w-0 flex-1">
                      <code className="break-words text-[11px] font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
                        {token}
                      </code>
                      <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {doc.title || doc.selector || doc.source_path || doc.path}
                      </p>
                    </div>
                    <span className="mt-0.5 text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600">
                      +
                    </span>
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

function LibraryReferenceList({
  onInsertVariable,
}: {
  onInsertVariable: (text: string) => void;
}) {
  const { packs, isLoading, isError } = useKnowledgePacks();
  const activePacks = (packs ?? []).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  if (isLoading) {
    return (
      <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
        Loading library...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-xs text-red-600 dark:text-red-400">
          Failed to load library packs.
        </p>
      </div>
    );
  }

  if (activePacks.length === 0) {
    return (
      <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
        No active library packs.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Library
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Click a pack to insert its context variable.
      </p>
      <div className="space-y-1">
        {activePacks.map((pack: KnowledgePack) => (
          <LibraryPackReference
            key={pack.id}
            pack={pack}
            onInsertVariable={onInsertVariable}
          />
        ))}
      </div>
    </div>
  );
}

export function ProjectContextTab({ project, onUpdated }: ProjectContextTabProps) {
  const [value, setValue] = useState("");
  const [referenceTab, setReferenceTab] = useState<"variables" | "library">("variables");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (project) {
      const ctx = (project.settings as Record<string, unknown>)?.context;
      setValue(typeof ctx === "string" ? ctx : "");
    }
  }, [project]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, context: value },
      });
      onUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save context");
    } finally {
      setIsSaving(false);
    }
  }, [project, value, onUpdated]);

  const isDirty =
    project != null &&
    value !== ((project.settings as Record<string, unknown>)?.context ?? "");

  const insertVariable = useCallback((token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setValue((current) => `${current}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }, [value]);

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card static>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle>Project Context</CardTitle>
              <CardDescription>
                Global context rendered into <code className="font-mono">project.context</code> for agents working in this project.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Architecture, goals, conventions, constraints, library references..."
            className="min-h-[420px] resize-y font-mono text-sm leading-6"
          />
        </CardContent>
        <CardFooter className="gap-3">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="gap-2"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
          )}
          {error && (
            <span className="text-sm text-flag-red-600 dark:text-flag-red-400">{error}</span>
          )}
        </CardFooter>
      </Card>

      <Card static className="flex max-h-[680px] min-h-[420px] flex-col overflow-hidden xl:sticky xl:top-24 xl:self-start">
        <CardHeader className="shrink-0 pb-3">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <CardTitle className="text-sm">References</CardTitle>
          </div>
          <CardDescription>
            Insert template and knowledge vars into the project context.
          </CardDescription>
        </CardHeader>
        <div className="theme-border flex shrink-0 border-b">
          <button
            type="button"
            onClick={() => setReferenceTab("variables")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              referenceTab === "variables"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Variables
          </button>
          <button
            type="button"
            onClick={() => setReferenceTab("library")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              referenceTab === "library"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Library
          </button>
        </div>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="h-full pt-2">
            {referenceTab === "variables" ? (
              <TemplateVariableReference
                onInsertVariable={insertVariable}
                flatVarsOnly
                excludeGroups={["Knowledge"]}
              />
            ) : (
              <LibraryReferenceList onInsertVariable={insertVariable} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
