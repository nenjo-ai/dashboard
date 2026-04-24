"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fetchAbilityPrompt, updateAbilityPrompt } from "@/lib/api";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { TemplateVariableReference } from "./TemplateVariableReference";
import { Button } from "@/components/ui/Button";
import { Zap } from "lucide-react";
import type { Ability } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AbilityPromptEditorProps {
  ability: Ability;
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
  { id: "instructions", label: "Guidance", group: "Core" },
];

const GROUPS = ["Core"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AbilityPromptEditor({
  ability: initialAbility,
  onClose,
  onSaved,
}: AbilityPromptEditorProps) {
  const [activeSection, setActiveSection] = useState("instructions");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<CodeTextareaHandle>(null);

  // Local editable state
  const [instructions, setInstructions] = useState(initialAbility.prompt ?? "");

  // Reset when ability changes
  useEffect(() => {
    setInstructions(initialAbility.prompt ?? "");
  }, [initialAbility]);

  useEffect(() => {
    let cancelled = false;
    fetchAbilityPrompt(initialAbility.id)
      .then((value) => {
        if (!cancelled) setInstructions(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialAbility.id]);

  // --- Save ----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAbilityPrompt(initialAbility.id, instructions);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save ability");
    } finally {
      setSaving(false);
    }
  }, [initialAbility.id, instructions, onSaved]);

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
    return instructions;
  }, [instructions]);

  const handleEditorChange = useCallback(
    (value: string) => {
      setInstructions(value);
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/40">
              <Zap className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {initialAbility.display_name || initialAbility.name}
                </h2>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  Ability
                </span>
              </div>
              {initialAbility.description && (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {initialAbility.description}
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
                              ? "border-r-2 border-amber-500 bg-amber-50 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
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
                placeholder="Detailed instructions for this ability. Appended to the caller's prompt during the sub-loop..."
                onCursorChange={(line, col) => {
                  setCursorLine(line);
                  setCursorCol(col);
                }}
              />
              <p className="px-1 pt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Guidance is appended to the caller&apos;s prompt during the ability sub-loop. The agent inherits the caller&apos;s identity, memory, and model. Use template variables to inject dynamic context.
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
