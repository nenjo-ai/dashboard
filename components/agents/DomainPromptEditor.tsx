"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fetchDomainManifest, updateDomainManifest } from "@/lib/api";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { PromptReferenceTabs } from "./PromptReferenceTabs";
import { Button } from "@/components/ui/Button";
import { Globe } from "lucide-react";
import type { Domain, DomainManifest } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DomainPromptEditorProps {
  domain: Domain;
  onClose: () => void;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

interface Section {
  id: string;
  label: string;
  group: string;
}

const SECTIONS: Section[] = [
  { id: "developer_prompt_addon", label: "Guidance", group: "Core" },
];

const GROUPS = ["Core"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DomainPromptEditor({
  domain,
  onClose,
  onSaved,
}: DomainPromptEditorProps) {
  const [activeSection, setActiveSection] = useState("developer_prompt_addon");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<CodeTextareaHandle>(null);
  const [manifest, setManifest] = useState<DomainManifest | null>(domain.manifest ?? null);

  // Local editable state
  const [systemAddon, setSystemAddon] = useState(domain.manifest?.prompt?.developer_prompt_addon ?? "");

  // Reset when domain changes
  useEffect(() => {
    setManifest(domain.manifest ?? null);
    setSystemAddon(domain.manifest?.prompt?.developer_prompt_addon ?? "");
  }, [domain]);

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
          setError(e instanceof Error ? e.message : "Failed to load domain manifest");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domain.id]);

  // --- Save ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
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
      setError(e instanceof Error ? e.message : "Failed to save domain");
    } finally {
      setSaving(false);
    }
  }, [domain, manifest, systemAddon, onSaved]);

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

  // --- Editor value --------------------------------------------------------

  const currentValue = useMemo(() => {
    return systemAddon;
  }, [systemAddon]);

  const handleEditorChange = useCallback(
    (value: string) => {
      setSystemAddon(value);
    },
    [],
  );

  const handleInsertVariable = useCallback(
    (text: string) => {
      editorRef.current?.insertAtCursor(text);
    },
    [],
  );

  const activeLabel =
    SECTIONS.find((s) => s.id === activeSection)?.label ?? "";

  // --- Render --------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="theme-border theme-surface relative z-10 mx-6 my-6 flex w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border shadow-2xl">
        {/* -- Header -- */}
        <div className="theme-border flex shrink-0 items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/40">
              <Globe className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {domain.name}
                </h2>
                <span className="theme-surface-muted theme-text-muted shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-xs">
                  {domain.command}
                </span>
              </div>
              {domain.description && (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {domain.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || saved}
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : saved ? (
                <>
                  <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Saved!
                </>
              ) : (
                "Save"
              )}
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* -- Body (3-column) -- */}
        <div className="flex flex-1 overflow-hidden">
          {/* -- Left sidebar -- */}
          <div className="theme-border theme-surface-muted flex w-56 shrink-0 flex-col overflow-y-auto border-r">
            <div className="flex-1 p-3 space-y-4">
              {GROUPS.map((group) => (
                <div key={group}>
                  <h4 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {group}
                  </h4>
                  <div className="space-y-0.5">
                    {SECTIONS.filter((s) => s.group === group).map((s) => {
                      const isActive = s.id === activeSection;
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
                              ? "border-r-2 border-purple-500 bg-purple-50 font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : "text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-400"
                          }`}
                        >
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* -- Center editor -- */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Section title bar */}
            <div className="theme-border theme-surface-muted flex shrink-0 items-center border-b px-4 py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {activeLabel}
              </span>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden p-3">
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
              <p className="px-1 pt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Guidance is overlaid onto the agent&apos;s static developer prompt when this domain is active. Runtime context is supplied separately by the worker.
              </p>
            </div>
          </div>

          {/* -- Right sidebar -- */}
          <div className="theme-border theme-surface-muted w-80 shrink-0 overflow-hidden border-l">
            <PromptReferenceTabs onInsertVariable={handleInsertVariable} />
          </div>
        </div>

        {/* -- Status bar -- */}
        <div className="theme-border flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-4">
            <span>{currentValue.length.toLocaleString()} chars</span>
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
  );
}
