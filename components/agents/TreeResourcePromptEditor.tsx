"use client";

import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { PromptReferenceTabs } from "./PromptReferenceTabs";
import { ResizeHandle, useResizablePanel } from "./useResizablePanel";

export interface TreeResourcePromptField {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
}

export interface TreeResourcePromptEditorProps {
  title: string;
  badge?: ReactNode;
  subtitle?: ReactNode;
  fields?: TreeResourcePromptField[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  promptLabel?: string;
  saveLabel?: string;
  onSave?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function TreeResourcePromptEditor({
  title,
  badge,
  subtitle,
  fields,
  value,
  onChange,
  placeholder,
  readOnly = false,
  saving = false,
  saved = false,
  error,
  promptLabel = "Prompt",
  saveLabel = "Save",
  onSave,
  onDelete,
  actions,
  footer,
}: TreeResourcePromptEditorProps) {
  const editorRef = useRef<CodeTextareaHandle>(null);
  const panel = useResizablePanel(320, 240, 560);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const handleInsertVariable = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly || saving || !onSave) return;
    await onSave();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="theme-border theme-surface flex h-full min-h-0 flex-col overflow-hidden rounded-lg border"
    >
      <div className="theme-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="theme-text truncate font-mono text-lg font-semibold">{title}</h3>
            {badge}
          </div>
          {subtitle ? (
            <div className="theme-text-muted mt-1 text-sm">{subtitle}</div>
          ) : null}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {onDelete ? (
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : null}
            {onSave ? (
              <button
                type="submit"
                disabled={saving || saved}
                className="inline-flex items-center gap-2 rounded-md bg-deep-space-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-deep-space-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : saved ? "Saved" : saveLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {fields?.length ? (
        <div className="theme-border grid shrink-0 gap-3 border-b px-4 py-3 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.id} className="block min-w-0 text-sm">
              <span className="theme-text-muted text-xs font-medium uppercase tracking-wide">
                {field.label}
              </span>
              <input
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                disabled={readOnly || saving || field.disabled}
                required={field.required}
                placeholder={field.placeholder}
                className={`theme-text mt-1 w-full rounded-md border border-[var(--app-border-color)] bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60 ${
                  field.mono ? "font-mono" : ""
                }`}
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="theme-border theme-text-muted flex shrink-0 items-center justify-between border-b px-4 py-1.5 text-[10px]">
            <span className="font-semibold uppercase tracking-wide">{promptLabel}</span>
            <span>
              {value.length.toLocaleString()} chars · Ln {cursorLine}, Col {cursorCol}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <CodeTextarea
              ref={editorRef}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              readOnly={readOnly || saving}
              onCursorChange={(line, col) => {
                setCursorLine(line);
                setCursorCol(col);
              }}
            />
          </div>
        </div>
        <ResizeHandle onMouseDown={panel.onMouseDown} />
        <div
          style={{ width: panel.width }}
          className="theme-surface-muted flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
        >
          <PromptReferenceTabs onInsertVariable={handleInsertVariable} />
        </div>
      </div>

      {(error || footer) && (
        <div className="theme-border shrink-0 border-t px-4 py-3">
          {error ? (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}
          {footer}
        </div>
      )}
    </form>
  );
}
