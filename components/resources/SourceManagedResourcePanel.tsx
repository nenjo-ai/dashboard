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
  sections?: SourceManagedDetailSection[];
}

export function SourceManagedResourcePanel({
  resource,
  title,
  description,
  fallbackContent,
  fallbackLanguage = "yaml",
  sections = [],
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
        <div className="mb-4 space-y-4">
          {sections.map((section) => (
            <DetailSection key={section.title} section={section} />
          ))}
          <MetadataDetails metadata={resource.metadata} />
        </div>
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

export interface SourceManagedDetailSection {
  title: string;
  fields?: Array<{
    label: string;
    value: string | number | boolean | null | undefined;
    mono?: boolean;
  }>;
  code?: {
    label?: string;
    value: string | null | undefined;
    language?: "yaml" | "text";
  };
}

function DetailSection({ section }: { section: SourceManagedDetailSection }) {
  const visibleFields = (section.fields ?? []).filter(
    (field) => field.value !== null && field.value !== undefined && String(field.value).trim() !== "",
  );
  const codeValue = section.code?.value?.trim();
  if (visibleFields.length === 0 && !codeValue) return null;

  return (
    <section>
      <h3 className="theme-text-muted mb-2 text-[10px] font-semibold uppercase tracking-wider">
        {section.title}
      </h3>
      {visibleFields.length > 0 ? (
        <div className="theme-border theme-surface-muted grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          {visibleFields.map((field) => (
            <SourceField
              key={`${section.title}:${field.label}`}
              label={field.label}
              value={String(field.value)}
              mono={field.mono}
            />
          ))}
        </div>
      ) : null}
      {codeValue ? (
        <div className={visibleFields.length > 0 ? "mt-3" : ""}>
          {section.code?.label ? (
            <div className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">
              {section.code.label}
            </div>
          ) : null}
          <pre className="theme-border theme-surface-muted overflow-x-auto rounded-lg border p-4 text-xs leading-5">
            <code>{codeValue}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function MetadataDetails({ metadata }: { metadata?: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const preferred = ["install", "source", "package", "version", "distribution", "schemas"];
  const keys = [
    ...preferred.filter((key) => key in metadata),
    ...Object.keys(metadata).filter((key) => !preferred.includes(key)).sort(),
  ];

  return (
    <section>
      <h3 className="theme-text-muted mb-2 text-[10px] font-semibold uppercase tracking-wider">
        Metadata
      </h3>
      <div className="grid gap-2 lg:grid-cols-2">
        {keys.map((key) => (
          <MetadataCard key={key} label={key} value={metadata[key]} />
        ))}
      </div>
    </section>
  );
}

function MetadataCard({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="theme-border theme-surface-muted min-w-0 rounded-lg border px-3 py-2">
      <div className="theme-text-muted text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <pre className="theme-text mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
        {formatMetadataValue(value)}
      </pre>
    </div>
  );
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}
