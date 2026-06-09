"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchContextBlockContent,
  updateContextBlock,
  updateContextBlockContent,
} from "@/lib/api";
import { CodeTextarea, type CodeTextareaHandle } from "./CodeTextarea";
import { PromptReferenceTabs } from "./PromptReferenceTabs";
import { useResizablePanel, ResizeHandle } from "./useResizablePanel";
import { Button } from "@/components/ui/Button";
import { sourceManagedMetadata } from "@/lib/sourceManaged";
import { isContextBlockLocked, type ContextBlock } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared hook for editor logic
// ---------------------------------------------------------------------------

function useBlockEditor(block: ContextBlock, onSaved: () => void) {
  const [template, setTemplate] = useState(block.template ?? "");
  const [name, setName] = useState(block.name);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<CodeTextareaHandle>(null);

  useEffect(() => {
    setTemplate(block.template ?? "");
    setName(block.name);
  }, [block]);

  useEffect(() => {
    if (typeof block.template === "string") return;
    let cancelled = false;
    fetchContextBlockContent(block.id)
      .then((fullBlock) => {
        if (!cancelled) {
          setTemplate(fullBlock.template ?? "");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load context block content");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [block.id, block.template]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateContextBlock(block.id, {
        name: name.trim() !== block.name ? name.trim() : undefined,
      });
      await updateContextBlockContent(block.id, template);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [block.id, block.name, template, name, onSaved]);

  const handleInsertVariable = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text);
  }, []);

  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorLine(line);
    setCursorCol(col);
  }, []);

  return {
    template,
    setTemplate,
    name,
    setName,
    cursorLine,
    cursorCol,
    saving,
    saved,
    error,
    editorRef,
    handleSave,
    handleInsertVariable,
    handleCursorChange,
  };
}

function variableRef(block: ContextBlock): string {
  if (block.path) {
    return `{{ ${block.path.replace(/\//g, ".")}.${block.name} }}`;
  }
  return `{{ ${block.name} }}`;
}

// ---------------------------------------------------------------------------
// Full-screen modal editor
// ---------------------------------------------------------------------------

interface ContextBlockEditorProps {
  block: ContextBlock;
  onClose: () => void;
  onSaved: () => void;
}

export function ContextBlockEditor({ block, onClose, onSaved }: ContextBlockEditorProps) {
  const {
    template,
    setTemplate,
    cursorLine,
    cursorCol,
    saving,
    saved,
    error,
    editorRef,
    handleSave,
    handleInsertVariable,
    handleCursorChange,
  } = useBlockEditor(block, onSaved);
  const panel = useResizablePanel(320, 240, 560);

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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />

      <div className="theme-border theme-surface relative z-10 mx-6 my-6 flex w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="theme-border flex shrink-0 items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-900/40">
              <svg className="h-5 w-5 text-teal-500 dark:text-teal-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {block.name}
                </h2>
                <code className="theme-surface-muted theme-text-muted shrink-0 rounded px-1.5 py-0.5 text-xs font-mono">
                  {variableRef(block)}
                </code>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isContextBlockLocked(block)
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
                    : "theme-surface-muted theme-text-muted"
                }`}>
                  {isContextBlockLocked(block) ? "Managed" : "Custom"}
                </span>
              </div>
              {block.description && (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{block.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || saved}>
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </Button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — info */}
          <div className="theme-border theme-surface-muted flex w-56 shrink-0 flex-col overflow-y-auto border-r p-4">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Template
            </h4>
            {block.read_only ? (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Edit the wrapper template for this context block. Use template variables to inject dynamic data.
                </p>
                <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-2.5 dark:border-teal-800 dark:bg-teal-900/20">
                  <p className="text-[10px] text-teal-700 dark:text-teal-300 leading-relaxed">
                    Context blocks are rendered with the same template variables as your prompts. Use the reference panel on the right.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Write static content or use template variables to build dynamic context for your agents.
                </p>
                <div className="theme-border theme-surface mt-4 rounded-lg border p-2.5">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    Reference this block in agent prompts with <code className="font-mono text-teal-600 dark:text-teal-400">{variableRef(block)}</code>.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Center editor */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="theme-border theme-surface-muted flex shrink-0 items-center border-b px-4 py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Template</span>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <CodeTextarea
                ref={editorRef}
                value={template}
                onChange={setTemplate}
                placeholder={block.read_only
                  ? '<available_agents>\n{{ agents }}\n</available_agents>'
                  : 'Write your context content here...\nUse {{ variable }} syntax for dynamic values.'
                }
                onCursorChange={handleCursorChange}
              />
            </div>
          </div>

          {/* Resize handle + Right sidebar — variables */}
          <ResizeHandle onMouseDown={panel.onMouseDown} />
          <div
            style={{ width: panel.width }}
            className="theme-surface-muted shrink-0 overflow-hidden"
          >
            <PromptReferenceTabs onInsertVariable={handleInsertVariable} />
          </div>
        </div>

        {/* Status bar */}
        <div className="theme-border flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>{template.length.toLocaleString()} chars</span>
            <span>Ln {cursorLine}, Col {cursorCol}</span>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editor (for ContextBlocksExplorer right panel)
// ---------------------------------------------------------------------------

interface ContextBlockEditorInlineProps {
  block: ContextBlock;
  onSaved: () => void;
  onDelete?: () => void;
}

export function ContextBlockEditorInline({ block, onSaved, onDelete }: ContextBlockEditorInlineProps) {
  if (block.read_only || block.metadata?.install) {
    return <ReadOnlyContextBlockPanel block={block} />;
  }

  return <EditableContextBlockEditorInline block={block} onSaved={onSaved} onDelete={onDelete} />;
}

function ReadOnlyContextBlockPanel({ block }: { block: ContextBlock }) {
  const [content, setContent] = useState<{
    blockId: string;
    value: string;
    loaded: boolean;
    error: string | null;
  }>({
    blockId: block.id,
    value: block.template ?? "",
    loaded: typeof block.template === "string",
    error: null,
  });
  const source = sourceManagedMetadata(block);

  useEffect(() => {
    let cancelled = false;
    fetchContextBlockContent(block.id)
      .then((response) => {
        if (!cancelled) {
          setContent({
            blockId: block.id,
            value: response.template ?? "",
            loaded: true,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setContent({
            blockId: block.id,
            value: block.template ?? "",
            loaded: true,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load context block content",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [block.id, block.template]);

  const contentLoading = content.blockId !== block.id || !content.loaded;
  const contentError = content.blockId === block.id ? content.error : null;
  const contentValue =
    content.blockId === block.id ? content.value : (block.template ?? "");

  const repoLabel =
    source.owner && source.repo ? `${source.owner}/${source.repo}` : null;
  const refLabel = source.commit ? source.commit.slice(0, 7) : source.ref;
  const hasSourceDetails = Boolean(
    repoLabel || refLabel || source.sourcePath || source.selector,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="theme-border border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="theme-text text-sm font-semibold">
                {block.name}
              </h2>
              <span className="theme-surface-muted-strong theme-text rounded-full px-2 py-0.5 text-[10px] font-medium">
                Source managed
              </span>
            </div>
            {block.description ? (
              <p className="theme-text-muted mt-1 text-sm">
                {block.description}
              </p>
            ) : null}
          </div>
          <code className="theme-surface-muted rounded px-2 py-1 text-[11px] font-mono text-teal-600 dark:text-teal-400">
            {variableRef(block)}
          </code>
        </div>
        {hasSourceDetails ? (
          <details className="mt-3">
            <summary className="theme-text-muted cursor-pointer text-xs font-medium">
              Source details
            </summary>
            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <ReadOnlySourceField label="Repository" value={repoLabel} />
              <ReadOnlySourceField label="Ref" value={refLabel} />
              <ReadOnlySourceField
                label="Path"
                value={source.sourcePath}
                mono
              />
              <ReadOnlySourceField
                label="Selector"
                value={source.selector}
                mono
              />
            </dl>
          </details>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {contentLoading ? (
          <div className="theme-text-muted text-sm">
            Loading context block content...
          </div>
        ) : contentError ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {contentError}. Showing the stored summary snapshot.
          </div>
        ) : null}
        {contentValue.trim() ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {contentValue}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="theme-text-muted text-sm">
            No context block content available.
          </div>
        )}
      </div>
    </div>
  );
}

function ReadOnlySourceField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="theme-border theme-surface-muted min-w-0 rounded-lg border px-3 py-2">
      <dt className="theme-text-muted text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </dt>
      <dd className={`theme-text mt-0.5 truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function EditableContextBlockEditorInline({ block, onSaved, onDelete }: ContextBlockEditorInlineProps) {
  const {
    template,
    setTemplate,
    name,
    setName,
    cursorLine,
    cursorCol,
    saving,
    saved,
    error,
    editorRef,
    handleSave,
    handleInsertVariable,
    handleCursorChange,
  } = useBlockEditor(block, onSaved);
  const containerRef = useRef<HTMLDivElement>(null);
  const panel = useResizablePanel(280, 200, 480);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const handleDownload = useCallback(() => {
    const filename = block.path
      ? `${block.path.replace(/\//g, "/")}/${block.name}.md`
      : `${block.name}.md`;
    const blob = new Blob([template], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [block.path, block.name, template]);

  return (
    <div ref={containerRef} tabIndex={-1} onKeyDown={handleKeyDown} className="flex h-full flex-col outline-none">
      {/* Header */}
      <div className="theme-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            className="theme-surface-muted theme-text-muted w-36 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:ring-1 focus:ring-teal-400"
            readOnly={!!block.read_only}
          />
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            isContextBlockLocked(block)
              ? "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
              : "theme-surface-muted theme-text-muted"
          }`}>
            {isContextBlockLocked(block) ? "Managed" : "Custom"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="rounded p-1 text-gray-300 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-300"
            title="Download as .md"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-flag-red-500 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
              title="Delete block"
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

      {/* Variable reference */}
      <div className="theme-border flex shrink-0 items-center gap-2 border-b px-4 py-1.5">
        <span className="text-[10px] text-gray-500 dark:text-gray-400">Variable:</span>
        <code className="theme-surface-muted rounded px-1.5 py-0.5 text-[11px] font-mono text-teal-600 dark:text-teal-400">
          {variableRef(block)}
        </code>
      </div>

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-2">
            <CodeTextarea
              ref={editorRef}
              value={template}
              onChange={setTemplate}
              placeholder={block.read_only
                ? '<available_agents>\n{{ agents }}\n</available_agents>'
                : 'Write your context content here...\nUse {{ variable }} syntax for dynamic values.'
              }
              onCursorChange={handleCursorChange}
            />
          </div>
        </div>

        {/* Resize handle + Side panel — variables */}
        <ResizeHandle onMouseDown={panel.onMouseDown} />
        <div
          style={{ width: panel.width }}
          className="theme-surface-muted shrink-0 overflow-hidden"
        >
          <PromptReferenceTabs onInsertVariable={handleInsertVariable} />
        </div>
      </div>

      {/* Status bar */}
      <div className="theme-border flex shrink-0 items-center justify-between border-t px-4 py-1 text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-3">
          <span>{template.length.toLocaleString()} chars</span>
          <span>Ln {cursorLine}, Col {cursorCol}</span>
        </div>
        {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
