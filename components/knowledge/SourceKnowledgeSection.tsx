"use client";

import { useEffect, useMemo, useState } from "react";
import matter from "gray-matter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Folder, Loader2 } from "lucide-react";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { KnowledgeGraphView } from "@/components/knowledge/KnowledgeGraphView";
import { metadataText } from "@/lib/sourceManaged";
import type { KnowledgeManifestEdge } from "@/components/knowledge/knowledgeManifestGraph";
import type { KnowledgePack } from "@/lib/types";

interface SourceKnowledgeDoc {
  id?: string;
  selector?: string;
  path?: string;
  source_path: string;
  title?: string;
  summary?: string;
  kind?: string;
  tags?: string[];
  related?: Array<{ type?: string; target?: string }>;
}

interface SourceKnowledgeManifest {
  name?: string;
  version?: string;
  manifest?: {
    name?: string;
    description?: string;
    docs?: SourceKnowledgeDoc[];
    edges?: KnowledgeManifestEdge[];
  };
  docs?: SourceKnowledgeDoc[];
  edges?: KnowledgeManifestEdge[];
}

interface SourceKnowledgePackage {
  name?: string;
  version?: string;
  entry?: string;
  metadata?: {
    description?: string;
  };
}

interface SourceKnowledgeInfo {
  owner: string;
  repo: string;
  ref: string;
  basePath: string;
  manifestPath: string;
}

export function SourceKnowledgeSection({ pack, activeView: controlledView }: { pack: KnowledgePack; activeView?: "documents" | "graph" }) {
  const source = useMemo(() => sourceInfo(pack), [pack]);
  const [manifestLoad, setManifestLoad] = useState<{ url: string; manifest: SourceKnowledgeManifest | null; error: string | null } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [contentLoad, setContentLoad] = useState<{ url: string; content: string | null; error: string | null } | null>(null);
  const [internalView, setInternalView] = useState<"documents" | "graph">("documents");
  const activeView = controlledView ?? internalView;
  const expectedManifestUrl = source
    ? repoRawUrl(source, source.manifestPath)
    : null;

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const manifestUrl = repoRawUrl(source, source.manifestPath);

    fetchText(manifestUrl)
      .then((text) => {
        const rawManifest = parseStructuredText<SourceKnowledgeManifest>(text);
        return {
          url: manifestUrl,
          manifest: normalizeSourceKnowledgeManifest(rawManifest, {}),
        };
      })
      .then(({ url, manifest: nextManifest }) => {
        if (cancelled) return;
        setManifestLoad({ url, manifest: nextManifest, error: null });
        setSelectedPath((current) =>
          current && nextManifest.docs?.some((doc) => doc.source_path === current)
            ? current
            : nextManifest.docs?.[0]?.source_path ?? null,
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setManifestLoad({
            url: manifestUrl,
            manifest: null,
            error: err instanceof Error ? err.message : "Failed to load source manifest",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const manifestForSource =
    manifestLoad?.url === expectedManifestUrl ? manifestLoad : null;
  const manifest = manifestForSource?.manifest ?? null;
  const manifestError = manifestForSource?.error ?? null;
  const docs = manifest?.docs ?? [];
  const selectedDoc = docs.find((doc) => doc.source_path === selectedPath) ?? null;

  useEffect(() => {
    if (!source || !selectedDoc) return;
    let cancelled = false;
    const url = rawUrl(source, selectedDoc.source_path);
    fetchText(url)
      .then((text) => {
        if (!cancelled) setContentLoad({ url, content: text, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setContentLoad({
            url,
            content: null,
            error: err instanceof Error ? err.message : "Failed to load source document",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDoc, source]);
  const contentUrl = source && selectedDoc ? rawUrl(source, selectedDoc.source_path) : null;
  const contentForUrl = contentUrl && contentLoad?.url === contentUrl ? contentLoad : null;
  const content = contentForUrl?.content ?? null;
  const contentError = contentForUrl?.error ?? null;

  if (!source) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        This knowledge graph is read-only but is missing source metadata.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-950 dark:text-gray-50">{manifest?.name ?? pack.name}</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">Source managed</span>
              {manifest?.version ?? pack.version ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {manifest?.version ?? pack.version}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {manifest?.manifest?.description ?? pack.description ?? `${source.owner}/${source.repo}`}
            </p>
          </div>
          {controlledView === undefined ? <ViewToggle activeView={activeView} onChange={setInternalView} /> : null}
        </div>
      </div>

      {activeView === "graph" && manifest ? (
        <KnowledgeGraphView manifest={{ name: manifest.name ?? pack.name, docs, edges: manifest.edges }} />
      ) : (
        <div className="grid min-h-[780px] overflow-hidden lg:grid-cols-[290px_minmax(0,1fr)_340px]">
          <aside className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-950/20 lg:border-b-0 lg:border-r">
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {docs.length.toLocaleString()} documents
            </div>
            <div className="max-h-[740px] overflow-y-auto p-3">
              {manifestError ? (
                <ErrorBox>{manifestError}</ErrorBox>
              ) : !manifest ? (
                <LoadingLabel text="Loading source manifest..." />
              ) : docs.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">No documents in source manifest.</div>
              ) : (
                <div className="space-y-1">
                  {docs.map((doc) => (
                    <button
                      key={doc.source_path}
                      type="button"
                      onClick={() => setSelectedPath(doc.source_path)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        selectedPath === doc.source_path
                          ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      }`}
                    >
                      <Folder className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{doc.title ?? doc.source_path}</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{doc.source_path}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

        <main className="min-w-0 overflow-y-auto p-6">
          {!selectedDoc ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Select a source document.</div>
          ) : contentError ? (
            <ErrorBox>{contentError}</ErrorBox>
          ) : content === null ? (
            <LoadingLabel text="Loading source document..." />
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-slate-950 prose-pre:text-gray-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const lang = match ? match[1] : "";
                    const codeString = String(children).replace(/\n$/, "");
                    if (lang === "mermaid") return <MermaidDiagram chart={codeString} />;
                    return <code className={className} {...props}>{children}</code>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </main>

        <aside className="border-t border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-950/20 lg:border-l lg:border-t-0">
          {selectedDoc ? (
            <div className="space-y-4">
              <MetadataBlock label="Title" value={selectedDoc.title ?? selectedDoc.source_path} />
              <MetadataBlock label="Path" value={selectedDoc.path ?? selectedDoc.source_path} mono />
              <MetadataBlock label="Kind" value={selectedDoc.kind ?? "None"} />
              {selectedDoc.summary ? <MetadataBlock label="Summary" value={selectedDoc.summary} /> : null}
              <TokenList label="Tags" values={selectedDoc.tags ?? []} />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Related</h3>
                {selectedDoc.related?.length ? (
                  <div className="space-y-1">
                    {selectedDoc.related.map((rel, index) => (
                      <div key={`${rel.type}-${rel.target}-${index}`} className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900">
                        <span className="font-medium">{rel.type ?? "related"}</span>
                        <span className="ml-1 font-mono text-gray-500 dark:text-gray-400">{rel.target}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No relationships.</p>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      )}
    </div>
  );
}

function ViewToggle({ activeView, onChange }: { activeView: "documents" | "graph"; onChange: (view: "documents" | "graph") => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      {(["documents", "graph"] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
            activeView === view
              ? "bg-deep-space-blue-50 text-deep-space-blue-700 shadow-sm dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

function sourceInfo(pack: KnowledgePack): SourceKnowledgeInfo | null {
  const parsedSourceUrl = parseGitHubRepoUrl(
    metadataText(pack.metadata, ["source", "url"]),
  );
  const owner =
    metadataText(pack.metadata, ["source", "owner"]) ?? parsedSourceUrl?.owner;
  const repo =
    metadataText(pack.metadata, ["source", "repo"]) ?? parsedSourceUrl?.repo;
  const installedManifestPath = metadataText(pack.metadata, [
    "install",
    "source_path",
  ]);
  const sourcePath = metadataText(pack.metadata, ["source", "path"]);
  const distributionManifestPath =
    metadataText(pack.metadata, ["distribution", "manifest_path"]) ??
    metadataText(pack.metadata, ["package", "manifest_path"]);
  const manifestPath =
    installedManifestPath ??
    joinPath(sourcePath, distributionManifestPath) ??
    sourcePath;
  const ref =
    metadataText(pack.metadata, ["version", "resolved_commit_sha"]) ??
    metadataText(pack.metadata, ["version", "requested_ref"]) ??
    metadataText(pack.metadata, ["version", "ref"]) ??
    "main";
  if (!owner || !repo || !manifestPath) return null;
  return {
    owner,
    repo,
    ref,
    basePath: dirname(manifestPath),
    manifestPath: cleanPath(manifestPath),
  };
}

function rawUrl(source: SourceKnowledgeInfo, relativePath: string): string {
  const path = joinPath(source.basePath, relativePath) ?? cleanPath(relativePath);
  return repoRawUrl(source, path);
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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function parseStructuredText<T>(text: string): T {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(text) as T;
  if (trimmed.startsWith("---")) return matter(text).data as T;
  return matter(`---\n${text.trim()}\n---\n`).data as T;
}

function normalizeSourceKnowledgeManifest(
  raw: SourceKnowledgeManifest,
  pkg: SourceKnowledgePackage,
): SourceKnowledgeManifest {
  const nested = raw.manifest;
  return {
    ...raw,
    name: raw.name ?? nested?.name ?? pkg.name,
    version: raw.version ?? pkg.version,
    manifest: {
      ...nested,
      description: nested?.description ?? pkg.metadata?.description,
    },
    docs: raw.docs ?? nested?.docs ?? [],
    edges: raw.edges ?? nested?.edges ?? [],
  };
}

function LoadingLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
      {children}
    </div>
  );
}

function MetadataBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h3>
      <p className={`break-words text-sm text-gray-800 dark:text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function TokenList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h3>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{value}</span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">None.</p>
      )}
    </div>
  );
}
