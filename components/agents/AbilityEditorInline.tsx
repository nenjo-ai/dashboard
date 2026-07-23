"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { fetchAbilityPrompt, updateAbility, updateAbilityPrompt } from "@/lib/api";
import { useApiKeyCatalog, useMcpServers, useContextBlocks } from "@/lib/hooks";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { TemplateVariableReference } from "./TemplateVariableReference";
import { LibraryReferenceList } from "./LibraryReferenceList";
import { useResizablePanel, ResizeHandle } from "./useResizablePanel";
import { Button } from "@/components/ui/Button";
import {
  SourceManagedResourcePanel,
  type SourceManagedDetailSection,
} from "@/components/resources/SourceManagedResourcePanel";
import { manifestResourceDisplayPath } from "@/lib/manifestResourcePath";
import type { Ability, McpServer } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "prompt" | "mcp" | "scopes";

const TABS: { id: TabId; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "scopes", label: "Scopes" },
  { id: "mcp", label: "MCP" },
];

function isManagedSkillAbility(ability: Ability): boolean {
  return ability.source_type === "skill" || ability.read_only;
}

function metadataString(metadata: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function abilitySlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Main inline editor
// ---------------------------------------------------------------------------

interface AbilityEditorInlineProps {
  ability: Ability;
  onSaved: () => void;
  onDelete?: () => void;
}

export function AbilityEditorInline({ ability, onSaved, onDelete }: AbilityEditorInlineProps) {
  const isManaged = isManagedSkillAbility(ability);
  const [activeTab, setActiveTab] = useState<TabId>("prompt");
  const [name, setName] = useState(ability.name);
  const [prompt, setPrompt] = useState(ability.prompt ?? "");
  const [activationCondition, setActivationCondition] = useState(ability.activation_condition);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const editorRef = useRef<CodeTextareaHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset when ability changes
  useEffect(() => {
    setName(ability.name);
    setPrompt(ability.prompt ?? "");
    setActivationCondition(ability.activation_condition);
    setActiveTab("prompt");
    setError(null);
    setSaved(false);
  }, [ability.id, ability.name, ability.prompt, ability.activation_condition]);

  useEffect(() => {
    if (isManaged) return;
    let cancelled = false;
    fetchAbilityPrompt(ability.id)
      .then((value) => {
        if (!cancelled) setPrompt(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ability.id, isManaged]);

  const handleSave = useCallback(async () => {
    if (isManaged) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAbility(ability.id, {
        name: abilitySlug(name),
        activation_condition: activationCondition,
      });
      await updateAbilityPrompt(ability.id, prompt);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [ability.id, name, activationCondition, prompt, onSaved, isManaged]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isManaged) return;
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave, isManaged]);

  const handleInsertVariable = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  if (isManaged) {
    return <ManagedAbilityDetails ability={ability} />;
  }

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className="flex h-full flex-col outline-none">
      {/* Header */}
      <div className="theme-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(abilitySlug(e.target.value))}
            placeholder="ability_slug"
            className="theme-text min-w-0 flex-1 truncate border-0 bg-transparent font-mono text-sm font-semibold outline-none placeholder:text-[var(--app-text-muted)] focus:ring-0"
          />
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            ability.is_system
              ? "theme-surface-muted-strong theme-text"
              : "theme-surface-muted theme-text-muted"
          }`}>
            {ability.is_system ? "System" : "Custom"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="theme-text-muted rounded p-1 transition-colors hover:bg-red-50 hover:text-flag-red-500 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
              title="Delete ability"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || saved}>
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Activation condition (always visible) */}
      <div className="theme-border flex shrink-0 items-center gap-2 border-b px-4 py-1.5">
        <span className="theme-text-muted shrink-0 text-[10px]">Activates when:</span>
        <input
          type="text"
          value={activationCondition}
          onChange={(e) => setActivationCondition(e.target.value)}
          placeholder="When the user asks to..."
          className="theme-text min-w-0 flex-1 border-0 bg-transparent text-xs outline-none placeholder:text-[var(--app-text-muted)] focus:ring-0"
        />
      </div>

      {/* Tab bar */}
      <div className="theme-border flex shrink-0 items-center gap-0 border-b px-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                ? "theme-text"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            {tab.label}
            {tab.id === "mcp" && ability.mcp_servers.length > 0 && (
              <span className="theme-surface-muted ml-1 rounded-full px-1 text-[9px]">{ability.mcp_servers.length}</span>
            )}
            {tab.id === "scopes" && ability.platform_scopes.length > 0 && (
              <span className="theme-surface-muted ml-1 rounded-full px-1 text-[9px]">{ability.platform_scopes.length}</span>
            )}
            {activeTab === tab.id && (
              <div className="theme-surface-muted-strong absolute bottom-0 left-0 right-0 h-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "prompt" && (
          <>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden p-2">
                <CodeTextarea
                  ref={editorRef}
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Instructions for this ability. Appended to the caller's prompt during the sub-loop..."
                  onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
                />
              </div>
            </div>
            <TabbedReferencePanel onInsertVariable={handleInsertVariable} />
          </>
        )}
        {activeTab === "mcp" && (
          <div className="flex-1 overflow-y-auto p-4">
            <McpTab ability={ability} onSaved={onSaved} />
          </div>
        )}
        {activeTab === "scopes" && (
          <div className="flex-1 overflow-y-auto p-4">
            <ScopesTab ability={ability} onSaved={onSaved} />
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTab === "prompt" && (
        <div className="theme-border theme-text-muted flex shrink-0 items-center justify-between border-t px-4 py-1 text-[10px]">
          <div className="flex items-center gap-3">
            <span>{prompt.length.toLocaleString()} chars</span>
            <span>Ln {cursorLine}, Col {cursorCol}</span>
          </div>
          {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}

function ManagedAbilityDetails({ ability }: { ability: Ability }) {
  const { mcpServers, isLoading } = useMcpServers();
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    abilityId: string;
    value: string;
  } | null>(null);
  const prompt =
    fetchedPrompt?.abilityId === ability.id
      ? fetchedPrompt.value
      : ability.prompt ?? "";

  useEffect(() => {
    let cancelled = false;
    fetchAbilityPrompt(ability.id)
      .then((value) => {
        if (!cancelled) setFetchedPrompt({ abilityId: ability.id, value });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ability.id]);

  const attachedServers = useMemo(() => {
    const assigned = new Set(ability.mcp_servers);
    return (mcpServers ?? []).filter((server) => assigned.has(server.name));
  }, [ability.mcp_servers, mcpServers]);
  const fallbackContent = useMemo(
    () =>
      JSON.stringify(
        {
          name: ability.name,
          path: manifestResourceDisplayPath(ability),
          description: ability.description,
          activation_condition: ability.activation_condition,
          prompt_config: { developer_prompt: prompt },
          platform_scopes: ability.platform_scopes,
          mcp_servers: ability.mcp_servers,
          metadata: ability.metadata,
        },
        null,
        2,
      ),
    [ability, prompt],
  );
  const sections = useMemo<SourceManagedDetailSection[]>(
    () => [
      {
        title: "Ability",
        fields: [
          { label: "Name", value: ability.name, mono: true },
          { label: "Path", value: manifestResourceDisplayPath(ability), mono: true },
          { label: "Activation", value: ability.activation_condition },
          { label: "Source type", value: ability.source_type },
        ],
      },
      {
        title: "Prompt",
        code: {
          label: "Developer prompt",
          value: prompt || "No developer prompt configured.",
          language: "yaml",
        },
      },
      {
        title: "Assignments",
        fields: [
          {
            label: "Platform scopes",
            value: ability.platform_scopes.length
              ? ability.platform_scopes.join(", ")
              : "None",
            mono: true,
          },
          {
            label: "MCP servers",
            value: ability.mcp_servers.length
              ? ability.mcp_servers.join(", ")
              : "None",
            mono: true,
          },
        ],
      },
    ],
    [ability, prompt],
  );

  if (ability.read_only && ability.source_type !== "skill") {
    return (
      <SourceManagedResourcePanel
        resource={ability}
        title={ability.name}
        description={ability.description}
        fallbackContent={fallbackContent}
        fallbackLanguage="yaml"
        sections={sections}
        showMetadata={false}
      />
    );
  }
  const selector =
    metadataString(ability.metadata, ["install", "selector"]) ??
    metadataString(ability.metadata, ["selector"]);
  const sourceRepo =
    metadataString(ability.metadata, ["source", "repo"]) ??
    metadataString(ability.metadata, ["install", "repo"]);
  const sourceOwner =
    metadataString(ability.metadata, ["source", "owner"]) ??
    metadataString(ability.metadata, ["install", "owner"]);
  const sourceRef =
    metadataString(ability.metadata, ["version", "requested_ref"]) ??
    metadataString(ability.metadata, ["version", "ref"]) ??
    metadataString(ability.metadata, ["source", "ref"]);
  const sourceLabel = sourceOwner && sourceRepo ? `${sourceOwner}/${sourceRepo}` : sourceRepo;

  return (
    <div className="flex h-full flex-col outline-none">
      <div className="theme-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="theme-text truncate text-sm font-semibold">
              {ability.name}
            </h2>
            <span className="theme-surface-muted-strong theme-text shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              {ability.source_type === "skill" ? "Skill" : "Read-only"}
            </span>
            {ability.is_system && (
              <span className="theme-surface-muted theme-text-muted shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                System
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <code className="theme-surface-muted theme-text-muted rounded px-1.5 py-0.5 text-xs">
              {ability.name}
            </code>
            {selector && (
              <code className="theme-text-muted truncate text-xs">
                {selector}
              </code>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl space-y-4">
          {ability.description && (
            <section>
              <h3 className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Description</h3>
              <p className="theme-text text-sm">{ability.description}</p>
            </section>
          )}

          <section>
            <h3 className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Activation</h3>
            <p className="theme-surface-muted theme-text rounded-md px-3 py-2 text-sm">
              {ability.activation_condition || "No activation condition configured."}
            </p>
          </section>

          <section>
            <h3 className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Source</h3>
            <div className="theme-border theme-surface-muted grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
              <ReadOnlyField label="Type" value={ability.source_type === "skill" ? "Skill" : "Managed ability"} />
              <ReadOnlyField label="Repository" value={sourceLabel ?? "Unknown"} />
              <ReadOnlyField label="Ref" value={sourceRef ?? "Pinned by marketplace"} />
              <ReadOnlyField label="Selector" value={selector ?? "Not set"} />
            </div>
          </section>

          <section>
            <h3 className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Attached MCP</h3>
            {isLoading ? (
              <LoadingSkeleton />
            ) : attachedServers.length > 0 ? (
              <div className="space-y-1.5">
                {attachedServers.map((server) => (
                  <div key={server.id} className="theme-border theme-surface-muted flex items-center justify-between rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="theme-text truncate text-sm font-medium">{server.name}</p>
                      {server.description && <p className="theme-text-muted truncate text-xs">{server.description}</p>}
                    </div>
                    <span className="theme-surface-muted-strong theme-text-muted ml-3 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                      {server.transport}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMessage text="No MCP servers attached." />
            )}
          </section>

          <section>
            <h3 className="theme-text-muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Platform Scopes</h3>
            {ability.platform_scopes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {ability.platform_scopes.map((scope) => (
                  <code key={scope} className="theme-surface-muted theme-text-muted rounded px-1.5 py-0.5 text-xs">
                    {scope}
                  </code>
                ))}
              </div>
            ) : (
              <EmptyMessage text="No platform scopes assigned." />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="theme-text-muted text-[10px] font-semibold uppercase tracking-wider">{label}</div>
      <div className="theme-text mt-0.5 truncate text-xs">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context blocks + template variables reference panel (matches agent editor)
// ---------------------------------------------------------------------------

interface BlockTreeNode {
  name: string;
  dottedPath: string;
  description?: string;
  children: BlockTreeNode[];
}

function buildBlockTree(blocks: { name: string; path: string; description?: string | null }[]): BlockTreeNode[] {
  const root: BlockTreeNode[] = [];
  for (const b of blocks) {
    const segments = b.path ? b.path.split("/") : [];
    let parent = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let folder = parent.find((n) => n.name === seg && n.children.length > 0 && !n.description);
      if (!folder) {
        folder = { name: seg, dottedPath: segments.slice(0, i + 1).join("."), children: [] };
        parent.push(folder);
      }
      parent = folder.children;
    }
    const dottedName = b.path ? `${b.path.replace(/\//g, ".")}.${b.name}` : b.name;
    parent.push({ name: b.name, dottedPath: dottedName, description: b.description || undefined, children: [] });
  }
  return root;
}

function BlockTreeNodeView({ node, depth, onInsert }: { node: BlockTreeNode; depth: number; onInsert: (text: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isFolder = node.children.length > 0 && !node.description;
  const token = `{{ ${node.dottedPath} }}`;

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:[background:var(--app-hover)]"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <svg className={`theme-text-muted h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <svg className="h-3.5 w-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="theme-text truncate text-xs font-medium">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <BlockTreeNodeView key={child.dottedPath} node={child} depth={depth + 1} onInsert={onInsert} />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onInsert(token)}
      className="group flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:[background:var(--app-hover)]"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      title={node.description}
    >
      <svg className="theme-text-muted h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <code className="theme-text truncate text-xs font-mono">{node.name}</code>
      <svg className="theme-text-muted ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}

function TabbedReferencePanel({ onInsertVariable }: { onInsertVariable: (text: string) => void }) {
  const [tab, setTab] = useState<"variables" | "blocks" | "library">("variables");
  const panel = useResizablePanel(320, 240, 560);
  const { contextBlocks } = useContextBlocks();

  const tree = useMemo(() => buildBlockTree(contextBlocks ?? []), [contextBlocks]);

  return (
    <>
      <ResizeHandle onMouseDown={panel.onMouseDown} />
      <div style={{ width: panel.width }} className="theme-surface-muted flex shrink-0 flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="theme-border flex shrink-0 border-b">
          <button
            type="button"
            onClick={() => setTab("variables")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === "variables"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Vars
          </button>
          <button
            type="button"
            onClick={() => setTab("blocks")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === "blocks"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Context Blocks
          </button>
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === "library"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Library
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-2">
          {tab === "variables" ? (
            <div className="p-2">
              <TemplateVariableReference onInsertVariable={onInsertVariable} flatVarsOnly />
            </div>
          ) : tab === "blocks" ? (
            <>
              <p className="theme-text-muted mb-2 px-1 text-[10px]">
                Click a block to insert at cursor.
              </p>
              {tree.length === 0 ? (
                <p className="theme-text-muted px-1 text-xs">No context blocks found.</p>
              ) : (
                tree.map((node) => (
                  <BlockTreeNodeView key={node.dottedPath} node={node} depth={0} onInsert={onInsertVariable} />
                ))
              )}
            </>
          ) : (
            <LibraryReferenceList onInsertVariable={onInsertVariable} />
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// MCP tab
// ---------------------------------------------------------------------------

function McpTab({ ability, onSaved }: { ability: Ability; onSaved: () => void }) {
  const { mcpServers, isLoading } = useMcpServers();
  const [toggling, setToggling] = useState<string | null>(null);
  const assignedIds = new Set(ability.mcp_servers);

  const handleToggle = async (server: McpServer) => {
    if (toggling) return;
    setToggling(server.name);
    try {
      const newSlugs = assignedIds.has(server.name)
        ? ability.mcp_servers.filter((slug) => slug !== server.name)
        : [...ability.mcp_servers, server.name];
      await updateAbility(ability.id, { mcp_servers: newSlugs });
      ability.mcp_servers = newSlugs;
      onSaved();
    } catch { /* */ } finally { setToggling(null); }
  };

  // Filter out the nenjo platform MCP — its tools are assigned via scopes, not direct MCP assignment
  const externalServers = mcpServers?.filter((s) => !s.is_system) ?? [];

  if (isLoading) return <LoadingSkeleton />;
  if (!externalServers.length) return <EmptyMessage text="No external MCP servers available." />;

  return (
    <div className="space-y-1.5">
      {externalServers.map((server) => (
        <ToggleRow
          key={server.id}
          label={server.name}
          sublabel={server.description ?? undefined}
          badge={server.transport}
          isOn={assignedIds.has(server.name)}
          isProcessing={toggling === server.name}
          onToggle={() => handleToggle(server)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scopes tab
// ---------------------------------------------------------------------------

function ScopesTab({ ability, onSaved }: { ability: Ability; onSaved: () => void }) {
  const { catalog, isLoading, isError } = useApiKeyCatalog();
  const [saving, setSaving] = useState(false);
  const assignedScopes = new Set(ability.platform_scopes);

  const handleToggle = async (scope: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const newScopes = assignedScopes.has(scope)
        ? ability.platform_scopes.filter((s) => s !== scope)
        : [...ability.platform_scopes, scope];
      await updateAbility(ability.id, { platform_scopes: newScopes });
      ability.platform_scopes = newScopes;
      onSaved();
    } catch { /* */ } finally { setSaving(false); }
  };

  if (isLoading) return <LoadingSkeleton />;
  if (isError) return <EmptyMessage text="Unable to load platform scopes." />;

  return (
    <div className="space-y-1.5">
      {(catalog?.scopes ?? []).map((scope) => (
        <ToggleRow
          key={scope}
          label={scope}
          isOn={assignedScopes.has(scope)}
          isProcessing={false}
          onToggle={() => handleToggle(scope)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function ToggleRow({ label, sublabel, badge, isOn, isProcessing, onToggle }: {
  label: string;
  sublabel?: string;
  badge?: string;
  isOn: boolean;
  isProcessing: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
      isOn
        ? "theme-border theme-surface-muted-strong"
        : "theme-border theme-surface-muted"
    }`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          disabled={isProcessing}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            isOn ? "theme-text" : "theme-surface-muted-strong"
          } ${isProcessing ? "opacity-50" : ""}`}
        >
          <span className={`theme-surface-elevated absolute top-0.5 h-4 w-4 rounded-full shadow-xs transition-transform ${isOn ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="theme-text text-sm font-medium">{label}</span>
            {badge && (
              <span className="theme-surface-muted theme-text-muted inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium">
                {badge}
              </span>
            )}
          </div>
          {sublabel && <p className="theme-text-muted line-clamp-1 text-xs">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="theme-surface-muted h-12 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="theme-text-muted text-sm">{text}</p>;
}
