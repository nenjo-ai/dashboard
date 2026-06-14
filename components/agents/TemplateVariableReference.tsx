"use client";

import { useMemo, useState } from "react";
import { useContextBlocks, useTemplateVars } from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Variable {
  name: string;
  description: string;
}

interface VariableGroup {
  title: string;
  variables: Variable[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TemplateVariableReferenceProps {
  /** Called when user clicks a variable to insert it at cursor. */
  onInsertVariable?: (text: string) => void;
  /** If true, only show context blocks (for agent prompt editor). */
  contextBlocksOnly?: boolean;
  /** If true, only show flat vars — no context blocks (for context block editor). */
  flatVarsOnly?: boolean;
  /** Optional flat variable group allow-list. */
  includeGroups?: string[];
  /** Optional flat variable group deny-list. */
  excludeGroups?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateVariableReference({
  onInsertVariable,
  contextBlocksOnly = false,
  flatVarsOnly = false,
  includeGroups,
  excludeGroups,
}: TemplateVariableReferenceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { contextBlocks } = useContextBlocks();
  const { varGroups, isLoading: varsLoading, isError: varsError } = useTemplateVars();

  // Convert API response to component's VariableGroup format.
  // Falls back to empty if still loading (the loading state is shown separately).
  const flatVarGroups: VariableGroup[] = useMemo(() => {
    if (!varGroups || varGroups.length === 0) return [];
    const include = includeGroups ? new Set(includeGroups) : null;
    const exclude = excludeGroups ? new Set(excludeGroups) : null;
    return varGroups
      .filter((g) => (include ? include.has(g.name) : true))
      .filter((g) => (exclude ? !exclude.has(g.name) : true))
      .map((g) => ({
        title: g.name,
        variables: g.variables.map((v) => ({
          name: v.name,
          description: v.description,
        })),
      }));
  }, [varGroups, includeGroups, excludeGroups]);

  // Build context blocks group from DB — with dotted paths and group entries
  const contextBlockGroup: VariableGroup = useMemo(() => {
    const blocks = contextBlocks ?? [];
    const variables: Variable[] = [];
    const seenGroups = new Set<string>();

    for (const b of blocks) {
      if (b.path) {
        const parts = b.path.split("/");
        for (let i = 1; i <= parts.length; i++) {
          const prefix = parts.slice(0, i).join("/");
          const dottedPrefix = prefix.replace(/\//g, ".");
          if (!seenGroups.has(dottedPrefix)) {
            seenGroups.add(dottedPrefix);
            variables.push({
              name: dottedPrefix,
              description: `All blocks under ${prefix}/`,
            });
          }
        }
      }
    }

    for (const b of blocks) {
      const dottedName = b.path
        ? `${b.path.replace(/\//g, ".")}.${b.name}`
        : b.name;
      variables.push({
        name: dottedName,
        description: b.description || `${b.name} context block`,
      });
    }

    return { title: "Context Blocks", variables };
  }, [contextBlocks]);

  const variableGroups: VariableGroup[] = useMemo(() => {
    if (contextBlocksOnly) {
      return [
        contextBlockGroup,
        {
          title: "Special",
          variables: [
            { name: "memory", description: "Relevant memories — facts and summaries from past interactions" },
          ],
        },
      ];
    }
    if (flatVarsOnly) {
      return flatVarGroups;
    }
    return [
      ...flatVarGroups,
      contextBlockGroup,
      {
        title: "Special",
        variables: [
          { name: "memory", description: "Retrieved memories (async, not template-driven)" },
        ],
      },
    ];
  }, [contextBlocksOnly, flatVarsOnly, flatVarGroups, contextBlockGroup]);

  const toggle = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Show loading/error states when variables tab is active
  const showVarsState = (flatVarsOnly || (!contextBlocksOnly && !flatVarsOnly)) && !contextBlocksOnly;
  if (showVarsState && varsLoading) {
    return (
      <div className="h-full overflow-y-auto p-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading variables...
        </div>
      </div>
    );
  }

  if (showVarsState && varsError) {
    return (
      <div className="h-full overflow-y-auto p-2">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-xs text-red-600 dark:text-red-400">
            Failed to load template variables. Check that the backend is running.
          </p>
        </div>
      </div>
    );
  }

  if (showVarsState && flatVarGroups.length === 0 && !varsLoading) {
    return (
      <div className="h-full overflow-y-auto p-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No template variables available.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {contextBlocksOnly ? "Context Blocks" : "Template Variables"}
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {onInsertVariable
          ? "Click a variable to insert at cursor."
          : 'Use {{ variable_name }} syntax in your templates.'}{" "}
      </p>

      <div className="space-y-3">
        {variableGroups.map((group) => {
          const isCollapsed = collapsed.has(group.title);
          return (
            <div key={group.title}>
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggle(group.title)}
                className="flex w-full items-center gap-1.5 py-1 text-left"
              >
                <svg
                  className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
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
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {group.title}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  ({group.variables.length})
                </span>
              </button>

              {/* Variable list */}
              {!isCollapsed && (
                <div className="mt-1 space-y-1 pl-5">
                  {group.variables.map((variable) => {
                    const token = `{{ ${variable.name} }}`;

                    if (onInsertVariable) {
                      return (
                        <button
                          key={variable.name}
                          type="button"
                          onClick={() => onInsertVariable(token)}
                          className="group flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-deep-space-blue-50 dark:hover:bg-deep-space-blue-900/20"
                        >
                          <div className="min-w-0 flex-1">
                            <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
                              {token}
                            </code>
                            <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                              {variable.description}
                            </p>
                          </div>
                          <svg
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600"
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

                    return (
                      <div
                        key={variable.name}
                        className="theme-surface-muted rounded-sm px-2 py-1.5"
                      >
                        <code className="text-xs font-mono text-deep-space-blue-600 dark:text-deep-space-blue-400">
                          {token}
                        </code>
                        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                          {variable.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info boxes — only in the agent prompt editor (not context block editors) */}
      {!contextBlocksOnly && !flatVarsOnly && (
        <>
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <h4 className="mb-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              Developer Prompt
            </h4>
            <p className="text-[10px] text-blue-600 dark:text-blue-400">
              Content in the Developer Prompt section is sent as a separate{" "}
              <code className="font-mono">developer</code> message to OpenAI-spec
              models. For other providers it is combined with the system prompt.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <h4 className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Context Blocks
            </h4>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Context blocks are reusable templates rendered with the same
              variables. Edit them in the Context tab.
            </p>
          </div>
        </>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible Jinja guide (for left sidebars)
// ---------------------------------------------------------------------------

export function JinjaGuide() {
  const [open, setOpen] = useState(true);

  return (
    <div className="theme-border shrink-0 border-t">
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
          Jinja Templating
        </span>
        <svg
          className={`h-3 w-3 text-purple-400 transition-transform dark:text-purple-500 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="theme-border border-t px-3 pb-3 pt-2">
          <p className="mb-2 text-[10px] leading-relaxed text-purple-600/80 dark:text-purple-400/80">
            MiniJinja is supported for conditionals, loops, and filters.
          </p>
          <pre className="rounded bg-purple-100/60 p-2 font-mono text-[9px] leading-relaxed text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
{`{% if project.name %}
You are working on
{{ project.name }}.
{% endif %}

{% if task.priority == "high" %}
Urgent — prioritize speed.
{% else %}
Follow standard procedures.
{% endif %}`}
          </pre>
        </div>
      )}
    </div>
  );
}
