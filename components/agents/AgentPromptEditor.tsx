"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { updateAgentPrompt, resetAgentToDefault, applyAllSystemUpdates, updateDomain, setAgentPromptLock } from "@/lib/api";
import { useAgentDomains, useContextBlocks } from "@/lib/hooks";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { TemplateVariableReference, JinjaGuide } from "./TemplateVariableReference";
import { useResizablePanel, ResizeHandle } from "./useResizablePanel";

// ---------------------------------------------------------------------------
// File-tree node for context blocks
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  /** Dotted template var path (e.g. "nenjo.guide.remembrance") */
  dottedPath: string;
  /** If this is a leaf (block), the description */
  description?: string;
  children: TreeNode[];
}

function buildBlockTree(blocks: { name: string; path: string; description?: string | null; display_name?: string | null }[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const b of blocks) {
    const segments = b.path ? b.path.split("/") : [];
    let parent = root;

    // Ensure folder nodes exist
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let folder = parent.find((n) => n.name === seg && n.children.length > 0 && !n.description);
      if (!folder) {
        const dottedFolder = segments.slice(0, i + 1).join(".");
        folder = { name: seg, dottedPath: dottedFolder, children: [] };
        parent.push(folder);
      }
      parent = folder.children;
    }

    // Add the leaf block
    const dottedName = b.path ? `${b.path.replace(/\//g, ".")}.${b.name}` : b.name;
    parent.push({
      name: b.name,
      dottedPath: dottedName,
      description: b.description || b.display_name || undefined,
      children: [],
    });
  }

  return root;
}

function BlockTreeNode({ node, depth, onInsert }: { node: TreeNode; depth: number; onInsert: (text: string) => void }) {
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
          <svg
            className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <svg className="h-3.5 w-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <BlockTreeNode key={child.dottedPath} node={child} depth={depth + 1} onInsert={onInsert} />
            ))}
          </div>
        )}
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
      <svg
        className="ml-auto h-3 w-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}

function TabbedVariablePanel({ onInsertVariable }: { onInsertVariable: (text: string) => void }) {
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
                  <BlockTreeNode key={node.dottedPath} node={node} depth={0} onInsert={onInsertVariable} />
                ))
              )}
            </>
          ) : (
            <div className="p-2">
              <TemplateVariableReference
                onInsertVariable={onInsertVariable}
                flatVarsOnly
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
import { PromptPreviewModal } from "./PromptPreviewModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { agentColorBg } from "@/lib/agent-colors";
import { TagInput } from "@/components/ui/TagInput";
import type { AgentDefinition, MemoryProfile, PromptConfig, AgentDomainAssignment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentPromptEditorProps {
  role: AgentDefinition;
  promptConfig: PromptConfig;
  onClose: () => void;
  onSaved: () => void;
  onChange: (config: PromptConfig) => void;
}

export interface AgentPromptEditorContentProps {
  role: AgentDefinition;
  promptConfig: PromptConfig;
  onSaved: () => void;
  onChange: (config: PromptConfig) => void;
}

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

interface Section {
  id: string;
  label: string;
  group: string;
  hint?: string;
}

const SECTIONS: Section[] = [
  { id: "system_prompt", label: "Soul", group: "Core", hint: "system prompt" },
  { id: "developer_prompt", label: "Guidance", group: "Core", hint: "developer prompt" },
  { id: "memory_profile", label: "Memory Profile", group: "Memory" },
  { id: "chat_task", label: "Chat", group: "Task Templates" },
  { id: "task_task", label: "Task", group: "Task Templates" },
  { id: "gate_eval", label: "Gate", group: "Task Templates" },
  { id: "cron_task", label: "Cron", group: "Task Templates" },
  { id: "heartbeat_task", label: "Heartbeat", group: "Task Templates" },
];

const BASE_GROUPS = Array.from(new Set(SECTIONS.map((s) => s.group)));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MEMORY_PROFILE: MemoryProfile = {
  core_focus: [],
  project_focus: [],
  shared_focus: [],
};

function getMemoryProfile(cfg: PromptConfig): MemoryProfile {
  return { ...DEFAULT_MEMORY_PROFILE, ...cfg.memory_profile };
}

function getSectionValue(id: string, cfg: PromptConfig): string {
  if (id === "system_prompt") return cfg.system_prompt;
  if (id === "developer_prompt") return cfg.developer_prompt ?? "";
  if (["task_task", "chat_task", "gate_eval", "cron_task", "heartbeat_task"].includes(id))
    return cfg.templates?.[id] ?? "";
  return "";
}

function setSectionValue(
  id: string,
  value: string,
  cfg: PromptConfig,
): PromptConfig {
  if (id === "system_prompt") return { ...cfg, system_prompt: value };
  if (id === "developer_prompt") return { ...cfg, developer_prompt: value };
  if (["chat_task", "task_task", "gate_eval", "cron_task", "heartbeat_task"].includes(id))
    return { ...cfg, templates: { ...cfg.templates, [id]: value } };
  return cfg;
}

/** Get current value for a domain section (system_addon or guidelines). */
function getDomainSectionValue(rm: AgentDomainAssignment, field: "system_addon" | "guidelines"): string {
  if (!rm.domain?.manifest?.prompt) return "";
  if (field === "system_addon") return rm.domain.manifest.prompt.system_addon ?? "";
  if (field === "guidelines") return (rm.domain.manifest.prompt.guidelines ?? []).join("\n");
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentPromptEditor({
  role,
  promptConfig,
  onClose,
  onSaved,
  onChange,
}: AgentPromptEditorProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("system_prompt");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockToggling, setLockToggling] = useState(false);
  const editorRef = useRef<CodeTextareaHandle>(null);
  const { agentDomains, mutate: mutateAgentDomains } = useAgentDomains(role.id);

  const isLocked = role.prompt_locked;

  const handleToggleLock = useCallback(async () => {
    setLockToggling(true);
    try {
      await setAgentPromptLock(role.id, !isLocked);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle lock");
    } finally {
      setLockToggling(false);
    }
  }, [role.id, isLocked, onSaved]);

  const handleContextVarClick = useCallback((segment: string, type: "folder" | "block") => {
    if (type === "block") {
      router.push(`/dashboard/agents?tab=context&block=${encodeURIComponent(segment)}`);
    } else {
      router.push("/dashboard/agents?tab=context");
    }
  }, [router]);
  // Local edits to domain manifests (keyed by domain_id:field)
  const [domainEdits, setDomainEdits] = useState<Record<string, string>>({});

  // --- Domain data (needed by handleSave) ------------------------------------

  const enabledDomains = (agentDomains ?? []).filter(
    (rm) => rm.enabled && rm.domain,
  );

  // --- Save ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Save prompt config
      await updateAgentPrompt(role.id, promptConfig);

      // Save any dirty domain edits
      const domainEditEntries = Object.entries(domainEdits);
      if (domainEditEntries.length > 0) {
        const grouped = new Map<string, Record<string, string>>();
        for (const [key, value] of domainEditEntries) {
          const parts = key.split(":");
          const domainId = parts[1];
          const field = parts[2];
          if (!grouped.has(domainId)) grouped.set(domainId, {});
          grouped.get(domainId)![field] = value;
        }
        for (const [domainId, fields] of Array.from(grouped)) {
          const rm = enabledDomains.find((m) => m.domain!.id === domainId);
          if (!rm?.domain) continue;
          const manifest = { ...rm.domain.manifest };
          const prompt = { ...manifest.prompt };
          if ("system_addon" in fields) {
            prompt.system_addon = fields.system_addon;
          }
          if ("guidelines" in fields) {
            prompt.guidelines = fields.guidelines
              .split("\n")
              .filter((l) => l.trim().length > 0);
          }
          manifest.prompt = prompt;
          await updateDomain(domainId, { manifest });
        }
        setDomainEdits({});
        mutateAgentDomains();
      }

      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save prompts");
    } finally {
      setSaving(false);
    }
  }, [role.id, promptConfig, domainEdits, enabledDomains, mutateAgentDomains, onSaved]);

  // Escape to close, Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, handleSave]);

  // --- Reset to Default ----------------------------------------------------

  const isSystemAgent = role.name === "system" && !!role.source_agent_id;

  const executeReset = useCallback(async () => {
    setResetting(true);
    setError(null);
    try {
      if (isSystemAgent) {
        await applyAllSystemUpdates();
      }
      const updated = await resetAgentToDefault(role.id);
      onChange(updated.prompt_config);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset to default");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }, [role.id, isSystemAgent, onChange, onSaved]);

  // --- Download full prompt ------------------------------------------------

  const handleDownload = useCallback(() => {
    const lines: string[] = [];
    const divider = "=".repeat(80);

    lines.push(`Prompt Templates — ${role.name}`);
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(divider);
    lines.push("");

    lines.push("SYSTEM PROMPT");
    lines.push("-".repeat(40));
    lines.push(promptConfig.system_prompt || "(empty)");
    lines.push("");

    if (promptConfig.developer_prompt) {
      lines.push("DEVELOPER PROMPT");
      lines.push("-".repeat(40));
      lines.push(promptConfig.developer_prompt);
      lines.push("");
    }

    lines.push(divider);
    lines.push("");

    const templateEntries = Object.entries(promptConfig.templates || {});
    for (const [key, template] of templateEntries) {
      const label = key.replace(/_/g, " ").toUpperCase();
      lines.push(`TEMPLATE: ${label}`);
      lines.push("-".repeat(40));
      lines.push(template || "(empty)");
      lines.push("");
    }

    if (templateEntries.length > 0) {
      lines.push(divider);
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${role.name.toLowerCase().replace(/\s+/g, "-")}-prompt.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [role.name, promptConfig]);

  const GROUPS = BASE_GROUPS;
  const allSections = SECTIONS;

  // --- Editor value --------------------------------------------------------

  const isDomainSectionActive = activeSection.startsWith("domain:");

  const currentValue = useMemo(() => {
    if (isDomainSectionActive) {
      // Check local edits first
      if (domainEdits[activeSection] !== undefined) return domainEdits[activeSection];
      const parts = activeSection.split(":");
      const domainId = parts[1];
      const field = parts[2] as "system_addon" | "guidelines";
      const rm = enabledDomains.find((m) => m.domain!.id === domainId);
      return rm ? getDomainSectionValue(rm, field) : "";
    }
    return getSectionValue(activeSection, promptConfig);
  }, [activeSection, promptConfig, enabledDomains, domainEdits, isDomainSectionActive]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (isDomainSectionActive) {
        setDomainEdits((prev) => ({ ...prev, [activeSection]: value }));
      } else {
        onChange(setSectionValue(activeSection, value, promptConfig));
      }
    },
    [activeSection, promptConfig, onChange, isDomainSectionActive],
  );

  const handleInsertVariable = useCallback(
    (text: string) => {
      editorRef.current?.insertAtCursor(text);
    },
    [],
  );

  const activeLabel =
    allSections.find((s) => s.id === activeSection)?.label ?? "";

  // --- Render --------------------------------------------------------------

  return (
    <>
      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 flex items-stretch justify-center">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          onClick={onClose}
        />

        {/* Panel */}
        <div
          className="relative z-10 mx-6 my-6 flex w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        >
          {/* -- Header -- */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-700">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: agentColorBg(role.color) }}
              >
                <RoleIdenticon roleId={role.id} color={role.color} size={28} animate roleName={role.name} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                    {role.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      role.source_agent_id
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {role.source_agent_id ? "System" : "Custom"}
                  </span>
                </div>
                {role.description && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {role.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {role.source_agent_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmReset(true)}
                  disabled={resetting}
                >
                  {resetting ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Resetting...
                    </>
                  ) : (
                    <>
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
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
                        />
                      </svg>
                      {isSystemAgent ? "Reset All Defaults" : "Reset to Default"}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreviewOpen(true)}
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
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Preview
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
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
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Download
              </Button>
              <button
                type="button"
                onClick={handleToggleLock}
                disabled={lockToggling}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isLocked
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {isLocked ? (
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                )}
                {isLocked ? "Locked" : "Unlocked"}
              </button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || saved || isLocked}
              >
                {saving ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Saving...
                  </>
                ) : saved ? (
                  <>
                    <svg
                      className="h-4 w-4 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Saved!
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Lock banner */}
          {isLocked && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 dark:border-amber-800 dark:bg-amber-900/20">
              <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span className="text-xs text-amber-700 dark:text-amber-400">Prompt is locked. Unlock to edit.</span>
            </div>
          )}

          {/* -- Body (3-column) -- */}
          <div className="flex flex-1 overflow-hidden">
            {/* -- Left sidebar -- */}
            <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="flex-1 p-3 space-y-4">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <h4 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group}
                      {group === "Task Templates" && (
                        <span className="ml-1 inline-block rounded bg-gray-100 px-1 py-px text-[8px] font-medium normal-case tracking-normal text-gray-500 dark:bg-gray-700 dark:text-gray-400">user msg</span>
                      )}
                    </h4>
                    <div className="space-y-0.5">
                      {allSections.filter((s) => s.group === group).map((s) => {
                        const isActive = s.id === activeSection;
                        const isDomain = s.id.startsWith("domain:");
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(s.id);
                              setCursorLine(1);
                              setCursorCol(1);
                            }}
                            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                              isActive
                                ? isDomain
                                  ? "border-r-2 border-purple-500 bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                  : "border-r-2 border-deep-space-blue-500 bg-deep-space-blue-50 font-medium text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                                : isDomain
                                  ? "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
                            }`}
                          >
                            {isDomain && (
                              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-purple-600 text-[8px] font-bold text-white">
                                /
                              </span>
                            )}
                            <span className="truncate">{s.label}</span>
                            {s.hint && (
                              <span className="ml-auto shrink-0 text-[9px] text-gray-400 dark:text-gray-500">{s.hint}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <JinjaGuide />
            </div>

            {/* -- Center editor -- */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Section title bar */}
              <div className="flex shrink-0 items-center border-b border-gray-200 bg-gray-50/50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/30">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {activeLabel}
                </span>
              </div>

              {/* Editor / Memory Profile */}
              {activeSection === "memory_profile" ? (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Core Focus
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      High-level themes this agent should always remember (e.g. &quot;code-quality&quot;, &quot;security&quot;, &quot;user-experience&quot;).
                    </p>
                    <TagInput
                      value={getMemoryProfile(promptConfig).core_focus}
                      onChange={(tags) =>
                        onChange({
                          ...promptConfig,
                          memory_profile: { ...getMemoryProfile(promptConfig), core_focus: tags },
                        })
                      }
                      placeholder="Add a core focus..."
                      disabled={isLocked}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Project Focus
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Project-specific topics to prioritise in memory retrieval (e.g. &quot;api-design&quot;, &quot;database-schema&quot;, &quot;auth-flow&quot;).
                    </p>
                    <TagInput
                      value={getMemoryProfile(promptConfig).project_focus}
                      onChange={(tags) =>
                        onChange({
                          ...promptConfig,
                          memory_profile: { ...getMemoryProfile(promptConfig), project_focus: tags },
                        })
                      }
                      placeholder="Add a project focus..."
                      disabled={isLocked}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Shared Focus
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Knowledge this agent should store in the shared scope for other agents to reference (e.g. &quot;architecture-decisions&quot;, &quot;api-contracts&quot;, &quot;conventions&quot;).
                    </p>
                    <TagInput
                      value={getMemoryProfile(promptConfig).shared_focus}
                      onChange={(tags) =>
                        onChange({
                          ...promptConfig,
                          memory_profile: { ...getMemoryProfile(promptConfig), shared_focus: tags },
                        })
                      }
                      placeholder="Add a shared focus..."
                      disabled={isLocked}
                    />
                  </div>

                </div>
              ) : (
                <div className="flex-1 overflow-hidden p-3">
                  <CodeTextarea
                    ref={editorRef}
                    value={currentValue ?? ""}
                    onChange={handleEditorChange}
                    readOnly={isLocked}
                    placeholder={
                      activeSection === "system_prompt"
                        ? "You are a senior software engineer specializing in..."
                        : activeSection === "developer_prompt"
                          ? "Detailed methodology and instructions for the agent..."
                          : isDomainSectionActive && activeSection.endsWith(":guidelines")
                            ? "One guideline per line. These are injected into the domain context."
                            : isDomainSectionActive && activeSection.endsWith(":system_addon")
                              ? "Domain-specific instructions. Appended to the core Guidance prompt when active."
                              : "<instructions>Task instructions here...</instructions>"
                    }
                    onCursorChange={(line, col) => {
                      setCursorLine(line);
                      setCursorCol(col);
                    }}
                    onContextVarClick={handleContextVarClick}
                  />
                  {(activeSection === "system_prompt" || activeSection === "developer_prompt") && (
                    <p className="px-1 pt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      {activeSection === "system_prompt"
                        ? "Soul defines the agent\u2019s core identity and principles. Sent as the system prompt."
                        : "Guidance provides detailed methodology and instructions. Sent as the developer prompt."}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* -- Right sidebar -- */}
            {activeSection === "memory_profile" ? (
              <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Memory Profile
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    The memory profile guides what agents remember via the memory_store tool and how memories are prioritised during retrieval.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">Core Focus</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Enduring themes this agent cares about across all projects. These guide what gets extracted as memories.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">Project Focus</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Project-specific topics that boost relevance during memory retrieval. Memories matching these topics rank higher.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">Shared Focus</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Knowledge this agent should store in the shared scope so other agents can reference it.
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">Priority Categories</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Semantic categories for organising memories. Prioritised categories are always retrieved first.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md bg-gray-100 p-3 dark:bg-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      An empty memory profile is valid -- agents will use default memory behaviour.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <TabbedVariablePanel onInsertVariable={handleInsertVariable} />
            )}
          </div>

          {/* -- Status bar -- */}
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-1.5 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
            <div className="flex items-center gap-4">
              <span>{(currentValue ?? "").length.toLocaleString()} chars</span>
              <span>
                Ln {cursorLine}, Col {cursorCol}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {error && (
                <span className="text-red-500 dark:text-red-400">{error}</span>
              )}
              {saving && <span className="text-gray-500">Saving...</span>}
              {saved && (
                <span className="text-emerald-500 dark:text-emerald-400">
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PromptPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        roleId={role.id}
      />

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={executeReset}
        title={isSystemAgent ? "Reset All System Defaults" : "Reset to Default"}
        message={isSystemAgent
          ? "Reset all Nenjo system resources (agents, domains, context blocks, and abilities) to their defaults? Your customizations will be lost."
          : "Reset this agent's prompts to the system default? Your customizations will be lost."}
        confirmLabel={isSystemAgent ? "Reset All" : "Reset"}
        variant="danger"
        loading={resetting}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline content variant (for agent detail page — no overlay/modal)
// ---------------------------------------------------------------------------

export function AgentPromptEditorContent({
  role,
  promptConfig,
  onSaved,
  onChange,
}: AgentPromptEditorContentProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("system_prompt");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockToggling, setLockToggling] = useState(false);
  const editorRef = useRef<CodeTextareaHandle>(null);
  const { agentDomains, mutate: mutateAgentDomains } = useAgentDomains(role.id);

  const isLocked = role.prompt_locked;

  const handleToggleLock = useCallback(async () => {
    setLockToggling(true);
    try {
      await setAgentPromptLock(role.id, !isLocked);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle lock");
    } finally {
      setLockToggling(false);
    }
  }, [role.id, isLocked, onSaved]);

  const handleContextVarClick = useCallback((segment: string, type: "folder" | "block") => {
    if (type === "block") {
      router.push(`/dashboard/agents?tab=context&block=${encodeURIComponent(segment)}`);
    } else {
      router.push("/dashboard/agents?tab=context");
    }
  }, [router]);
  const [domainEdits, setDomainEdits] = useState<Record<string, string>>({});

  const enabledDomains = (agentDomains ?? []).filter(
    (rm) => rm.enabled && rm.domain,
  );

  // --- Save ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAgentPrompt(role.id, promptConfig);

      const domainEditEntries = Object.entries(domainEdits);
      if (domainEditEntries.length > 0) {
        const grouped = new Map<string, Record<string, string>>();
        for (const [key, value] of domainEditEntries) {
          const parts = key.split(":");
          const domainId = parts[1];
          const field = parts[2];
          if (!grouped.has(domainId)) grouped.set(domainId, {});
          grouped.get(domainId)![field] = value;
        }
        for (const [domainId, fields] of Array.from(grouped)) {
          const rm = enabledDomains.find((m) => m.domain!.id === domainId);
          if (!rm?.domain) continue;
          const manifest = { ...rm.domain.manifest };
          const prompt = { ...manifest.prompt };
          if ("system_addon" in fields) prompt.system_addon = fields.system_addon;
          if ("guidelines" in fields) {
            prompt.guidelines = fields.guidelines.split("\n").filter((l) => l.trim().length > 0);
          }
          manifest.prompt = prompt;
          await updateDomain(domainId, { manifest });
        }
        setDomainEdits({});
        mutateAgentDomains();
      }

      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save prompts");
    } finally {
      setSaving(false);
    }
  }, [role.id, promptConfig, domainEdits, enabledDomains, mutateAgentDomains, onSaved]);

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // --- Reset to Default ----------------------------------------------------

  const isSystemAgent = role.name === "system" && !!role.source_agent_id;

  const executeReset = useCallback(async () => {
    setResetting(true);
    setError(null);
    try {
      if (isSystemAgent) {
        await applyAllSystemUpdates();
      }
      const updated = await resetAgentToDefault(role.id);
      onChange(updated.prompt_config);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset to default");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }, [role.id, isSystemAgent, onChange, onSaved]);

  // --- Download full prompt ------------------------------------------------

  const handleDownload = useCallback(() => {
    const lines: string[] = [];
    const divider = "=".repeat(80);
    lines.push(`Prompt Templates — ${role.name}`);
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(divider);
    lines.push("");
    lines.push("SYSTEM PROMPT");
    lines.push("-".repeat(40));
    lines.push(promptConfig.system_prompt || "(empty)");
    lines.push("");
    if (promptConfig.developer_prompt) {
      lines.push("DEVELOPER PROMPT");
      lines.push("-".repeat(40));
      lines.push(promptConfig.developer_prompt);
      lines.push("");
    }
    lines.push(divider);
    lines.push("");
    const templateEntries = Object.entries(promptConfig.templates || {});
    for (const [key, template] of templateEntries) {
      const label = key.replace(/_/g, " ").toUpperCase();
      lines.push(`TEMPLATE: ${label}`);
      lines.push("-".repeat(40));
      lines.push(template || "(empty)");
      lines.push("");
    }
    if (templateEntries.length > 0) {
      lines.push(divider);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${role.name.toLowerCase().replace(/\s+/g, "-")}-prompt.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [role.name, promptConfig]);

  const GROUPS = BASE_GROUPS;
  const allSections = SECTIONS;

  // --- Editor value --------------------------------------------------------

  const isDomainSectionActive = activeSection.startsWith("domain:");

  const currentValue = useMemo(() => {
    if (isDomainSectionActive) {
      if (domainEdits[activeSection] !== undefined) return domainEdits[activeSection];
      const parts = activeSection.split(":");
      const domainId = parts[1];
      const field = parts[2] as "system_addon" | "guidelines";
      const rm = enabledDomains.find((m) => m.domain!.id === domainId);
      return rm ? getDomainSectionValue(rm, field) : "";
    }
    return getSectionValue(activeSection, promptConfig);
  }, [activeSection, promptConfig, enabledDomains, domainEdits, isDomainSectionActive]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (isDomainSectionActive) {
        setDomainEdits((prev) => ({ ...prev, [activeSection]: value }));
      } else {
        onChange(setSectionValue(activeSection, value, promptConfig));
      }
    },
    [activeSection, promptConfig, onChange, isDomainSectionActive],
  );

  const handleInsertVariable = useCallback(
    (text: string) => { editorRef.current?.insertAtCursor(text); },
    [],
  );

  const activeLabel = allSections.find((s) => s.id === activeSection)?.label ?? "";

  // --- Render --------------------------------------------------------------

  return (
    <>
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" style={{ height: "calc(100dvh - 200px)", minHeight: "700px" }}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Prompt Editor
        </span>
        <div className="flex items-center gap-2">
          {role.source_agent_id && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={resetting}>
              {resetting ? "Resetting..." : (isSystemAgent ? "Reset All Defaults" : "Reset to Default")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            Download
          </Button>
          <button
            type="button"
            onClick={handleToggleLock}
            disabled={lockToggling}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              isLocked
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            {isLocked ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            )}
            {isLocked ? "Locked" : "Unlocked"}
          </button>
          <Button size="sm" onClick={handleSave} disabled={saving || saved || isLocked}>
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Lock banner */}
      {isLocked && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 dark:border-amber-800 dark:bg-amber-900/20">
          <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-amber-700 dark:text-amber-400">Prompt is locked. Unlock to edit.</span>
        </div>
      )}

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex-1 p-3 space-y-4">
            {GROUPS.map((group) => (
              <div key={group}>
                <h4 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group}
                  {group === "Task Templates" && (
                    <span className="ml-1 inline-block rounded bg-gray-100 px-1 py-px text-[8px] font-medium normal-case tracking-normal text-gray-500 dark:bg-gray-700 dark:text-gray-400">user msg</span>
                  )}
                </h4>
                <div className="space-y-0.5">
                  {allSections.filter((s) => s.group === group).map((s) => {
                    const isActive = s.id === activeSection;
                    const isDomain = s.id.startsWith("domain:");
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setActiveSection(s.id); setCursorLine(1); setCursorCol(1); }}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          isActive
                            ? isDomain
                              ? "border-r-2 border-purple-500 bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : "border-r-2 border-deep-space-blue-500 bg-deep-space-blue-50 font-medium text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                            : isDomain
                              ? "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                              : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
                        }`}
                      >
                        {isDomain && (
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-purple-600 text-[8px] font-bold text-white">/</span>
                        )}
                        <span className="truncate">{s.label}</span>
                        {s.hint && (
                          <span className="ml-auto shrink-0 text-[9px] text-gray-400 dark:text-gray-500">{s.hint}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <JinjaGuide />
        </div>

        {/* Center editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center border-b border-gray-200 bg-gray-50/50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/30">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{activeLabel}</span>
          </div>

          {activeSection === "memory_profile" ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Core Focus</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">High-level themes this agent should always remember.</p>
                <TagInput value={getMemoryProfile(promptConfig).core_focus} onChange={(tags) => onChange({ ...promptConfig, memory_profile: { ...getMemoryProfile(promptConfig), core_focus: tags } })} placeholder="Add a core focus..." disabled={isLocked} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Focus</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Project-specific topics to prioritise in memory retrieval.</p>
                <TagInput value={getMemoryProfile(promptConfig).project_focus} onChange={(tags) => onChange({ ...promptConfig, memory_profile: { ...getMemoryProfile(promptConfig), project_focus: tags } })} placeholder="Add a project focus..." disabled={isLocked} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shared Focus</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Knowledge to store in shared scope for other agents to reference.</p>
                <TagInput value={getMemoryProfile(promptConfig).shared_focus} onChange={(tags) => onChange({ ...promptConfig, memory_profile: { ...getMemoryProfile(promptConfig), shared_focus: tags } })} placeholder="Add a shared focus..." disabled={isLocked} />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden p-3">
              <CodeTextarea
                ref={editorRef}
                value={currentValue ?? ""}
                onChange={handleEditorChange}
                readOnly={isLocked}
                placeholder={
                  activeSection === "system_prompt" ? "You are a senior software engineer specializing in..."
                    : activeSection === "developer_prompt" ? "Detailed methodology and instructions for the agent..."
                    : isDomainSectionActive && activeSection.endsWith(":guidelines") ? "One guideline per line."
                    : isDomainSectionActive && activeSection.endsWith(":system_addon") ? "Domain-specific instructions."
                    : "<instructions>Task instructions here...</instructions>"
                }
                onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
                onContextVarClick={handleContextVarClick}
              />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        {activeSection === "memory_profile" ? (
          <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Memory Profile</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                The memory profile guides what agents remember and how memories are prioritised during retrieval.
              </p>
              <div className="rounded-md bg-gray-100 p-3 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">An empty memory profile is valid — agents will use default memory behaviour.</p>
              </div>
            </div>
          </div>
        ) : (
          <TabbedVariablePanel onInsertVariable={handleInsertVariable} />
        )}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-1.5 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
        <div className="flex items-center gap-4">
          <span>{(currentValue ?? "").length.toLocaleString()} chars</span>
          <span>Ln {cursorLine}, Col {cursorCol}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
          {saving && <span className="text-gray-500">Saving...</span>}
          {saved && <span className="text-emerald-500 dark:text-emerald-400">Saved</span>}
        </div>
      </div>

    </div>

    <ConfirmDialog
      open={confirmReset}
      onClose={() => setConfirmReset(false)}
      onConfirm={executeReset}
      title={isSystemAgent ? "Reset All System Defaults" : "Reset to Default"}
      message={isSystemAgent
        ? "Reset all Nenjo system resources (agents, domains, context blocks, and abilities) to their defaults? Your customizations will be lost."
        : "Reset this agent's prompts to the system default? Your customizations will be lost."}
      confirmLabel={isSystemAgent ? "Reset All" : "Reset"}
      variant="danger"
      loading={resetting}
    />
    </>
  );
}
