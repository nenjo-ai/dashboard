"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  fetchDomainManifest,
  updateDomain,
  updateDomainManifest,
} from "@/lib/api";
import { useAbilities, useApiKeyCatalog, useMcpServers, useContextBlocks } from "@/lib/hooks";
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
import type { Domain, DomainManifest, Ability, McpServer } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = "prompt" | "scopes" | "abilities" | "mcp";

const TABS: { id: TabId; label: string }[] = [
  { id: "prompt", label: "Prompt" },
  { id: "scopes", label: "Scopes" },
  { id: "abilities", label: "Abilities" },
  { id: "mcp", label: "MCP" },
];

// ---------------------------------------------------------------------------
// Prompt sub-sections
// ---------------------------------------------------------------------------

// Prompt section is just developer_prompt_addon (guidance) — no entry/exit messages.

// ---------------------------------------------------------------------------
// Main inline editor
// ---------------------------------------------------------------------------

interface DomainEditorInlineProps {
  domain: Domain;
  onSaved: () => void;
  onDelete?: () => void;
}

export function DomainEditorInline({
  domain,
  onSaved,
  onDelete,
}: DomainEditorInlineProps) {
  if (domain.read_only || domain.metadata?.install) {
    return <ManagedDomainDetails domain={domain} />;
  }

  return (
    <EditableDomainEditorInline
      domain={domain}
      onSaved={onSaved}
      onDelete={onDelete}
    />
  );
}

function ManagedDomainDetails({ domain }: { domain: Domain }) {
  const [fetchedManifest, setFetchedManifest] = useState<{
    domainId: string;
    manifest: DomainManifest;
  } | null>(null);
  const manifest =
    fetchedManifest?.domainId === domain.id
      ? fetchedManifest.manifest
      : domain.manifest ?? null;

  useEffect(() => {
    let cancelled = false;
    void fetchDomainManifest(domain.id)
      .then((nextManifest) => {
        if (!cancelled) {
          setFetchedManifest({ domainId: domain.id, manifest: nextManifest });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [domain.id, domain.manifest]);

  const prompt = manifest?.prompt?.developer_prompt_addon ?? "";
  const sections = useMemo<SourceManagedDetailSection[]>(
    () => [
      {
        title: "Domain",
        fields: [
          { label: "Name", value: domain.name },
          { label: "Slug", value: domain.slug, mono: true },
          { label: "Command", value: domain.command, mono: true },
          { label: "Path", value: manifestResourceDisplayPath(domain), mono: true },
          { label: "Source type", value: domain.source_type ?? "native" },
        ],
      },
      {
        title: "Prompt",
        code: {
          label: "Developer prompt addon",
          value: prompt || "No developer prompt addon configured.",
          language: "yaml",
        },
      },
      {
        title: "Assignments",
        fields: [
          {
            label: "Platform scopes",
            value: manifest?.platform_scopes?.length
              ? manifest.platform_scopes.join(", ")
              : "None",
            mono: true,
          },
          {
            label: "Abilities",
            value: manifest?.abilities?.length
              ? manifest.abilities.join(", ")
              : "None",
            mono: true,
          },
          {
            label: "MCP servers",
            value: manifest?.mcp_servers?.length
              ? manifest.mcp_servers.join(", ")
              : "None",
            mono: true,
          },
        ],
      },
    ],
    [domain, manifest, prompt],
  );
  const fallbackContent = useMemo(
    () =>
      JSON.stringify(
        {
          name: domain.name,
          slug: domain.slug,
          command: domain.command,
          path: manifestResourceDisplayPath(domain),
          description: domain.description,
          manifest,
          metadata: domain.metadata,
        },
        null,
        2,
      ),
    [domain, manifest],
  );

  return (
    <SourceManagedResourcePanel
      resource={domain}
      title={domain.name}
      description={domain.description}
      fallbackContent={fallbackContent}
      fallbackLanguage="yaml"
      sections={sections}
      showMetadata={false}
    />
  );
}

function EditableDomainEditorInline({
  domain,
  onSaved,
  onDelete,
}: DomainEditorInlineProps) {
  const [activeTab, setActiveTab] = useState<TabId>("prompt");
  const [name, setName] = useState(domain.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const editorRef = useRef<CodeTextareaHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<DomainManifest | null>(
    domain.manifest ?? null,
  );

  // Local editable prompt state
  const [systemAddon, setSystemAddon] = useState(
    domain.manifest?.prompt?.developer_prompt_addon ?? "",
  );

  // Reset when domain changes
  useEffect(() => {
    setName(domain.name);
    setManifest(domain.manifest ?? null);
    setSystemAddon(domain.manifest?.prompt?.developer_prompt_addon ?? "");
    setActiveTab("prompt");
    setError(null);
    setSaved(false);
  }, [domain.id, domain.name, domain.manifest]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextManifest = await fetchDomainManifest(domain.id);
        if (cancelled) return;
        setManifest(nextManifest);
        setSystemAddon(nextManifest.prompt?.developer_prompt_addon ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load domain manifest",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domain.id]);

  const currentValue = systemAddon;

  const handleEditorChange = useCallback((value: string) => {
    setSystemAddon(value);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (name !== domain.name) {
        await updateDomain(domain.id, {
          name: name || undefined,
        });
      }
      const currentManifest = manifest ?? domain.manifest;
      if (!currentManifest) {
        throw new Error("Domain manifest is not loaded yet");
      }
      const nextManifest: DomainManifest = { ...currentManifest };
      nextManifest.prompt = {
        ...nextManifest.prompt,
        developer_prompt_addon: systemAddon,
      };
      const savedManifest = await updateDomainManifest(domain.id, nextManifest);
      setManifest(savedManifest);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    domain.name,
    domain.id,
    domain.manifest,
    manifest,
    onSaved,
    systemAddon,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  const handleInsertVariable = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col outline-none"
    >
      {/* Header */}
      <div className="theme-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={domain.name}
            className="theme-text min-w-0 flex-1 truncate border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-[var(--app-text-muted)] focus:ring-0"
          />
          <input
            type="text"
            value={domain.slug}
            readOnly
            className="theme-surface-muted theme-text-muted w-36 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
          />
          <span className="theme-surface-muted theme-text inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium font-mono">
            {domain.command}
          </span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              domain.is_system
                ? "theme-surface-muted-strong theme-text"
                : "theme-surface-muted theme-text-muted"
            }`}
          >
            {domain.is_system ? "System" : "Custom"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="theme-text-muted rounded p-1 transition-colors hover:bg-red-50 hover:text-flag-red-500 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
              title="Delete domain"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || saved}>
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="theme-border flex shrink-0 items-center gap-0 border-b px-4">
        {TABS.map((tab) => {
          const scopeCount = manifest?.platform_scopes?.length ?? 0;
          const abilityCount = manifest?.abilities?.length ?? 0;
          const mcpCount = manifest?.mcp_servers?.length ?? 0;
          return (
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
              {tab.id === "scopes" && scopeCount > 0 && (
                <span className="theme-surface-muted ml-1 rounded-full px-1 text-[9px]">
                  {scopeCount}
                </span>
              )}
              {tab.id === "abilities" && abilityCount > 0 && (
                <span className="theme-surface-muted ml-1 rounded-full px-1 text-[9px]">
                  {abilityCount}
                </span>
              )}
              {tab.id === "mcp" && mcpCount > 0 && (
                <span className="theme-surface-muted ml-1 rounded-full px-1 text-[9px]">
                  {mcpCount}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="theme-surface-muted-strong absolute bottom-0 left-0 right-0 h-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "prompt" && (
          <>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden p-2">
                <CodeTextarea
                  ref={editorRef}
                  value={currentValue}
                  onChange={handleEditorChange}
                  placeholder="Domain-specific instructions appended to the agent's prompt when this domain is active..."
                  onCursorChange={(line, col) => {
                    setCursorLine(line);
                    setCursorCol(col);
                  }}
                />
              </div>
            </div>
            <TabbedReferencePanel onInsertVariable={handleInsertVariable} />
          </>
        )}
        {activeTab === "scopes" && (
          <div className="flex-1 overflow-y-auto p-4">
            <ScopesTab
              domainId={domain.id}
              manifest={manifest}
              onManifestChange={setManifest}
              onSaved={onSaved}
            />
          </div>
        )}
        {activeTab === "abilities" && (
          <div className="flex-1 overflow-y-auto p-4">
            <AbilitiesTab
              domainId={domain.id}
              manifest={manifest}
              onManifestChange={setManifest}
              onSaved={onSaved}
            />
          </div>
        )}
        {activeTab === "mcp" && (
          <div className="flex-1 overflow-y-auto p-4">
            <McpTab
              domainId={domain.id}
              manifest={manifest}
              onManifestChange={setManifest}
              onSaved={onSaved}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTab === "prompt" && (
        <div className="theme-border theme-text-muted flex shrink-0 items-center justify-between border-t px-4 py-1 text-[10px]">
          <div className="flex items-center gap-3">
            <span>{currentValue.length.toLocaleString()} chars</span>
            <span>
              Ln {cursorLine}, Col {cursorCol}
            </span>
          </div>
          {error && (
            <span className="text-red-500 dark:text-red-400">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context blocks + template variables reference panel (matches ability editor)
// ---------------------------------------------------------------------------

interface BlockTreeNode {
  name: string;
  dottedPath: string;
  description?: string;
  children: BlockTreeNode[];
}

function buildBlockTree(
  blocks: {
    name: string;
    path: string;
    description?: string | null;
  }[],
): BlockTreeNode[] {
  const root: BlockTreeNode[] = [];
  for (const b of blocks) {
    const segments = b.path ? b.path.split("/") : [];
    let parent = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let folder = parent.find(
        (n) => n.name === seg && n.children.length > 0 && !n.description,
      );
      if (!folder) {
        folder = {
          name: seg,
          dottedPath: segments.slice(0, i + 1).join("."),
          children: [],
        };
        parent.push(folder);
      }
      parent = folder.children;
    }
    const dottedName = b.path
      ? `${b.path.replace(/\//g, ".")}.${b.name}`
      : b.name;
    parent.push({
      name: b.name,
      dottedPath: dottedName,
      description: b.description || undefined,
      children: [],
    });
  }
  return root;
}

function BlockTreeNodeView({
  node,
  depth,
  onInsert,
}: {
  node: BlockTreeNode;
  depth: number;
  onInsert: (text: string) => void;
}) {
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
          <svg
            className={`theme-text-muted h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
          <svg
            className="h-3.5 w-3.5 shrink-0 text-yellow-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="theme-text truncate text-xs font-medium">
            {node.name}
          </span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <BlockTreeNodeView
              key={child.dottedPath}
              node={child}
              depth={depth + 1}
              onInsert={onInsert}
            />
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
      <svg
        className="theme-text-muted h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <code className="theme-text truncate text-xs font-mono">{node.name}</code>
      <svg
        className="theme-text-muted ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
    </button>
  );
}

function TabbedReferencePanel({
  onInsertVariable,
}: {
  onInsertVariable: (text: string) => void;
}) {
  const [tab, setTab] = useState<"variables" | "blocks" | "library">("variables");
  const panel = useResizablePanel(320, 240, 560);
  const { contextBlocks } = useContextBlocks();

  const tree = useMemo(
    () => buildBlockTree(contextBlocks ?? []),
    [contextBlocks],
  );

  return (
    <>
      <ResizeHandle onMouseDown={panel.onMouseDown} />
      <div
        style={{ width: panel.width }}
        className="theme-surface-muted flex shrink-0 flex-col overflow-hidden"
      >
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
              <TemplateVariableReference
                onInsertVariable={onInsertVariable}
                flatVarsOnly
              />
            </div>
          ) : tab === "blocks" ? (
            <>
              <p className="theme-text-muted mb-2 px-1 text-[10px]">
                Click a block to insert at cursor.
              </p>
              {tree.length === 0 ? (
                <p className="theme-text-muted px-1 text-xs">
                  No context blocks found.
                </p>
              ) : (
                tree.map((node) => (
                  <BlockTreeNodeView
                    key={node.dottedPath}
                    node={node}
                    depth={0}
                    onInsert={onInsertVariable}
                  />
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
// Helper: update a domain's manifest assignment fields
// ---------------------------------------------------------------------------

async function updateDomainAssignments(
  domainId: string,
  manifest: DomainManifest | null,
  manifestUpdate: Partial<
    Pick<DomainManifest, "platform_scopes" | "abilities" | "mcp_servers">
  >,
  onManifestChange: (manifest: DomainManifest) => void,
  onSaved: () => void,
) {
  if (!manifest) return;
  const savedDomain = await updateDomain(domainId, manifestUpdate);
  const nextManifest = {
    ...manifest,
    platform_scopes:
      savedDomain.manifest?.platform_scopes ??
      manifestUpdate.platform_scopes ??
      manifest.platform_scopes,
    abilities:
      savedDomain.manifest?.abilities ??
      manifestUpdate.abilities ??
      manifest.abilities,
    mcp_servers:
      savedDomain.manifest?.mcp_servers ??
      manifestUpdate.mcp_servers ??
      manifest.mcp_servers,
  };
  onManifestChange(nextManifest);
  onSaved();
}

// ---------------------------------------------------------------------------
// Scopes tab
// ---------------------------------------------------------------------------

function ScopesTab({
  domainId,
  manifest,
  onManifestChange,
  onSaved,
}: {
  domainId: string;
  manifest: DomainManifest | null;
  onManifestChange: (manifest: DomainManifest) => void;
  onSaved: () => void;
}) {
  const { catalog, isLoading, isError } = useApiKeyCatalog();
  const [saving, setSaving] = useState(false);
  const scopes = manifest?.platform_scopes ?? [];
  const scopeSet = new Set(scopes);

  const handleToggle = async (scope: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = scopeSet.has(scope)
        ? scopes.filter((s) => s !== scope)
        : [...scopes, scope];
      await updateDomainAssignments(
        domainId,
        manifest,
        { platform_scopes: next },
        onManifestChange,
        onSaved,
      );
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSkeleton />;
  if (isError) return <EmptyMessage text="Unable to load platform scopes." />;

  return (
    <div className="space-y-1.5">
      {(catalog?.scopes ?? []).map((scope) => (
        <ToggleRow
          key={scope}
          label={scope}
          isOn={scopeSet.has(scope)}
          isProcessing={false}
          onToggle={() => handleToggle(scope)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abilities tab
// ---------------------------------------------------------------------------

function AbilitiesTab({
  domainId,
  manifest,
  onManifestChange,
  onSaved,
}: {
  domainId: string;
  manifest: DomainManifest | null;
  onManifestChange: (manifest: DomainManifest) => void;
  onSaved: () => void;
}) {
  const { abilities } = useAbilities();
  const [saving, setSaving] = useState(false);
  const activeAbilities = new Set(manifest?.abilities ?? []);

  const handleToggle = async (ability: Ability) => {
    if (saving) return;
    setSaving(true);
    try {
      const current = manifest?.abilities ?? [];
      const next = activeAbilities.has(ability.name)
        ? current.filter((name) => name !== ability.name)
        : [...current, ability.name];
      await updateDomainAssignments(
        domainId,
        manifest,
        { abilities: next },
        onManifestChange,
        onSaved,
      );
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  };

  if (!abilities?.length)
    return (
      <EmptyMessage text="No abilities available. Create abilities first." />
    );

  return (
    <div className="space-y-1.5">
      {abilities.map((ability) => (
        <ToggleRow
          key={ability.id}
          label={ability.name}
          sublabel={ability.activation_condition || undefined}
          isOn={activeAbilities.has(ability.name)}
          isProcessing={saving}
          onToggle={() => handleToggle(ability)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCP tab
// ---------------------------------------------------------------------------

function McpTab({
  domainId,
  manifest,
  onManifestChange,
  onSaved,
}: {
  domainId: string;
  manifest: DomainManifest | null;
  onManifestChange: (manifest: DomainManifest) => void;
  onSaved: () => void;
}) {
  const { mcpServers, isLoading } = useMcpServers();
  const [saving, setSaving] = useState(false);
  const activeMcp = new Set(manifest?.mcp_servers ?? []);

  const externalServers =
    mcpServers?.filter((s: McpServer) => !s.is_system) ?? [];

  const handleToggle = async (server: McpServer) => {
    if (saving) return;
    setSaving(true);
    try {
      const current = manifest?.mcp_servers ?? [];
      const next = activeMcp.has(server.name)
        ? current.filter((slug) => slug !== server.name)
        : [...current, server.name];
      await updateDomainAssignments(
        domainId,
        manifest,
        { mcp_servers: next },
        onManifestChange,
        onSaved,
      );
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSkeleton />;
  if (!externalServers.length)
    return <EmptyMessage text="No external MCP servers available." />;

  return (
    <div className="space-y-1.5">
      {externalServers.map((server) => (
        <ToggleRow
          key={server.id}
          label={server.name}
          sublabel={server.description ?? undefined}
          badge={server.transport}
          isOn={activeMcp.has(server.name)}
          isProcessing={saving}
          onToggle={() => handleToggle(server)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  sublabel,
  badge,
  isOn,
  isProcessing,
  onToggle,
}: {
  label: string;
  sublabel?: string;
  badge?: string;
  isOn: boolean;
  isProcessing: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
        isOn
          ? "theme-border theme-surface-muted-strong"
          : "theme-border theme-surface-muted"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          disabled={isProcessing}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            isOn ? "theme-text" : "theme-surface-muted-strong"
          } ${isProcessing ? "opacity-50" : ""}`}
        >
          <span
            className={`theme-surface-elevated absolute top-0.5 h-4 w-4 rounded-full shadow-xs transition-transform ${isOn ? "left-[18px]" : "left-0.5"}`}
          />
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
          {sublabel && (
            <p className="theme-text-muted line-clamp-1 text-xs">{sublabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="theme-surface-muted h-12 animate-pulse rounded-lg"
        />
      ))}
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="theme-text-muted text-sm">{text}</p>;
}
