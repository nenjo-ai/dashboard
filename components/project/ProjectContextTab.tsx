"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BookOpen, Braces, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { TemplateVariableReference } from "@/components/agents/TemplateVariableReference";
import { updateProject } from "@/lib/api";
import { useKnowledgePacks } from "@/lib/hooks";
import type { KnowledgePack, Project } from "@/lib/types";

interface ProjectContextTabProps {
  project: Project | undefined;
  onUpdated: () => void;
}

function normalizeLibraryVarSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function LibraryReferenceList({
  onInsertVariable,
}: {
  onInsertVariable: (text: string) => void;
}) {
  const { packs, isLoading, isError } = useKnowledgePacks();
  const activePacks = (packs ?? [])
    .filter((pack) => pack.status === "active")
    .sort((left, right) => left.name.localeCompare(right.name));

  if (isLoading) {
    return (
      <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
        Loading library...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-xs text-red-600 dark:text-red-400">
          Failed to load library packs.
        </p>
      </div>
    );
  }

  if (activePacks.length === 0) {
    return (
      <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
        No active library packs.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Library
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Click a pack to insert its context variable.
      </p>
      <div className="space-y-1">
        {activePacks.map((pack: KnowledgePack) => {
          const name = normalizeLibraryVarSegment(pack.slug);
          const token = `{{ lib.${name} }}`;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => onInsertVariable(token)}
              className="group flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20"
            >
              <div className="min-w-0 flex-1">
                <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
                  {token}
                </code>
                <p className="mt-0.5 truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  {pack.name}
                </p>
                {pack.description && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-500 dark:text-gray-400">
                    {pack.description}
                  </p>
                )}
              </div>
              <span className="mt-0.5 text-sm text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600">
                +
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjectContextTab({ project, onUpdated }: ProjectContextTabProps) {
  const [value, setValue] = useState("");
  const [referenceTab, setReferenceTab] = useState<"variables" | "library">("variables");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (project) {
      const ctx = (project.settings as Record<string, unknown>)?.context;
      setValue(typeof ctx === "string" ? ctx : "");
    }
  }, [project]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, context: value },
      });
      onUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save context");
    } finally {
      setIsSaving(false);
    }
  }, [project, value, onUpdated]);

  const isDirty =
    project != null &&
    value !== ((project.settings as Record<string, unknown>)?.context ?? "");

  const insertVariable = useCallback((token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setValue((current) => `${current}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }, [value]);

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card static>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle>Project Context</CardTitle>
              <CardDescription>
                Global context rendered into <code className="font-mono">project.context</code> for agents working in this project.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Architecture, goals, conventions, constraints, library references..."
            className="min-h-[420px] resize-y font-mono text-sm leading-6"
          />
        </CardContent>
        <CardFooter className="gap-3">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="gap-2"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
          )}
          {error && (
            <span className="text-sm text-flag-red-600 dark:text-flag-red-400">{error}</span>
          )}
        </CardFooter>
      </Card>

      <Card static className="flex max-h-[680px] min-h-[420px] flex-col overflow-hidden xl:sticky xl:top-24 xl:self-start">
        <CardHeader className="shrink-0 pb-3">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <CardTitle className="text-sm">References</CardTitle>
          </div>
          <CardDescription>
            Insert template and knowledge vars into the project context.
          </CardDescription>
        </CardHeader>
        <div className="theme-border flex shrink-0 border-b">
          <button
            type="button"
            onClick={() => setReferenceTab("variables")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              referenceTab === "variables"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Variables
          </button>
          <button
            type="button"
            onClick={() => setReferenceTab("library")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              referenceTab === "library"
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            Library
          </button>
        </div>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-3">
          {referenceTab === "variables" ? (
            <TemplateVariableReference
              onInsertVariable={insertVariable}
              flatVarsOnly
              excludeGroups={["Knowledge"]}
            />
          ) : (
            <LibraryReferenceList onInsertVariable={insertVariable} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
