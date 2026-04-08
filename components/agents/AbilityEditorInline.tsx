"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { updateAbility } from "@/lib/api";
import { useMcpServers, useContextBlocks } from "@/lib/hooks";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { TemplateVariableReference } from "./TemplateVariableReference";
import { useResizablePanel, ResizeHandle } from "./useResizablePanel";
import { Button } from "@/components/ui/Button";
import { MCP_RESOURCE_SCOPES } from "@/lib/types";
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

// ---------------------------------------------------------------------------
// Main inline editor
// ---------------------------------------------------------------------------

interface AbilityEditorInlineProps {
  ability: Ability;
  onSaved: () => void;
  onDelete?: () => void;
}

export function AbilityEditorInline({ ability, onSaved, onDelete }: AbilityEditorInlineProps) {
  const [activeTab, setActiveTab] = useState<TabId>("prompt");
  const [displayName, setDisplayName] = useState(ability.display_name ?? "");
  const [name, setName] = useState(ability.name);
  const [prompt, setPrompt] = useState(ability.prompt);
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
    setDisplayName(ability.display_name ?? "");
    setName(ability.name);
    setPrompt(ability.prompt);
    setActivationCondition(ability.activation_condition);
    setActiveTab("prompt");
    setError(null);
    setSaved(false);
  }, [ability.id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAbility(ability.id, {
        display_name: displayName || undefined,
        activation_condition: activationCondition,
        prompt,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [ability.id, displayName, activationCondition, prompt, onSaved]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const handleInsertVariable = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className="flex h-full flex-col outline-none">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={ability.name}
            className="min-w-0 flex-1 truncate border-0 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <input
            type="text"
            value={name}
            readOnly
            className="w-36 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600 outline-none dark:bg-gray-800 dark:text-gray-300"
          />
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            ability.is_system
              ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
          }`}>
            {ability.is_system ? "System" : "Custom"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-flag-red-500 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
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
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-1.5 dark:border-gray-800">
        <span className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400">Activates when:</span>
        <input
          type="text"
          value={activationCondition}
          onChange={(e) => setActivationCondition(e.target.value)}
          placeholder="When the user asks to..."
          className="min-w-0 flex-1 border-0 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-300 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0 border-b border-gray-200 px-4 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-teal-700 dark:text-teal-300"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
            {tab.id === "mcp" && ability.mcp_server_ids.length > 0 && (
              <span className="ml-1 rounded-full bg-gray-200 px-1 text-[9px] dark:bg-gray-700">{ability.mcp_server_ids.length}</span>
            )}
            {tab.id === "scopes" && ability.platform_scopes.length > 0 && (
              <span className="ml-1 rounded-full bg-gray-200 px-1 text-[9px] dark:bg-gray-700">{ability.platform_scopes.length}</span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />
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
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-1 text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
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

// ---------------------------------------------------------------------------
// Context blocks + template variables reference panel (matches agent editor)
// ---------------------------------------------------------------------------

interface BlockTreeNode {
  name: string;
  dottedPath: string;
  description?: string;
  children: BlockTreeNode[];
}

function buildBlockTree(blocks: { name: string; path: string; description?: string | null; display_name?: string | null }[]): BlockTreeNode[] {
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
    parent.push({ name: b.name, dottedPath: dottedName, description: b.description || b.display_name || undefined, children: [] });
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
          className="flex w-full items-center gap-1.5 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded px-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <svg className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <svg className="h-3.5 w-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{node.name}</span>
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
      className="group flex w-full items-center gap-1.5 py-1 text-left hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20 rounded px-1"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      title={node.description}
    >
      <svg className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400 truncate">{node.name}</code>
      <svg className="ml-auto h-3 w-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}

function TabbedReferencePanel({ onInsertVariable }: { onInsertVariable: (text: string) => void }) {
  const [tab, setTab] = useState<"blocks" | "variables">("blocks");
  const panel = useResizablePanel(320, 240, 560);
  const { contextBlocks } = useContextBlocks();

  const tree = useMemo(() => buildBlockTree(contextBlocks ?? []), [contextBlocks]);

  return (
    <>
      <ResizeHandle onMouseDown={panel.onMouseDown} />
      <div style={{ width: panel.width }} className="flex shrink-0 flex-col overflow-hidden bg-gray-50 dark:bg-gray-800/50">
        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setTab("blocks")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === "blocks"
                ? "border-b-2 border-deep-space-blue-500 text-deep-space-blue-600 dark:text-deep-space-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Blocks
          </button>
          <button
            type="button"
            onClick={() => setTab("variables")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === "variables"
                ? "border-b-2 border-deep-space-blue-500 text-deep-space-blue-600 dark:text-deep-space-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Variables
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-2">
          {tab === "blocks" ? (
            <>
              <p className="mb-2 px-1 text-[10px] text-gray-500 dark:text-gray-400">
                Click a block to insert at cursor.
              </p>
              {tree.length === 0 ? (
                <p className="px-1 text-xs text-gray-400">No context blocks found.</p>
              ) : (
                tree.map((node) => (
                  <BlockTreeNodeView key={node.dottedPath} node={node} depth={0} onInsert={onInsertVariable} />
                ))
              )}
            </>
          ) : (
            <div className="p-2">
              <TemplateVariableReference onInsertVariable={onInsertVariable} flatVarsOnly />
            </div>
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
  const assignedIds = new Set(ability.mcp_server_ids);

  const handleToggle = async (server: McpServer) => {
    if (toggling) return;
    setToggling(server.id);
    try {
      const newIds = assignedIds.has(server.id)
        ? ability.mcp_server_ids.filter((id) => id !== server.id)
        : [...ability.mcp_server_ids, server.id];
      await updateAbility(ability.id, { mcp_server_ids: newIds });
      ability.mcp_server_ids = newIds;
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
          label={server.display_name}
          sublabel={server.description ?? undefined}
          badge={server.transport}
          isOn={assignedIds.has(server.id)}
          isProcessing={toggling === server.id}
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

  return (
    <div className="space-y-1.5">
      {MCP_RESOURCE_SCOPES.map((scope) => (
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
        ? "border-teal-200 bg-teal-50/50 dark:border-teal-800 dark:bg-teal-900/20"
        : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    }`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          disabled={isProcessing}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            isOn ? "bg-teal-500" : "bg-gray-300 dark:bg-gray-600"
          } ${isProcessing ? "opacity-50" : ""}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${isOn ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
            {badge && (
              <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                {badge}
              </span>
            )}
          </div>
          {sublabel && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
      ))}
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>;
}
