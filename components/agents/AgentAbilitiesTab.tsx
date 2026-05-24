"use client";

import { useState, useMemo, useCallback } from "react";
import { useAbilities, useAgentAbilities } from "@/lib/hooks";
import { setAgentAbilities } from "@/lib/api";
import { agentColorAlpha } from "@/lib/agent-colors";
import type { Ability } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tree types (same as AbilitiesExplorer)
// ---------------------------------------------------------------------------

interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeEntry[];
  isSystem: boolean;
}

interface FileNode {
  type: "file";
  ability: Ability;
}

type TreeEntry = FolderNode | FileNode;

function buildTree(abilities: Ability[]): TreeEntry[] {
  const folderMap = new Map<string, FolderNode>();

  const getOrCreateFolder = (path: string): FolderNode => {
    if (folderMap.has(path)) return folderMap.get(path)!;
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const node: FolderNode = {
      type: "folder",
      name,
      path,
      children: [],
      isSystem: path === "nenjo" || path.startsWith("nenjo/"),
    };
    folderMap.set(path, node);
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = getOrCreateFolder(parentPath);
      if (
        !parent.children.some((c) => c.type === "folder" && c.path === path)
      ) {
        parent.children.push(node);
      }
    }
    return node;
  };

  const rootItems: TreeEntry[] = [];
  const rootFolders = new Set<string>();

  for (const ability of abilities) {
    if (ability.path) {
      const folder = getOrCreateFolder(ability.path);
      folder.children.push({ type: "file", ability });
    } else {
      rootItems.push({ type: "file", ability });
    }
  }

  folderMap.forEach((node, path) => {
    if (!path.includes("/") && !rootFolders.has(path)) {
      rootFolders.add(path);
      rootItems.push(node);
    }
  });

  const sortEntries = (entries: TreeEntry[]) => {
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      const nameA = a.type === "folder" ? a.name : a.ability.name;
      const nameB = b.type === "folder" ? b.name : b.ability.name;
      return nameA.localeCompare(nameB);
    });
    for (const entry of entries) {
      if (entry.type === "folder") sortEntries(entry.children);
    }
  };

  sortEntries(rootItems);
  return rootItems;
}

// ---------------------------------------------------------------------------
// localStorage persistence for expanded state
// ---------------------------------------------------------------------------

const STORAGE_KEY = "nenjo:agent-abilities:expanded";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* */
  }
  return new Set(["nenjo", "nenjo/platform"]);
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* */
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AgentAbilitiesTabProps {
  agentId: string;
  agentColor: string;
}

export function AgentAbilitiesTab({
  agentId,
  agentColor,
}: AgentAbilitiesTabProps) {
  const { abilities: allAbilities, isLoading: abilitiesLoading } =
    useAbilities();
  const {
    abilities: agentAbilities,
    isLoading: assignmentsLoading,
    mutate,
  } = useAgentAbilities(agentId);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expanded, setExpandedRaw] = useState<Set<string>>(loadExpanded);

  const isLoading = abilitiesLoading || assignmentsLoading;
  const assignedNames = useMemo(
    () => new Set((agentAbilities ?? []).map((a) => a.name)),
    [agentAbilities],
  );

  const tree = useMemo(() => buildTree(allAbilities ?? []), [allAbilities]);

  const setExpanded: React.Dispatch<React.SetStateAction<Set<string>>> =
    useCallback((updater) => {
      setExpandedRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveExpanded(next);
        return next;
      });
    }, []);

  const toggleFolder = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    [setExpanded],
  );

  const handleToggle = useCallback(
    async (ability: Ability) => {
      if (toggling) return;
      setToggling(ability.id);
      try {
        const currentNames = Array.from(assignedNames);
        const next = assignedNames.has(ability.name)
          ? currentNames.filter((name) => name !== ability.name)
          : [...currentNames, ability.name];
        await setAgentAbilities(agentId, next);
        mutate();
      } catch {
        /* */
      } finally {
        setToggling(null);
      }
    },
    [agentId, assignedNames, toggling, mutate],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="theme-surface-muted h-10 animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (!allAbilities || allAbilities.length === 0) {
    return (
      <div className="theme-border rounded-lg border border-dashed px-4 py-6 text-center">
        <p className="theme-text-muted text-sm">
          No abilities available. Create abilities in the Abilities section
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="theme-surface theme-border rounded-xl border">
      <div className="theme-border border-b px-4 py-2.5">
        <span className="theme-text-muted text-xs font-semibold uppercase tracking-wider">
          Assign Abilities
        </span>
        <span className="theme-text-muted ml-2 text-xs">
          {assignedNames.size} assigned
        </span>
      </div>
      <div className="p-2">
        <TreeNodeList
          entries={tree}
          expanded={expanded}
          onToggle={toggleFolder}
          assignedNames={assignedNames}
          togglingId={toggling}
          onToggleAssignment={handleToggle}
          agentColor={agentColor}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

function TreeNodeList({
  entries,
  expanded,
  onToggle,
  assignedNames,
  togglingId,
  onToggleAssignment,
  agentColor,
  depth = 0,
}: {
  entries: TreeEntry[];
  expanded: Set<string>;
  onToggle: (path: string) => void;
  assignedNames: Set<string>;
  togglingId: string | null;
  onToggleAssignment: (ability: Ability) => void;
  agentColor: string;
  depth?: number;
}) {
  return (
    <div>
      {entries.map((entry) => {
        if (entry.type === "folder") {
          return (
            <FolderRow
              key={`folder:${entry.path}`}
              folder={entry}
              depth={depth}
              expanded={expanded}
              onToggle={onToggle}
              assignedNames={assignedNames}
              togglingId={togglingId}
              onToggleAssignment={onToggleAssignment}
              agentColor={agentColor}
            />
          );
        }
        return (
          <AbilityRow
            key={entry.ability.id}
            ability={entry.ability}
            depth={depth}
            isAssigned={assignedNames.has(entry.ability.name)}
            isProcessing={togglingId === entry.ability.id}
            onToggle={() => onToggleAssignment(entry.ability)}
            agentColor={agentColor}
          />
        );
      })}
    </div>
  );
}

function FolderRow({
  folder,
  depth,
  expanded,
  onToggle,
  assignedNames,
  togglingId,
  onToggleAssignment,
  agentColor,
}: {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  assignedNames: Set<string>;
  togglingId: string | null;
  onToggleAssignment: (ability: Ability) => void;
  agentColor: string;
}) {
  const isExpanded = expanded.has(folder.path);

  // Count assigned abilities in this folder (recursive)
  const countAssigned = (entries: TreeEntry[]): number => {
    let count = 0;
    for (const e of entries) {
      if (e.type === "file" && assignedNames.has(e.ability.name)) count++;
      if (e.type === "folder") count += countAssigned(e.children);
    }
    return count;
  };
  const assignedCount = countAssigned(folder.children);
  const totalCount = countTotal(folder.children);

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(folder.path)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:[background:var(--app-hover)]"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <svg
          className={`theme-text-muted h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
        <svg
          className={`h-3.5 w-3.5 shrink-0 ${isExpanded ? "theme-text" : "theme-text-muted"}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          {isExpanded ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          )}
        </svg>
        <span className="theme-text truncate text-xs font-medium">
          {folder.name}
        </span>
        {folder.isSystem && (
          <svg
            className="theme-text-muted h-3 w-3 shrink-0 opacity-60"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        )}
        <span className="theme-text-muted ml-auto text-[10px]">
          {assignedCount}/{totalCount}
        </span>
      </button>
      {isExpanded && (
        <TreeNodeList
          entries={folder.children}
          expanded={expanded}
          onToggle={onToggle}
          assignedNames={assignedNames}
          togglingId={togglingId}
          onToggleAssignment={onToggleAssignment}
          agentColor={agentColor}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

function countTotal(entries: TreeEntry[]): number {
  let count = 0;
  for (const e of entries) {
    if (e.type === "file") count++;
    if (e.type === "folder") count += countTotal(e.children);
  }
  return count;
}

function AbilityRow({
  ability,
  depth,
  isAssigned,
  isProcessing,
  onToggle,
  agentColor,
}: {
  ability: Ability;
  depth: number;
  isAssigned: boolean;
  isProcessing: boolean;
  onToggle: () => void;
  agentColor: string;
}) {
  const activeRowStyle = isAssigned
    ? {
        backgroundColor: agentColorAlpha(agentColor, 0.12),
        boxShadow: `inset 0 0 0 1px ${agentColorAlpha(agentColor, 0.32)}`,
      }
    : undefined;

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
        isAssigned ? "" : "hover:[background:var(--app-hover)]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px`, ...activeRowStyle }}
    >
      <button
        onClick={onToggle}
        disabled={isProcessing}
        className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${
          isAssigned
            ? ""
            : "theme-border-strong [background:var(--app-surface-muted-strong)]"
        } ${isProcessing ? "opacity-50" : ""}`}
        style={
          isAssigned
            ? {
                backgroundColor: agentColor,
                boxShadow: `0 0 0 1px ${agentColorAlpha(agentColor, 0.35)}`,
              }
            : undefined
        }
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full shadow-xs transition-transform ${isAssigned ? "left-[16px]" : "left-0.5"}`}
          style={
            !isAssigned
              ? { backgroundColor: "rgba(255, 255, 255, 0.9)" }
              : undefined
          }
        />
      </button>

      <svg
        className="theme-text-muted h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>

      <div className="min-w-0 flex-1">
        <span className="theme-text block truncate text-xs font-medium">
          {ability.name}
        </span>
        {ability.activation_condition && (
          <span className="theme-text-muted line-clamp-1 block text-[10px]">
            {ability.activation_condition}
          </span>
        )}
      </div>

      {ability.platform_scopes.length > 0 && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            isAssigned ? "" : "theme-surface-muted theme-text"
          }`}
          style={
            isAssigned
              ? {
                  backgroundColor: agentColorAlpha(agentColor, 0.14),
                  color: agentColor,
                }
              : undefined
          }
        >
          {ability.platform_scopes.length} scope
          {ability.platform_scopes.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
