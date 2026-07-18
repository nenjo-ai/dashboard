"use client";

import { useState, useCallback, useMemo } from "react";
import { useActivity, type ActivityEntry } from "@/lib/hooks";
import { activityUrl, fetcher } from "@/lib/api";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Badge } from "@/components/ui/Badge";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

const PAGE_SIZE = 30;

const CATEGORY_FILTERS = [
  { label: "All", value: undefined },
  { label: "Executions", value: "execution" },
  { label: "Resources", value: "resource" },
  { label: "System", value: "system" },
] as const;

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function TokenBadge({ metadata }: { metadata: Record<string, unknown> }) {
  const total = typeof metadata.total_tokens === "number" ? metadata.total_tokens : 0;
  if (!total) return null;
  const input = typeof metadata.input_tokens === "number" ? metadata.input_tokens : 0;
  const output = typeof metadata.output_tokens === "number" ? metadata.output_tokens : 0;
  return (
    <span
      className="text-xs text-gray-400 dark:text-gray-500"
      title={`Input: ${input.toLocaleString()} · Output: ${output.toLocaleString()}`}
    >
      {formatTokens(total)} tokens
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  switch (category) {
    case "execution":
      return <Badge variant="running">execution</Badge>;
    case "resource":
      return <Badge variant="default">resource</Badge>;
    case "system":
      return <Badge variant="feature">system</Badge>;
    default:
      return <Badge variant="default">{category}</Badge>;
  }
}

function EventIcon({ entry }: { entry: ActivityEntry }) {
  const { event_type, category } = entry;

  if (category === "execution") {
    if (event_type === "task_completed" || event_type === "step_completed") {
      return (
        <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    if (event_type === "task_failed" || event_type === "step_failed") {
      return (
        <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    if (event_type === "progress") {
      return (
        <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    // step_warning
    return (
      <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  }

  // Resource events
  if (event_type === "created") {
    return (
      <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    );
  }
  if (event_type === "updated") {
    return (
      <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
      </svg>
    );
  }
  if (event_type === "deleted") {
    return (
      <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    );
  }

  // Default
  return (
    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function ActivityRow({ entry, isExpanded, onToggle }: { entry: ActivityEntry; isExpanded: boolean; onToggle: () => void }) {
  const progressMessage =
    entry.event_type === "progress" && entry.metadata?.message
      ? String(entry.metadata.message)
      : null;

  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <div
      className={`theme-border px-5 py-3 border-b last:border-b-0 transition-colors ${
        hasMetadata ? "cursor-pointer hover:[background:var(--app-hover)]" : ""
      }`}
      onClick={hasMetadata ? onToggle : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <EventIcon entry={entry} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="theme-text text-sm">
            {entry.summary}
          </p>
          {progressMessage && (
            <p className="theme-text-muted mt-0.5 text-xs">
              {progressMessage}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <CategoryBadge category={entry.category} />
            {entry.resource_name && (
              <span className="theme-text-muted text-xs font-medium">
                {entry.resource_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {entry.metadata && <TokenBadge metadata={entry.metadata} />}
          <span className="theme-text-muted text-xs">
            {formatRelativeTime(entry.created_at)}
          </span>
          {hasMetadata && (
            <svg
              className={`theme-text-muted h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          )}
        </div>
      </div>

      {isExpanded && hasMetadata && (
        <div className="theme-border theme-surface-muted mt-3 ml-7 overflow-x-auto rounded-lg border p-3">
          <pre className="theme-text-muted whitespace-pre-wrap break-all text-xs font-mono">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const isMobileViewport = useIsMobileViewport();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [olderEntries, setOlderEntries] = useState<ActivityEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { activity: firstPage, isLoading } = useActivity({
    category,
    limit: PAGE_SIZE,
  });

  // Reset older entries when category filter changes
  const handleCategoryChange = useCallback((value: string | undefined) => {
    setCategory(value);
    setOlderEntries([]);
    setHasMore(true);
  }, []);

  const allEntries = useMemo(
    () => [...(firstPage ?? []), ...olderEntries],
    [firstPage, olderEntries],
  );

  const loadMore = useCallback(async () => {
    const last = allEntries[allEntries.length - 1];
    if (!last || loadingMore) return;

    setLoadingMore(true);
    try {
      const url = activityUrl({
        category,
        before: last.created_at,
        limit: PAGE_SIZE,
      });
      const page = await fetcher<ActivityEntry[]>(url);
      if (page.length < PAGE_SIZE) setHasMore(false);
      setOlderEntries((prev) => [...prev, ...page]);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [allEntries, category, loadingMore]);

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell title="Activity">
        <div className="mb-4 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => handleCategoryChange(f.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === f.value
                  ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                  : "theme-border theme-surface text-gray-600 dark:text-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="rounded-[1.5rem] border border-black/10 bg-transparent dark:border-white/10">
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {isLoading && <div className="px-5 py-8 text-center text-sm text-gray-400">Loading activity...</div>}
            {!isLoading && allEntries.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400">No activity yet.</div>}
            {allEntries.map((entry) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              />
            ))}
          </div>
          {!isLoading && allEntries.length > 0 && hasMore && (
            <div className="border-t border-black/5 px-6 py-3 text-center dark:border-white/10">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-medium text-gray-500 dark:text-gray-400 disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Activity" />
        <PageContent>
          <div className="theme-border theme-surface rounded-xl border shadow-xs">
            <div className="theme-border flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="theme-text text-lg font-semibold">
                  Activity Feed
                </h2>
                <p className="theme-text-muted text-sm">
                  Resource changes, execution progress, and system events.
                </p>
              </div>
              <div className="flex gap-1">
                {CATEGORY_FILTERS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => handleCategoryChange(f.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      category === f.value
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "theme-text-muted hover:[background:var(--app-hover)] hover:[color:var(--app-text)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="theme-border divide-y">
              {isLoading && (
                <div className="theme-text-muted px-5 py-8 text-center text-sm">
                  Loading activity...
                </div>
              )}

              {!isLoading && allEntries.length === 0 && (
                <div className="theme-text-muted px-5 py-8 text-center text-sm">
                  No activity yet.
                </div>
              )}

              {allEntries.map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                />
              ))}
            </div>

            {!isLoading && allEntries.length > 0 && hasMore && (
            <div className="theme-border border-t px-6 py-3 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        </PageContent>
      </>
      )}
    </>
  );
}
