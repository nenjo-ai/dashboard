"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { updateDomain } from "@/lib/api";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { TemplateVariableReference } from "./TemplateVariableReference";
import { Button } from "@/components/ui/Button";
import { Globe } from "lucide-react";
import type { Domain } from "@/lib/types";

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
  { id: "system_addon", label: "Guidance", group: "Core" },
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
  const [activeSection, setActiveSection] = useState("system_addon");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<CodeTextareaHandle>(null);

  // Local editable state
  const [systemAddon, setSystemAddon] = useState(domain.manifest?.prompt?.system_addon ?? "");

  // Reset when domain changes
  useEffect(() => {
    setSystemAddon(domain.manifest?.prompt?.system_addon ?? "");
  }, [domain]);

  // --- Save ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const manifest = { ...domain.manifest };
      manifest.prompt = {
        ...manifest.prompt,
        system_addon: systemAddon,
      };
      await updateDomain(domain.id, { manifest });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save domain");
    } finally {
      setSaving(false);
    }
  }, [domain, systemAddon, onSaved]);

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
      <div className="relative z-10 mx-6 my-6 flex w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* -- Header -- */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/40">
              <Globe className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {domain.display_name}
                </h2>
                <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
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
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
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
          <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
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
                              : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
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
            <div className="flex shrink-0 items-center border-b border-gray-200 bg-gray-50/50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/30">
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
                Guidance is overlaid onto the agent&apos;s existing developer prompt when this domain is active. Use template variables for dynamic context.
              </p>
            </div>
          </div>

          {/* -- Right sidebar -- */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <TemplateVariableReference
              onInsertVariable={handleInsertVariable}
            />
          </div>
        </div>

        {/* -- Status bar -- */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-4 py-1.5 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
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
