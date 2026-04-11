"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { previewAgentPrompt } from "@/lib/api";
import { useProjects } from "@/lib/hooks";
import type { PreviewPromptResponse, PreviewDomain, PreviewAbility } from "@/lib/types";
import {
  templateHighlighter,
  editorTheme,
  editorThemeDark,
} from "./CodeTextarea";

// ---------------------------------------------------------------------------
// Read-only CodeMirror viewer
// ---------------------------------------------------------------------------

function PromptViewer({ value }: { value: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    setIsDark(html.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(html.classList.contains("dark"));
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const extensions = useMemo(
    () => [
      templateHighlighter,
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
    ],
    [],
  );

  if (!value) return null;

  return (
    <div className="h-full w-full [&>div]:h-full [&_.cm-editor]:h-full [&_.cm-gutters]:hidden">
      <CodeMirror
        value={value}
        extensions={extensions}
        theme={isDark ? editorThemeDark : editorTheme}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
          highlightSelectionMatches: false,
          searchKeymap: true,
          indentOnInput: false,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PromptPreviewModalProps {
  open: boolean;
  onClose: () => void;
  roleId: string;
}

const TASK_TYPES = [
  { id: "task_task", label: "Task" },
  { id: "gate_eval", label: "Gate" },
  { id: "cron_task", label: "Cron" },
  { id: "heartbeat_task", label: "Heartbeat" },
];

const PROMPT_TABS = [
  { id: "system", label: "System" },
  { id: "developer", label: "Developer" },
  { id: "user", label: "User Message" },
] as const;

type PromptTab = (typeof PROMPT_TABS)[number]["id"];

export function PromptPreviewModal({
  open,
  onClose,
  roleId,
}: PromptPreviewModalProps) {
  const [selectedTaskType, setSelectedTaskType] = useState("task_task");
  const [activeTab, setActiveTab] = useState<PromptTab>("system");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache: projectId|"none" → PreviewPromptResponse
  const cache = useRef<Map<string, PreviewPromptResponse>>(new Map());
  const [preview, setPreview] = useState<PreviewPromptResponse | null>(null);

  // Projects list (SWR-cached, no extra call if already loaded elsewhere)
  const { projects } = useProjects();

  const cacheKey = (pid: string | null) => pid ?? "none";

  const loadPreview = useCallback(
    async (projectId: string | null, forceRefresh = false) => {
      const key = cacheKey(projectId);

      // Use cache if available and not forcing refresh
      if (!forceRefresh && cache.current.has(key)) {
        setPreview(cache.current.get(key)!);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await previewAgentPrompt(roleId, projectId ?? undefined);
        cache.current.set(key, result);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate preview");
      } finally {
        setLoading(false);
      }
    },
    [roleId],
  );

  // Auto-load on open
  useEffect(() => {
    if (open) {
      loadPreview(selectedProjectId);
    }
  }, [open, selectedProjectId, loadPreview]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setSelectedDomainId(null);
      setSelectedAbilityId(null);
      setSelectedProjectId(null);
      cache.current.clear();
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleRefresh = useCallback(() => {
    cache.current.clear();
    loadPreview(selectedProjectId, true);
  }, [selectedProjectId, loadPreview]);

  if (!open) return null;

  // Build the displayed developer prompt: base + optional domain addon
  const selectedDomain = preview?.domains.find((d) => d.id === selectedDomainId) ?? null;
  const developerPrompt = preview
    ? selectedDomain && selectedDomain.rendered_addon
      ? `${preview.developer_prompt}\n\n${selectedDomain.rendered_addon}`
      : preview.developer_prompt
    : "";

  const promptContent = preview
    ? {
        system: preview.system_prompt,
        developer: developerPrompt,
        user: preview.user_messages[selectedTaskType] ?? "",
      }
    : null;

  const selectedAbility = preview?.abilities.find((a) => a.id === selectedAbilityId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 mx-6 my-6 flex w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Prompt Preview
            </h2>
            {/* Task Type Selector */}
            <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
              {TASK_TYPES.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskType(task.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    selectedTaskType === task.id
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  {task.label}
                </button>
              ))}
            </div>
            {loading && (
              <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="Refresh preview"
            >
              <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Body — 2-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel — Project, Domains, Abilities */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30">
            <div className="p-4 space-y-6">
              {/* Project Selector */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Project
                </h3>
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => setSelectedProjectId(e.target.value || null)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  <option value="">No project</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Domains */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Domains
                </h3>
                {(!preview?.domains || preview.domains.length === 0) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No domains assigned</p>
                )}
                <div className="space-y-1">
                  {preview?.domains.map((domain) => (
                    <DomainItem
                      key={domain.id}
                      domain={domain}
                      isSelected={selectedDomainId === domain.id}
                      onToggle={() =>
                        setSelectedDomainId(selectedDomainId === domain.id ? null : domain.id)
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Abilities */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Abilities
                </h3>
                {(!preview?.abilities || preview.abilities.length === 0) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No abilities assigned</p>
                )}
                <div className="space-y-1">
                  {preview?.abilities.map((ability) => (
                    <AbilityItem
                      key={ability.id}
                      ability={ability}
                      isSelected={selectedAbilityId === ability.id}
                      onToggle={() =>
                        setSelectedAbilityId(selectedAbilityId === ability.id ? null : ability.id)
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel — Prompt Tabs */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 px-6 dark:border-gray-700">
              {PROMPT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSelectedAbilityId(null); }}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.id && !selectedAbilityId
                      ? "border-deep-space-blue-500 text-deep-space-blue-600 dark:border-deep-space-blue-400 dark:text-deep-space-blue-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {/* Ability tab (appears when an ability is selected) */}
              {selectedAbility && (
                <div className="flex items-center border-b-2 border-deep-space-blue-500 px-4 py-3">
                  <span className="text-sm font-medium text-deep-space-blue-600 dark:text-deep-space-blue-400">
                    Ability: {selectedAbility.display_name}
                  </span>
                  <button
                    onClick={() => setSelectedAbilityId(null)}
                    className="ml-2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {!preview && !loading && (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Loading preview...
                </div>
              )}
              {/* Ability prompt view */}
              {selectedAbility && (
                <PromptViewer value={selectedAbility.rendered_prompt} />
              )}
              {/* Normal prompt tab view */}
              {promptContent && !selectedAbilityId && (
                <>
                  {promptContent[activeTab] ? (
                    <PromptViewer value={promptContent[activeTab]} />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                      This section is empty for the selected configuration.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain item
// ---------------------------------------------------------------------------

function DomainItem({
  domain,
  isSelected,
  onToggle,
}: {
  domain: PreviewDomain;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
        isSelected
          ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
      }`}
    >
      <span className="font-mono text-gray-400">{domain.command}</span>
      <span className="font-medium">{domain.display_name}</span>
      {isSelected && (
        <span className="ml-auto text-[10px] font-medium uppercase text-deep-space-blue-500 dark:text-deep-space-blue-400">
          Active
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ability item
// ---------------------------------------------------------------------------

function AbilityItem({
  ability,
  isSelected,
  onToggle,
}: {
  ability: PreviewAbility;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
        isSelected
          ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
      }`}
    >
      <span className="font-medium">{ability.display_name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline content variant (for agent detail page — no modal)
// ---------------------------------------------------------------------------

export function PromptPreviewContent({ roleId }: { roleId: string }) {
  const [selectedTaskType, setSelectedTaskType] = useState("task_task");
  const [activeTab, setActiveTab] = useState<PromptTab>("system");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cache = useRef<Map<string, PreviewPromptResponse>>(new Map());
  const [preview, setPreview] = useState<PreviewPromptResponse | null>(null);
  const { projects } = useProjects();

  const cacheKey = (pid: string | null) => pid ?? "none";

  const loadPreview = useCallback(
    async (projectId: string | null, forceRefresh = false) => {
      const key = cacheKey(projectId);
      if (!forceRefresh && cache.current.has(key)) {
        setPreview(cache.current.get(key)!);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await previewAgentPrompt(roleId, projectId ?? undefined);
        cache.current.set(key, result);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate preview");
      } finally {
        setLoading(false);
      }
    },
    [roleId],
  );

  // Auto-load on mount and when project changes
  useEffect(() => {
    loadPreview(selectedProjectId);
  }, [selectedProjectId, loadPreview]);

  const handleRefresh = useCallback(() => {
    cache.current.clear();
    loadPreview(selectedProjectId, true);
  }, [selectedProjectId, loadPreview]);

  const selectedDomain = preview?.domains.find((d) => d.id === selectedDomainId) ?? null;
  const developerPrompt = preview
    ? selectedDomain && selectedDomain.rendered_addon
      ? `${preview.developer_prompt}\n\n${selectedDomain.rendered_addon}`
      : preview.developer_prompt
    : "";

  const promptContent = preview
    ? {
        system: preview.system_prompt,
        developer: developerPrompt,
        user: preview.user_messages[selectedTaskType] ?? "",
      }
    : null;

  const selectedAbility = preview?.abilities.find((a) => a.id === selectedAbilityId) ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Prompt Preview
          </span>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
            {TASK_TYPES.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTaskType(task.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  selectedTaskType === task.id
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                {task.label}
              </button>
            ))}
          </div>
          {loading && (
            <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="Refresh preview"
        >
          <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Body — 2-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30">
          <div className="p-4 space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Project</h3>
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="">No project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Domains</h3>
              {(!preview?.domains || preview.domains.length === 0) && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No domains assigned</p>
              )}
              <div className="space-y-1">
                {preview?.domains.map((domain) => (
                  <DomainItem key={domain.id} domain={domain} isSelected={selectedDomainId === domain.id} onToggle={() => setSelectedDomainId(selectedDomainId === domain.id ? null : domain.id)} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Abilities</h3>
              {(!preview?.abilities || preview.abilities.length === 0) && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No abilities assigned</p>
              )}
              <div className="space-y-1">
                {preview?.abilities.map((ability) => (
                  <AbilityItem key={ability.id} ability={ability} isSelected={selectedAbilityId === ability.id} onToggle={() => setSelectedAbilityId(selectedAbilityId === ability.id ? null : ability.id)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel — Prompt Tabs */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex border-b border-gray-200 px-6 dark:border-gray-700">
            {PROMPT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedAbilityId(null); }}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id && !selectedAbilityId
                    ? "border-deep-space-blue-500 text-deep-space-blue-600 dark:border-deep-space-blue-400 dark:text-deep-space-blue-400"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {selectedAbility && (
              <div className="flex items-center border-b-2 border-deep-space-blue-500 px-4 py-3">
                <span className="text-sm font-medium text-deep-space-blue-600 dark:text-deep-space-blue-400">
                  Ability: {selectedAbility.display_name}
                </span>
                <button onClick={() => setSelectedAbilityId(null)} className="ml-2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {!preview && !loading && (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading preview...</div>
            )}
            {selectedAbility && <PromptViewer value={selectedAbility.rendered_prompt} />}
            {promptContent && !selectedAbilityId && (
              <>
                {promptContent[activeTab] ? (
                  <PromptViewer value={promptContent[activeTab]} />
                ) : (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                    This section is empty for the selected configuration.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
