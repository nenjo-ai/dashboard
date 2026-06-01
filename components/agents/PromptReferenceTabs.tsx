"use client";

import { useState } from "react";
import { LibraryReferenceList } from "./LibraryReferenceList";
import { TemplateVariableReference } from "./TemplateVariableReference";

type ReferenceTab = "vars" | "context" | "library";

export function PromptReferenceTabs({
  onInsertVariable,
  defaultTab = "vars",
}: {
  onInsertVariable: (text: string) => void;
  defaultTab?: ReferenceTab;
}) {
  const [tab, setTab] = useState<ReferenceTab>(defaultTab);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="theme-border flex shrink-0 border-b">
        {[
          ["vars", "Vars"],
          ["context", "Context Blocks"],
          ["library", "Library"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as ReferenceTab)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
              tab === id
                ? "theme-text border-b-2 border-[var(--app-border-strong)]"
                : "theme-text-muted hover:[color:var(--app-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "vars" ? (
          <TemplateVariableReference onInsertVariable={onInsertVariable} flatVarsOnly />
        ) : tab === "context" ? (
          <TemplateVariableReference onInsertVariable={onInsertVariable} contextBlocksOnly />
        ) : (
          <LibraryReferenceList onInsertVariable={onInsertVariable} />
        )}
      </div>
    </div>
  );
}
