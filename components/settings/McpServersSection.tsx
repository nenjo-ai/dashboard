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
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-700 dark:bg-gray-800"
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
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </Button>
      </div>

      {/* Empty state */}
      {(!mcpServers || mcpServers.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 dark:border-gray-600 dark:bg-gray-800">
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
      <McpRegistryModal
        open={showRegistry}
        onClose={() => setShowRegistry(false)}
        onInstall={() => {
          setShowRegistry(false);
          mutate();
        }}
      />
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
    <div className="flex h-[200px] flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      {/* Header: title + actions */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {server.display_name}
        </h3>
        <div className="flex items-center gap-0.5 shrink-0">
          {!server.is_system && onEdit && (
            <button
              onClick={onEdit}
              className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
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
  const [displayName, setDisplayName] = useState(server?.display_name ?? "");
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
          display_name: displayName.trim() || undefined,
          description: description.trim() || undefined,
          transport: transport || undefined,
          command: transport === "stdio" ? command.trim() || undefined : undefined,
          args: transport === "stdio" && args.trim() ? args.trim().split(/\s+/) : undefined,
          url: transport === "http" ? url.trim() || undefined : undefined,
        });
      } else {
        await createMcpServer({
          name: name.trim(),
          display_name: displayName.trim(),
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
  }, [isEdit, server, name, displayName, description, transport, command, args, url, onSaved]);

  return (
    <Modal
      key={serverKey}
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit MCP Server" : "Add MCP Server"}
    >
      <div className="space-y-4">
        {!isEdit && (
          <div>
            <Label className="block mb-1.5">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. github-mcp"
              autoFocus
            />
          </div>
        )}

        <div>
          <Label className="block mb-1.5">Display Name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. GitHub"
          />
        </div>

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
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-600"
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
            disabled={saving || (!isEdit && !name.trim()) || !displayName.trim()}
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
}: {
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detail view state
  const [detailServer, setDetailServer] = useState<McpRegistryServer | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const executeSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const data = await searchMcpRegistry(q.trim());
      setResults(data.servers || []);
      setNextCursor(data.nextCursor);
    } catch {
      setResults([]);
      setNextCursor(undefined);
    } finally {
      setSearching(false);
    }
  }, []);

  // Live search when query is 3+ characters
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (query.trim().length >= 3) {
      debounceRef.current = setTimeout(() => executeSearch(query), 300);
    } else {
      debounceRef.current = null;
    }
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, executeSearch]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || !query.trim()) return;
    setLoadingMore(true);
    try {
      const data = await searchMcpRegistry(query.trim(), 20, nextCursor);
      setResults((prev) => [...prev, ...(data.servers || [])]);
      setNextCursor(data.nextCursor);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [query, nextCursor]);

  const handleViewDetail = useCallback(async (server: McpRegistryServer) => {
    setLoadingDetail(true);
    setDetailServer(server);
    try {
      const full = await getMcpRegistryServer(server.name);
      setDetailServer(full);
    } catch {
      // Keep the search-level data if detail fetch fails
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleInstall = useCallback(
    async (server: McpRegistryServer) => {
      setInstallingName(server.name);
      try {
        // Prefer streamable-http over sse (worker uses JSON-RPC POST)
        const remote = server.remotes?.find((r) => r.type === "streamable-http")
          ?? server.remotes?.find((r) => r.type === "sse")
          ?? server.remotes?.[0];
        const pkg = server.packages?.[0];
        const hasHttp = remote?.type === "streamable-http" || remote?.type === "sse";

        let transport: "stdio" | "http";
        let command: string | undefined;
        let args: string[] | undefined;
        let url: string | undefined;

        if (hasHttp && remote?.url) {
          transport = "http";
          url = remote.url;
        } else if (pkg) {
          transport = "stdio";
          if (pkg.registryType === "npm") {
            command = pkg.runtimeHint || "npx";
            args = ["-y", pkg.identifier || server.name];
          } else if (pkg.registryType === "pypi") {
            command = pkg.runtimeHint || "uvx";
            args = [pkg.identifier || server.name];
          } else if (pkg.registryType === "oci") {
            command = pkg.runtimeHint || "docker";
            args = ["run", "-i", "--rm", pkg.identifier || server.name];
          } else {
            command = "npx";
            args = ["-y", pkg.identifier || server.name];
          }
        } else {
          transport = "stdio";
          command = "npx";
          args = ["-y", server.name];
        }

        // Build env_schema from registry auth requirements
        const envSchema: Array<{ key: string; label: string; required: boolean }> = [];
        server.packages?.forEach((pkg) => {
          pkg.environmentVariables?.forEach((ev) => {
            if (ev.name) envSchema.push({ key: ev.name, label: ev.description || ev.name, required: ev.isRequired ?? false });
          });
          pkg.runtimeArguments?.forEach((arg) => {
            if (arg.variables) {
              Object.entries(arg.variables).forEach(([key, v]) => {
                if (v.isSecret || v.isRequired) envSchema.push({ key, label: arg.description || key, required: v.isRequired ?? false });
              });
            }
          });
        });
        server.remotes?.forEach((remote) => {
          remote.headers?.forEach((h) => {
            if (h.isSecret || h.isRequired) envSchema.push({ key: h.name || "authorization", label: h.description || h.name || "Auth header", required: h.isRequired ?? false });
          });
        });
        // For HTTP remotes with no declared auth, add a generic token field
        if (envSchema.length === 0 && hasHttp) {
          envSchema.push({ key: "token", label: "API token or access key", required: false });
        }

        await createMcpServer({
          name: server.name.replace(/[^a-zA-Z0-9_-]/g, "-"),
          display_name: server.title || server.name,
          description: server.description || undefined,
          transport,
          command,
          args,
          url,
          env_schema: envSchema.length > 0 ? envSchema : undefined,
        });

        toast.success(`"${server.title || server.name}" installed.`);
        onInstall(server);
      } catch {
        toast.error("Failed to install MCP server.");
      } finally {
        setInstallingName(null);
      }
    },
    [onInstall],
  );

  return (
    <Modal open={open} onClose={onClose} title={detailServer ? detailServer.title || detailServer.name : "Browse MCP Registry"} className="max-w-2xl">
      <div className="space-y-4">
        {detailServer ? (
          <McpRegistryDetailView
            server={detailServer}
            loading={loadingDetail}
            installing={installingName === detailServer.name}
            onBack={() => setDetailServer(null)}
            onInstall={() => handleInstall(detailServer)}
          />
        ) : (
          <>
            {/* Search bar */}
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && executeSearch(query)}
                placeholder="Search MCP servers (e.g. github, slack, linear...)"
                className="flex-1"
                autoFocus
              />
              <Button
                onClick={() => executeSearch(query)}
                disabled={searching || !query.trim()}
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

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto">
              {searching ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : results.length === 0 && searched ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No servers found. Try a different search term or add one manually.
                </div>
              ) : results.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Search the official MCP registry to discover and install servers.
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((server, idx) => {
                    const remote = server.remotes?.[0];
                    const transportLabel = remote?.type === "streamable-http" || remote?.type === "sse" ? "http" : "stdio";

                    return (
                      <button
                        key={`${server.name}-${idx}`}
                        onClick={() => handleViewDetail(server)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-gray-500 dark:hover:bg-gray-700"
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
                  {nextCursor && (
                    <Button
                      variant="secondary"
                      className="mt-2 w-full"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      isLoading={loadingMore}
                    >
                      {loadingMore ? "Loading..." : "Load more"}
                    </Button>
                  )}
                </div>
              )}
            </div>
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
  onBack,
  onInstall,
}: {
  server: McpRegistryServer;
  loading: boolean;
  installing: boolean;
  onBack: () => void;
  onInstall: () => void;
}) {
  // Sanitize server name for env var pattern
  const sanitizedName = server.name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();

  // Collect all auth requirements from packages + remotes
  const authRequirements: Array<{ label: string; description?: string; isSecret?: boolean; envVar?: string }> = [];

  server.packages?.forEach((pkg) => {
    pkg.environmentVariables?.forEach((ev) => {
      if (ev.name) authRequirements.push({ label: ev.name, description: ev.description, isSecret: ev.isSecret, envVar: `NENJO_MCP_${sanitizedName}_${ev.name.toUpperCase()}` });
    });
    pkg.runtimeArguments?.forEach((arg) => {
      if (arg.variables) {
        Object.entries(arg.variables).forEach(([key, v]) => {
          if (v.isSecret) authRequirements.push({ label: key, description: arg.description, isSecret: true, envVar: `NENJO_MCP_${sanitizedName}_${key.toUpperCase()}` });
        });
      }
    });
  });

  server.remotes?.forEach((remote) => {
    remote.headers?.forEach((h) => {
      const fieldName = h.name || "authorization";
      authRequirements.push({ label: fieldName, description: h.description, isSecret: h.isSecret, envVar: `NENJO_MCP_${sanitizedName}_${fieldName.toUpperCase()}` });
    });
  });

  // If there are HTTP remotes but no explicit auth requirements, hint that auth is likely needed
  const hasHttpRemote = server.remotes?.some(
    (r) => r.type === "streamable-http" || r.type === "sse",
  );
  const authUndeclared = authRequirements.length === 0 && hasHttpRemote;

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
                <span className="inline-flex rounded-sm bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
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
                    <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
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
          {(authRequirements.length > 0 || authUndeclared) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Credentials
              </h4>
              {authUndeclared ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This server may require authentication. Set credentials via the worker&apos;s{" "}
                  <code className="rounded-sm bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-gray-700">
                    ~/.nenjo/credentials.toml
                  </code>{" "}
                  or environment variables.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {authRequirements.map((req, i) => (
                    <div key={i} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-700/50">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{req.label}</span>
                        {req.isSecret && (
                          <span className="rounded-sm bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                            secret
                          </span>
                        )}
                      </div>
                      {req.description && (
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{req.description}</p>
                      )}
                      {req.envVar && (
                        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                          Set via: <code className="rounded-sm bg-gray-100 px-1 py-0.5 dark:bg-gray-600">{req.envVar}</code>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Install button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={onInstall}
              disabled={installing}
              isLoading={installing}
            >
              {installing ? "Installing..." : "Install Server"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
