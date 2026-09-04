"use client";

import { useMemo, useState } from "react";
import { useContextBlocks } from "@/lib/hooks";

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
  /** Retained for callers while the reference catalog is context-block-only. */
  contextBlocksOnly?: boolean;
  /** Retained for compatibility; dynamic flat variables are no longer exposed. */
  flatVarsOnly?: boolean;
  /** Retained for compatibility with existing editor layouts. */
  includeGroups?: string[];
  /** Retained for compatibility with existing editor layouts. */
  excludeGroups?: string[];
  /** Start reference groups collapsed to keep supporting material quiet. */
  defaultCollapsed?: boolean;
  /** Show a compact variable search field. */
  searchable?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateVariableReference({
  onInsertVariable,
  defaultCollapsed = false,
  searchable = false,
}: TemplateVariableReferenceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const { contextBlocks } = useContextBlocks();

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

  const variableGroups = useMemo(() => [contextBlockGroup], [contextBlockGroup]);

  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return variableGroups;
    return variableGroups
      .map((group) => ({
        ...group,
        variables: group.variables.filter(
          (variable) =>
            group.title.toLowerCase().includes(normalized) ||
            variable.name.toLowerCase().includes(normalized) ||
            variable.description.toLowerCase().includes(normalized),
        ),
      }))
      .filter((group) => group.variables.length > 0);
  }, [query, variableGroups]);

  const toggle = (title: string) => {
    if (defaultCollapsed) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(title)) next.delete(title);
        else next.add(title);
        return next;
      });
      return;
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Static Context Blocks
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {onInsertVariable
          ? "Click a block to insert it at the cursor."
          : "Context blocks are compiled into the static instruction prefix."}{" "}
      </p>

      {searchable ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search references"
          aria-label="Search context blocks"
          className="theme-surface theme-border theme-text mb-4 w-full rounded-lg border px-3 py-2 text-xs outline-hidden focus:border-deep-space-blue-400"
        />
      ) : null}

      <div className="space-y-3">
        {visibleGroups.map((group) => {
          const isCollapsed = query.trim()
            ? false
            : defaultCollapsed
              ? !expanded.has(group.title)
              : collapsed.has(group.title);
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
        {visibleGroups.length === 0 ? <p className="theme-text-muted py-4 text-center text-xs">No references match your search.</p> : null}
      </div>

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
            MiniJinja is supported for static package arguments, context blocks, conditionals, loops, and filters.
          </p>
          <pre className="rounded bg-purple-100/60 p-2 font-mono text-[9px] leading-relaxed text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
{`{% if args.response_style %}
Response style:
{{ args.response_style }}
{% endif %}

{{ context.methodology }}`}
          </pre>
        </div>
      )}
    </div>
  );
}
