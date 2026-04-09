"use client";

import { useState, useMemo, useCallback } from "react";
import { useDomains, useAgentDomains } from "@/lib/hooks";
import { assignDomainToAgent, removeDomainFromAgent, toggleAgentDomain } from "@/lib/api";
import type { Domain } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tree types (same as DomainsExplorer)
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
  domain: Domain;
}

type TreeEntry = FolderNode | FileNode;

function buildTree(domains: Domain[]): TreeEntry[] {
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
      if (!parent.children.some((c) => c.type === "folder" && c.path === path)) {
        parent.children.push(node);
      }
    }
    return node;
  };

  const rootItems: TreeEntry[] = [];
  const rootFolders = new Set<string>();

  for (const domain of domains) {
    if (domain.path) {
      const folder = getOrCreateFolder(domain.path);
      folder.children.push({ type: "file", domain });
    } else {
      rootItems.push({ type: "file", domain });
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
      const nameA = a.type === "folder" ? a.name : a.domain.name;
      const nameB = b.type === "folder" ? b.name : b.domain.name;
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

const STORAGE_KEY = "nenjo:agent-domains:expanded";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* */ }
  return new Set(["nenjo", "nenjo/platform"]);
}

function saveExpanded(set: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch { /* */ }
}

// ---------------------------------------------------------------------------
// Assignment state type
// ---------------------------------------------------------------------------

type AssignmentState = "unassigned" | "enabled" | "disabled";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AgentDomainsTabProps {
  agentId: string;
}

export function AgentDomainsTab({ agentId }: AgentDomainsTabProps) {
  const { domains: allDomains, isLoading: domainsLoading } = useDomains();
  const { agentDomains, isLoading: assignmentsLoading, mutate } = useAgentDomains(agentId);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expanded, setExpandedRaw] = useState<Set<string>>(loadExpanded);

  const isLoading = domainsLoading || assignmentsLoading;

  // Build maps for assignment lookup
  const assignmentMap = useMemo(() => {
    const map = new Map<string, { assigned: boolean; enabled: boolean }>();
    if (agentDomains) {
      for (const ad of agentDomains) {
        map.set(ad.domain_id, { assigned: true, enabled: ad.enabled });
      }
    }
    return map;
  }, [agentDomains]);

  const assignedCount = useMemo(() => {
    return agentDomains?.length ?? 0;
  }, [agentDomains]);

  const tree = useMemo(() => buildTree(allDomains ?? []), [allDomains]);

  const setExpanded: React.Dispatch<React.SetStateAction<Set<string>>> = useCallback((updater) => {
    setExpandedRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveExpanded(next);
      return next;
    });
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, [setExpanded]);

  const getState = useCallback((domainId: string): AssignmentState => {
    const entry = assignmentMap.get(domainId);
    if (!entry) return "unassigned";
    return entry.enabled ? "enabled" : "disabled";
  }, [assignmentMap]);

  const handleToggle = useCallback(async (domain: Domain) => {
    if (toggling) return;
    setToggling(domain.id);
    try {
      const state = getState(domain.id);
      if (state === "unassigned") {
        // Assign and enable
        await assignDomainToAgent(agentId, domain.id);
      } else if (state === "enabled") {
        // Disable
        await toggleAgentDomain(agentId, domain.id, false);
      } else {
        // disabled -> unassign
        await removeDomainFromAgent(agentId, domain.id);
      }
      mutate();
    } catch { /* */ } finally {
      setToggling(null);
    }
  }, [agentId, toggling, getState, mutate]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  if (!allDomains || allDomains.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No domains available. Create domains in the Domains section first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Assign Domains
        </span>
        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
          {assignedCount} assigned
        </span>
      </div>
      <div className="p-2">
        <TreeNodeList
          entries={tree}
          expanded={expanded}
          onToggle={toggleFolder}
          getState={getState}
          togglingId={toggling}
          onToggleAssignment={handleToggle}
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
  getState,
  togglingId,
  onToggleAssignment,
  depth = 0,
}: {
  entries: TreeEntry[];
  expanded: Set<string>;
  onToggle: (path: string) => void;
  getState: (domainId: string) => AssignmentState;
  togglingId: string | null;
  onToggleAssignment: (domain: Domain) => void;
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
              getState={getState}
              togglingId={togglingId}
              onToggleAssignment={onToggleAssignment}
            />
          );
        }
        return (
          <DomainRow
            key={entry.domain.id}
            domain={entry.domain}
            depth={depth}
            state={getState(entry.domain.id)}
            isProcessing={togglingId === entry.domain.id}
            onToggle={() => onToggleAssignment(entry.domain)}
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
  getState,
  togglingId,
  onToggleAssignment,
}: {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  getState: (domainId: string) => AssignmentState;
  togglingId: string | null;
  onToggleAssignment: (domain: Domain) => void;
}) {
  const isExpanded = expanded.has(folder.path);

  // Count assigned domains in this folder (recursive)
  const countAssigned = (entries: TreeEntry[]): number => {
    let count = 0;
    for (const e of entries) {
      if (e.type === "file" && getState(e.domain.id) !== "unassigned") count++;
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
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <svg
          className={`h-3.5 w-3.5 shrink-0 ${isExpanded ? "text-teal-500 dark:text-teal-400" : "text-gray-400 dark:text-gray-500"}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
        >
          {isExpanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          )}
        </svg>
        <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {folder.name}
        </span>
        {folder.isSystem && (
          <svg className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
          {assignedCount}/{totalCount}
        </span>
      </button>
      {isExpanded && (
        <TreeNodeList
          entries={folder.children}
          expanded={expanded}
          onToggle={onToggle}
          getState={getState}
          togglingId={togglingId}
          onToggleAssignment={onToggleAssignment}
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

function DomainRow({
  domain,
  depth,
  state,
  isProcessing,
  onToggle,
}: {
  domain: Domain;
  depth: number;
  state: AssignmentState;
  isProcessing: boolean;
  onToggle: () => void;
}) {
  // Three-state toggle colors
  const toggleColor = state === "enabled"
    ? "bg-teal-500"
    : state === "disabled"
      ? "bg-amber-400"
      : "bg-gray-300 dark:bg-gray-600";

  const knobPosition = state === "enabled"
    ? "left-[16px]"
    : state === "disabled"
      ? "left-[8px]"
      : "left-0.5";

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
        state === "enabled"
          ? "bg-teal-50/50 dark:bg-teal-900/10"
          : state === "disabled"
            ? "bg-amber-50/50 dark:bg-amber-900/10"
            : ""
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {/* Three-state toggle */}
      <button
        onClick={onToggle}
        disabled={isProcessing}
        title={state === "unassigned" ? "Assign & enable" : state === "enabled" ? "Disable" : "Unassign"}
        className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${toggleColor} ${isProcessing ? "opacity-50" : ""}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${knobPosition}`} />
      </button>

      {/* Globe icon */}
      <svg className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate block">
          {domain.display_name || domain.name}
        </span>
        {domain.category && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1 block">
            {domain.category}
          </span>
        )}
      </div>

      {/* Command badge */}
      <span className="shrink-0 rounded-sm bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium font-mono text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
        {domain.command}
      </span>

      {/* State label */}
      {state === "disabled" && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          disabled
        </span>
      )}
    </div>
  );
}
