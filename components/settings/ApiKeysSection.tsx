"use client";

import { useState, useCallback } from "react";
import { useApiKeys, useCurrentUser } from "@/lib/hooks";
import { createApiKey, deleteApiKey } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { CreateApiKeyResponse } from "@/lib/types";
import { MCP_RESOURCE_SCOPES, WORKER_CAPABILITIES, EXCLUSIVE_CAPABILITIES } from "@/lib/types";

// ---------------------------------------------------------------------------
// Expiration presets
// ---------------------------------------------------------------------------
const EXPIRATION_OPTIONS = [
  { label: "Never", value: "never" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "60 days", value: "60d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "365d" },
] as const;

function expirationToDate(value: string): string | null {
  if (value === "never") return null;
  const days = parseInt(value, 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// ---------------------------------------------------------------------------
// Scope grouping
// ---------------------------------------------------------------------------

/** Group scopes by resource and show compact r/w indicators. */
function summarizeScopes(scopes: string[]): { resource: string; access: string }[] {
  const map = new Map<string, { read: boolean; write: boolean }>();
  for (const scope of scopes) {
    const [resource, perm] = scope.split(":");
    if (!resource || !perm) continue;
    const entry = map.get(resource) ?? { read: false, write: false };
    if (perm === "read") entry.read = true;
    if (perm === "write") entry.write = true;
    map.set(resource, entry);
  }
  return Array.from(map.entries()).map(([resource, { read, write }]) => ({
    resource,
    access: read && write ? " r/w" : write ? " w" : " r",
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiKeysSection() {
  const { userId } = useCurrentUser();
  const { apiKeys, isLoading, mutate } = useApiKeys(userId);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [expiration, setExpiration] = useState("never");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reveal modal state (shown after creation)
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!keyName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createApiKey({
        name: keyName.trim(),
        expires_at: expirationToDate(expiration),
        scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        capabilities: selectedCapabilities.length > 0 ? selectedCapabilities : undefined,
      });
      setCreatedKey(result);
      setShowCreate(false);
      setKeyName("");
      setExpiration("never");
      setSelectedScopes([]);
      setSelectedCapabilities([]);
      setCreateError(null);
      mutate();
    } catch (err: unknown) {
      let message = "Failed to create API key";
      if (err instanceof Error) {
        // Try to parse JSON error body from backend
        try {
          const parsed = JSON.parse(err.message);
          message = parsed?.error?.message ?? err.message;
        } catch {
          message = err.message;
        }
      }
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, [keyName, expiration, selectedScopes, selectedCapabilities, mutate]);

  const handleCopy = useCallback(async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.raw_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [createdKey]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteApiKey(id);
        mutate();
      } catch (err) {
        console.error("Failed to delete API key:", err);
      } finally {
        setDeletingId(null);
      }
    },
    [mutate],
  );

  return (
    <>
      <div className="theme-border theme-surface rounded-xl border p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              API Keys
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create long-lived API keys for programmatic access to the Nenjo API.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-deep-space-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-deep-space-blue-700 focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#05070b]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">Create API Key</span>
          </button>
        </div>

        {/* Key list */}
        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="theme-surface-muted h-16 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !apiKeys || apiKeys.length === 0 ? (
            <div className="theme-border theme-surface-muted rounded-lg border border-dashed px-6 py-8 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No API keys yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="theme-border divide-y">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {key.name}
                      </p>
                      <code className="theme-surface-muted theme-text-muted rounded-sm px-2 py-0.5 text-xs font-mono">
                        {key.key_prefix}••••••••
                      </code>
                      <code className="theme-surface-muted rounded-sm px-1.5 py-0.5 text-[10px] font-mono text-gray-400 dark:text-gray-500">
                        {key.id.slice(0, 8)}
                      </code>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {/* Capabilities */}
                      {key.capabilities && key.capabilities.length > 0 ? (
                        key.capabilities.map((cap) => (
                          <span
                            key={`cap-${cap}`}
                            className="inline-flex rounded-sm bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                          >
                            {cap}
                          </span>
                        ))
                      ) : (
                        <span className="theme-surface-muted theme-text-muted inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                          all capabilities
                        </span>
                      )}
                      <span className="mx-px text-gray-300 dark:text-gray-600">|</span>
                      {/* Scopes — grouped by resource */}
                      {key.scopes && key.scopes.length > 0 ? (
                        summarizeScopes(key.scopes).map(({ resource, access }) => (
                          <span
                            key={resource}
                            className="inline-flex items-center gap-0.5 rounded-sm bg-deep-space-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                          >
                            {resource}
                            <span className="text-deep-space-blue-400 dark:text-deep-space-blue-500">
                              {access}
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="theme-surface-muted theme-text-muted inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                          full access
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        Created {formatDate(key.created_at)}
                      </span>
                      <span>
                        Expires {formatDate(key.expires_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            key.last_used_at
                              ? "bg-green-400"
                              : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        />
                        {key.last_used_at
                          ? `Last used ${timeAgo(key.last_used_at)}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(key.id)}
                    disabled={deletingId === key.id}
                    className="ml-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    title="Revoke API key"
                  >
                    {deletingId === key.id ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Create API Key Modal                                                */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setKeyName("");
          setExpiration("never");
          setSelectedCapabilities([]);
          setCreateError(null);
        }}
        title="Create API Key"
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label className="block">
              Name
            </Label>
            <Input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. CI/CD Routine"
              className="mt-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyName.trim()) handleCreate();
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A descriptive name to identify this key.
            </p>
          </div>

          {/* Expiration */}
          <div>
            <Label className="block">
              Expiration
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPIRATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiration(opt.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    expiration === opt.value
                      ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                      : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <Label className="block">
              Capabilities
            </Label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Select which worker capabilities this key grants. Leave empty for full access.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {WORKER_CAPABILITIES.map((cap) => {
                const isExclusive = (EXCLUSIVE_CAPABILITIES as readonly string[]).includes(cap);
                const checked = selectedCapabilities.includes(cap);
                // Check if another key already holds this exclusive capability
                const takenByKey = isExclusive
                  ? (apiKeys ?? []).find((k) => k.capabilities.length === 0 || k.capabilities.includes(cap))
                  : undefined;
                const isTaken = !!takenByKey;

                return (
                  <button
                    key={cap}
                    type="button"
                    disabled={isTaken}
                    onClick={() => {
                      setSelectedCapabilities((prev) =>
                        checked ? prev.filter((c) => c !== cap) : [...prev, cap]
                      );
                    }}
                    className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      isTaken
                        ? "theme-border theme-surface-muted cursor-not-allowed text-gray-400 dark:text-gray-600"
                        : checked
                          ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                          : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                    }`}
                    title={isTaken ? `Already assigned to "${takenByKey?.name}"` : undefined}
                  >
                    <span className={`inline-block h-3 w-3 rounded-sm border ${
                      isTaken
                        ? "theme-border theme-surface-muted"
                        : checked
                          ? "border-deep-space-blue-500 bg-deep-space-blue-500"
                          : "theme-border"
                    }`}>
                      {checked && !isTaken && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span>{cap}</span>
                    {isExclusive && (
                      <span className={`ml-auto text-[10px] font-normal ${
                        isTaken
                          ? "text-gray-400 dark:text-gray-600"
                          : "text-gray-400 dark:text-gray-500"
                      }`}>
                        {isTaken ? `on "${takenByKey?.name}"` : "exclusive"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedCapabilities.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedCapabilities([])}
                className="theme-border theme-surface mt-2 rounded-lg border px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-400"
              >
                Clear capabilities
              </button>
            )}
          </div>

          {/* Scopes */}
          <div>
            <Label className="block">
              Scopes
            </Label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Leave empty for full access. Select specific scopes to restrict.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const allReads = MCP_RESOURCE_SCOPES.filter((s) => s.endsWith(":read"));
                  const hasAll = allReads.every((s) => selectedScopes.includes(s));
                  setSelectedScopes((prev) =>
                    hasAll
                      ? prev.filter((s) => !s.endsWith(":read"))
                      : Array.from(new Set([...prev, ...allReads]))
                  );
                }}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  MCP_RESOURCE_SCOPES.filter((s) => s.endsWith(":read")).every((s) => selectedScopes.includes(s))
                    ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                    : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                }`}
              >
                All Reads
              </button>
              <button
                type="button"
                onClick={() => {
                  const allWrites = MCP_RESOURCE_SCOPES.filter((s) => s.endsWith(":write"));
                  const hasAll = allWrites.every((s) => selectedScopes.includes(s));
                  setSelectedScopes((prev) =>
                    hasAll
                      ? prev.filter((s) => !s.endsWith(":write"))
                      : Array.from(new Set([...prev, ...allWrites]))
                  );
                }}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  MCP_RESOURCE_SCOPES.filter((s) => s.endsWith(":write")).every((s) => selectedScopes.includes(s))
                    ? "border-vivid-tangerine-500 bg-vivid-tangerine-50 text-vivid-tangerine-700 dark:bg-vivid-tangerine-900/30 dark:text-vivid-tangerine-300"
                    : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                }`}
              >
                All Writes
              </button>
              {selectedScopes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedScopes([])}
                  className="theme-border theme-surface rounded-lg border px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-400"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="theme-border theme-surface-muted mt-2 grid max-h-48 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border p-3">
              {MCP_RESOURCE_SCOPES.map((scope) => {
                const checked = selectedScopes.includes(scope);
                return (
                  <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedScopes((prev) =>
                          checked ? prev.filter((s) => s !== scope) : [...prev, scope]
                        );
                      }}
                      className="theme-border h-3.5 w-3.5 rounded-sm text-deep-space-blue-600 focus:ring-deep-space-blue-500"
                    />
                    <code className="text-xs text-gray-700 dark:text-gray-300">{scope}</code>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/20">
              <p className="text-sm text-red-700 dark:text-red-300">{createError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowCreate(false);
                setKeyName("");
                setExpiration("never");
                setSelectedScopes([]);
                setSelectedCapabilities([]);
                setCreateError(null);
              }}
              className="theme-border theme-surface rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:[background:var(--app-hover)] dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!keyName.trim() || creating}
              className="inline-flex items-center gap-2 rounded-lg bg-deep-space-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-deep-space-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              Create Key
            </button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Reveal API Key Modal (shown once after creation)                    */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!createdKey}
        onClose={() => {
          setCreatedKey(null);
          setCopied(false);
        }}
        title="API Key Created"
      >
        {createdKey && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
              <div className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Make sure to copy your API key now. You won&apos;t be able to see it again!
                </p>
              </div>
            </div>

            <div>
              <Label className="block">
                Your API Key
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="theme-border theme-surface-muted flex-1 break-all rounded-lg border px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">
                  {keyVisible
                    ? createdKey.raw_key
                    : "•".repeat(createdKey.raw_key.length)}
                </code>
                <button
                  onClick={() => setKeyVisible((v) => !v)}
                  className="theme-border theme-surface shrink-0 rounded-lg border p-2 text-gray-500 transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title={keyVisible ? "Hide key" : "Show key"}
                >
                  {keyVisible ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleCopy}
                  className={`shrink-0 rounded-lg border p-2 transition-colors ${
                    copied
                      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
                      : "theme-border theme-surface text-gray-500 hover:[background:var(--app-hover)] hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                  title={copied ? "Copied!" : "Copy to clipboard"}
                >
                  {copied ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setCreatedKey(null);
                  setCopied(false);
                  setKeyVisible(false);
                }}
                className="rounded-lg bg-deep-space-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-deep-space-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
