"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMcpServers } from "@/lib/hooks";
import {
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  searchMcpRegistry,
  getMcpRegistryServer,
  type McpRegistryServer,
} from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { toast } from "@/lib/toast";
import type { McpServer } from "@/lib/types";
import { resourceSlug } from "@/lib/resourceSlug";
import { registryInstallPlan } from "@/lib/mcpRegistry";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function McpServersSection() {
  const { mcpServers, isLoading, mutate } = useMcpServers();

  const [showCreate, setShowCreate] = useState(false);
  const [editServer, setEditServer] = useState<McpServer | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRegistry, setShowRegistry] = useState(false);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteMcpServer(id);
        mutate();
        toast.success("MCP server deleted.");
      } catch {
        toast.error("Failed to delete MCP server.");
      } finally {
        setDeletingId(null);
      }
    },
    [mutate],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="theme-border theme-surface rounded-xl border p-5 shadow-xs"
          >
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setShowRegistry(true)}>
          Browse Registry
        </Button>
        <Button onClick={() => setShowCreate(true)}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Manually
        </Button>
      </div>

      {/* Empty state */}
      {(!mcpServers || mcpServers.length === 0) && (
        <div className="theme-border theme-surface flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16">
          <div className="rounded-full bg-deep-space-blue-50 p-4 dark:bg-deep-space-blue-900/50">
            <svg
              className="h-10 w-10 text-deep-space-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            No MCP servers yet
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
            MCP servers give agents access to external tools like GitHub, Slack, and databases. Add one to get started.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setShowRegistry(true)}>
              Browse Registry
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              Add Manually
            </Button>
          </div>
        </div>
      )}

      {/* Server cards grid */}
      {mcpServers && mcpServers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {mcpServers.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              onEdit={!server.is_system ? () => setEditServer(server) : undefined}
              onDelete={!server.is_system ? () => handleDelete(server.id) : undefined}
              isDeleting={deletingId === server.id}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <McpServerFormModal
        open={showCreate || !!editServer}
        server={editServer}
        onClose={() => {
          setShowCreate(false);
          setEditServer(null);
        }}
        onSaved={() => {
          setShowCreate(false);
          setEditServer(null);
          mutate();
        }}
      />

      {/* Registry Browse Modal */}
      {showRegistry && (
        <McpRegistryModal
          open
          installedServers={mcpServers ?? []}
          onClose={() => setShowRegistry(false)}
          onInstall={() => {
            setShowRegistry(false);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// McpServerCard (private to this file)
// ---------------------------------------------------------------------------

function McpServerCard({
  server,
  onEdit,
  onDelete,
  isDeleting,
}: {
  server: McpServer;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="theme-border theme-surface flex h-[200px] flex-col rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-md">
      {/* Header: title + actions */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {server.name}
        </h3>
        <div className="flex items-center gap-0.5 shrink-0">
          {!server.is_system && onEdit && (
            <button
              onClick={onEdit}
              className="rounded p-1 text-gray-300 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300"
              title="Edit server"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          {!server.is_system && onDelete && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-flag-red-500 disabled:opacity-50 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
              title="Delete server"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Transport badge + URL */}
      <div className="mt-1 flex items-center gap-2">
        <span className={`inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
          server.transport === "stdio"
            ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            : "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
        }`}>
          {server.transport}
        </span>
        <code className="truncate text-[11px] text-gray-400 dark:text-gray-500 font-mono">
          {server.transport === "stdio"
            ? server.command
            : server.url}
        </code>
      </div>

      {/* Description */}
      <p className="mt-2 flex-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
        {server.description || "\u00A0"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit Form Modal
// ---------------------------------------------------------------------------

function McpServerFormModal({
  open,
  server,
  onClose,
  onSaved,
}: {
  open: boolean;
  server: McpServer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!server;

  const [name, setName] = useState(server?.name ?? "");
  const [slug, setSlug] = useState(server?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(server));
  const [description, setDescription] = useState(server?.description ?? "");
  const [transport, setTransport] = useState<"stdio" | "http">(server?.transport ?? "stdio");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join(" "));
  const [url, setUrl] = useState(server?.url ?? "");
  const [saving, setSaving] = useState(false);

  // Reset form when server changes
  const serverKey = server?.id ?? "new";

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (isEdit && server) {
        await updateMcpServer(server.id, {
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          transport: transport || undefined,
          command: transport === "stdio" ? command.trim() || undefined : undefined,
          args: transport === "stdio" && args.trim() ? args.trim().split(/\s+/) : undefined,
          url: transport === "http" ? url.trim() || undefined : undefined,
        });
      } else {
        await createMcpServer({
          slug,
          name: name.trim(),
          transport,
          command: transport === "stdio" ? command.trim() : undefined,
          args: transport === "stdio" && args.trim() ? args.trim().split(/\s+/) : undefined,
          url: transport === "http" ? url.trim() : undefined,
          description: description.trim() || undefined,
        });
      }
      toast.success(isEdit ? "MCP server updated." : "MCP server added.");
      onSaved();
    } catch {
      toast.error("Failed to save MCP server.");
    } finally {
      setSaving(false);
    }
  }, [isEdit, server, slug, name, description, transport, command, args, url, onSaved]);

  return (
    <Modal
      key={serverKey}
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit MCP Server" : "Add MCP Server"}
    >
      <div className="space-y-4">
        <div>
          <Label className="block mb-1.5">Name</Label>
          <Input
            value={name}
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              if (!slugEdited) setSlug(resourceSlug(nextName));
            }}
            placeholder="e.g. GitHub"
            autoFocus
          />
        </div>
        {!isEdit && (
          <div>
            <Label className="block mb-1.5">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlug(resourceSlug(e.target.value));
                setSlugEdited(true);
              }}
              placeholder="e.g. github-mcp"
              className="font-mono"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Stable agent-facing reference.
            </p>
          </div>
        )}

        <div>
          <Label className="block mb-1.5">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {/* Transport */}
        <div>
          <Label className="block mb-2">Transport</Label>
          <div className="flex gap-2">
            {(["stdio", "http"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTransport(t)}
                className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                  transport === t
                    ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                    : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Transport-specific fields */}
        {transport === "stdio" ? (
          <>
            <div>
              <Label className="block mb-1.5">Command</Label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npx or /usr/local/bin/mcp-server"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="block mb-1.5">Arguments</Label>
              <Input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="e.g. -y @modelcontextprotocol/server-github"
                className="font-mono"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Space-separated arguments passed to the command.
              </p>
            </div>
          </>
        ) : (
          <div>
            <Label className="block mb-1.5">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://mcp.example.com/sse"
              className="font-mono"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            isLoading={saving}
          >
            {isEdit ? "Save" : "Add Server"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Registry Browse Modal
// ---------------------------------------------------------------------------

function McpRegistryModal({
  open,
  onClose,
  onInstall,
  installedServers,
}: {
  installedServers: McpServer[];
  open: boolean;
  onClose: () => void;
  onInstall: (server: McpRegistryServer) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<McpRegistryServer[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installingName, setInstallingName] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const detailRequest = useRef(0);
  const installInFlight = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detailServer, setDetailServer] = useState<McpRegistryServer | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const invalidateSearch = useCallback(() => { searchRequest.current++; }, []);

  const executeSearch = useCallback(async (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const request = ++searchRequest.current;
    setSearching(true);
    setLoadingMore(false);
    setSearched(true);
    setSearchError(null);
    setResults([]);
    setNextCursor(undefined);
    try {
      const data = await searchMcpRegistry(q.trim());
      if (request !== searchRequest.current) return;
      setResults(Array.from(new Map(data.servers.map((server) => [server.name, server])).values()));
      setNextCursor(data.nextCursor);
    } catch {
      if (request === searchRequest.current) setSearchError("Could not load the MCP registry. Please try again.");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    debounceRef.current = setTimeout(() => void executeSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      invalidateSearch();
    };
  }, [query, executeSearch, invalidateSearch]);

  useEffect(() => () => { detailRequest.current++; }, []);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || searching) return;
    const request = ++searchRequest.current;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const data = await searchMcpRegistry(query.trim(), 20, nextCursor);
      if (request !== searchRequest.current) return;
      setResults((prev) => Array.from(new Map([...prev, ...data.servers].map((server) => [server.name, server])).values()));
      setNextCursor(data.nextCursor === nextCursor ? undefined : data.nextCursor);
    } catch {
      if (request === searchRequest.current) setSearchError("Could not load more servers. Please try again.");
    } finally {
      if (request === searchRequest.current) setLoadingMore(false);
    }
  }, [query, nextCursor, loadingMore, searching]);

  const handleViewDetail = useCallback(async (server: McpRegistryServer) => {
    const request = ++detailRequest.current;
    setLoadingDetail(true);
    setDetailError(null);
    setDetailServer(server);
    try {
      const full = await getMcpRegistryServer(server.name);
      if (request === detailRequest.current) setDetailServer(full);
    } catch {
      if (request === detailRequest.current) setDetailError("Could not load the current server details. Return to results and try again.");
    } finally {
      if (request === detailRequest.current) setLoadingDetail(false);
    }
  }, []);

  const handleInstall = useCallback(async (server: McpRegistryServer) => {
    if (installInFlight.current || loadingDetail || detailError) return;
    const plan = registryInstallPlan(server);
    if (!plan.request) { toast.error(plan.error); return; }
    if (installedServers.some((installed) => installed.slug === plan.request.slug)) {
      toast.error("This server is already in your workspace.");
      return;
    }
    installInFlight.current = true;
    setInstallingName(server.name);
    try {
      await createMcpServer(plan.request);
      toast.success(`"${server.title || server.name}" added to your workspace.`);
      onInstall(server);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to install MCP server.");
    } finally {
      installInFlight.current = false;
      setInstallingName(null);
    }
  }, [onInstall, installedServers, loadingDetail, detailError]);

  return (
    <Modal open={open} onClose={() => { if (!installInFlight.current) onClose(); }} title={detailServer ? detailServer.title || detailServer.name : "Browse MCP Registry"} className="max-w-2xl">
      <div className="space-y-4">
        {detailServer ? (
          <McpRegistryDetailView
            server={detailServer}
            loading={loadingDetail}
            installing={installingName === detailServer.name}
            installed={installedServers.some((server) => server.slug === resourceSlug(detailServer.name))}
            error={detailError}
            onBack={() => {
              detailRequest.current++;
              setDetailServer(null);
              setDetailError(null);
            }}
            onInstall={() => handleInstall(detailServer)}
          />
        ) : (
          <>
            {/* Search bar */}
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => {
                  invalidateSearch();
                  setSearchError(null);
                  setNextCursor(undefined);
                  setResults([]);
                  setSearching(true);
                  setQuery(e.target.value);
                }}
                aria-label="Search MCP registry"
                onKeyDown={(e) => e.key === "Enter" && executeSearch(query)}
                placeholder="Search MCP servers (e.g. github, slack, linear...)"
                className="flex-1"
                autoFocus
              />
              <Button
                onClick={() => executeSearch(query)}
                disabled={searching}
                isLoading={searching}
              >
                {!searching && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                )}
                Search
              </Button>
            </div>

            {searchError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{searchError}</p>}
            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto">
              {searching ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="theme-border theme-surface-muted rounded-lg border p-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : results.length === 0 && searched && !searchError ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {nextCursor ? "No current servers on this page. Load more to continue browsing." : "No servers found. Try a different search term or add one manually."}
                </div>
              ) : results.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Search the official MCP registry to discover and install servers.
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((server) => {
                    const transportLabel = registryInstallPlan(server).request?.transport ?? "Custom setup";

                    return (
                      <button
                        key={server.name}
                        onClick={() => handleViewDetail(server)}
                        className="theme-border theme-surface-muted flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {server.title || server.name}
                            </p>
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              transportLabel === "http"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                : "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                            }`}>
                              {transportLabel}
                            </span>
                            {server.version && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                v{server.version}
                              </span>
                            )}
                          </div>
                          {server.description && (
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                              {server.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                            {server.name}
                          </p>
                        </div>
                        <div className="ml-4 shrink-0">
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {nextCursor && (
              <Button
                variant="secondary"
                className="mt-2 w-full"
                onClick={handleLoadMore}
                disabled={loadingMore || searching}
                isLoading={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Registry Detail View
// ---------------------------------------------------------------------------

function McpRegistryDetailView({
  server,
  loading,
  installing,
  installed,
  error,
  onBack,
  onInstall,
}: {
  server: McpRegistryServer;
  loading: boolean;
  installing: boolean;
  installed: boolean;
  error: string | null;
  onBack: () => void;
  onInstall: () => void;
}) {
  const plan = registryInstallPlan(server);
  const sanitizedName = (server.title || server.name).replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const authRequirements = (plan.request?.env_schema ?? []).map((field) => ({
    label: field.key,
    description: `${field.label}${field.required ? " (required)" : " (optional)"}`,
    envVar: `NENJO_MCP_${sanitizedName}_${field.key.toUpperCase()}`,
  }));

  const transports: Array<{ label: string; detail: string }> = [];
  server.remotes?.forEach((r) => {
    transports.push({ label: r.type || "unknown", detail: r.url || "" });
  });
  server.packages?.forEach((pkg) => {
    const t = pkg.transport?.type || "stdio";
    const detail = pkg.identifier || "";
    transports.push({ label: `${t} (${pkg.registryType || "package"})`, detail });
  });

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        disabled={installing}
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to results
      </button>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="max-h-[400px] space-y-4 overflow-y-auto">
          {/* Header info */}
          <div>
            <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{server.name}</p>
            {server.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{server.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {server.version && (
                <span className="theme-surface-muted theme-text-muted inline-flex rounded-sm px-2 py-0.5 text-xs font-medium">
                  v{server.version}
                </span>
              )}
              {server.repository?.url && (
                <a
                  href={server.repository.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-deep-space-blue-600 hover:underline dark:text-deep-space-blue-400"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Repository
                </a>
              )}
              {server.websiteUrl && (
                <a
                  href={server.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-deep-space-blue-600 hover:underline dark:text-deep-space-blue-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Website
                </a>
              )}
            </div>
          </div>

          {/* Transports */}
          {transports.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Transports
              </h4>
              <div className="mt-2 space-y-1.5">
                {transports.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="theme-surface-muted theme-text-muted rounded-sm px-1.5 py-0.5 font-medium">
                      {t.label}
                    </span>
                    {t.detail && (
                      <span className="truncate font-mono text-gray-400 dark:text-gray-500">
                        {t.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auth requirements */}
          {authRequirements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Credentials
              </h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Configure these values on your worker before using the server, through environment variables or <code>~/.nenjo/credentials.toml</code>.
                For header fields, supply the complete header value, including any authentication prefix.
              </p>
              <div className="mt-2 space-y-2">
                {authRequirements.map((req) => (
                  <div key={req.label} className="theme-border theme-surface-muted rounded-md border px-3 py-2">
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{req.label}</span>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{req.description}</p>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      Set via: <code className="theme-surface-muted rounded-sm px-1 py-0.5">{req.envVar}</code>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Install this server in your current workspace, then assign it to agents, abilities, or domains.
          </p>
          {(error || plan.error) && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error || plan.error}</p>}
          {/* Install button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={onInstall}
              disabled={installing || installed || !!error || !plan.request}
              isLoading={installing}
            >
              {installed ? "Already in workspace" : installing ? "Installing..." : "Install to Workspace"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
