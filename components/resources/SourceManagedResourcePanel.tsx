"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  sourceManagedMetadata,
  sourceManagedRawUrl,
  type SourceManagedResource,
} from "@/lib/sourceManaged";

interface SourceManagedResourcePanelProps {
  resource: SourceManagedResource;
  title: string;
  description?: string | null;
  fallbackContent?: string | null;
  fallbackLanguage?: "markdown" | "yaml" | "text";
}

export function SourceManagedResourcePanel({
  resource,
  title,
  description,
  fallbackContent,
  fallbackLanguage = "yaml",
}: SourceManagedResourcePanelProps) {
  const source = useMemo(() => sourceManagedMetadata(resource), [resource]);
  const rawUrl = useMemo(() => sourceManagedRawUrl(source), [source]);
  const [loaded, setLoaded] = useState<{ url: string; content: string | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!rawUrl) return;
    let cancelled = false;
    fetch(rawUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setLoaded({ url: rawUrl, content: text, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({
            url: rawUrl,
            content: null,
            error: err instanceof Error ? err.message : "Failed to fetch source",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rawUrl]);

  const loadedForUrl = rawUrl && loaded?.url === rawUrl ? loaded : null;
  const loading = Boolean(rawUrl && !loadedForUrl);
  const error = loadedForUrl?.error ?? null;
  const shownContent = loadedForUrl?.content ?? fallbackContent ?? "";
  const isFetchedContent = loadedForUrl?.content != null;
  const sourcePath = source.sourcePath?.toLowerCase() ?? "";
  const isMarkdown = isFetchedContent ? sourcePath.endsWith(".md") || sourcePath.endsWith(".mdx") : fallbackLanguage === "markdown";
  const repoLabel = source.owner && source.repo ? `${source.owner}/${source.repo}` : "Unknown source";
  const refLabel = source.commit ? source.commit.slice(0, 7) : source.ref;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="theme-border border-b px-4 py-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="theme-text text-sm font-semibold">{title}</h2>
              <span className="theme-surface-muted-strong theme-text rounded-full px-2 py-0.5 text-[10px] font-medium">
                Source managed
              </span>
            </div>
            {description ? <p className="theme-text-muted mt-1 text-sm">{description}</p> : null}
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <SourceField label="Repository" value={repoLabel} />
          <SourceField label="Ref" value={refLabel ?? "default"} />
          <SourceField label="Path" value={source.sourcePath ?? "Not recorded"} mono />
          <SourceField label="Selector" value={source.selector ?? "None"} mono />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="theme-text-muted text-sm">Loading source content...</div>
        ) : error ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {error}. Showing the stored snapshot.
          </div>
        ) : null}
        {shownContent ? (
          isMarkdown ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{shownContent}</ReactMarkdown>
            </div>
          ) : (
            <pre className="theme-border theme-surface-muted overflow-x-auto rounded-lg border p-4 text-xs leading-5">
              <code>{shownContent}</code>
            </pre>
          )
        ) : (
          <div className="theme-text-muted text-sm">No source content available.</div>
        )}
      </div>
    </div>
  );
}

function SourceField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="theme-border theme-surface-muted min-w-0 rounded-lg border px-3 py-2">
      <div className="theme-text-muted text-[10px] font-semibold uppercase tracking-wider">{label}</div>
      <div className={`theme-text mt-0.5 truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
