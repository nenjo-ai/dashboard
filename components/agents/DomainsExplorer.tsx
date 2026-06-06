"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useDomains } from "@/lib/hooks";
import {
  createDomain,
  deleteDomain,
  moveDomain,
  deleteDomainFolder,
  renameDomainFolder,
} from "@/lib/api";
import { DomainEditorInline } from "./DomainEditorInline";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { manifestResourceDisplayPath } from "@/lib/manifestResourcePath";
import type { Domain } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tree structure types
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

function canManageDomain(domain: Domain): boolean {
  return !domain.is_system && !domain.read_only && domain.source_type !== "package";
}

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
    const displayPath = manifestResourceDisplayPath(domain);
    if (displayPath) {
      const folder = getOrCreateFolder(displayPath);
      folder.children.push({ type: "file", domain });
    } else {
      rootItems.push({ type: "file", domain });
    }
  }

  folderMap.forEach((node, path) => {
    if (!path.includes("/")) {
      if (!rootFolders.has(path)) {
        rootFolders.add(path);
        rootItems.push(node);
      }
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
// Draggable file node
// ---------------------------------------------------------------------------

function DraggableFile({
  domain,
  isSelected,
  onClick,
  onContextMenu,
  depth,
}: {
  domain: Domain;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  depth: number;
}) {
  const canDrag = canManageDomain(domain);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: domain.id,
    data: { type: "domain", domain },
    disabled: !canDrag,
  });

  return (
    <button
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${
        isSelected
          ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
          : "theme-text hover:[background:var(--app-hover)]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {/* Globe icon */}
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
          d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
        />
      </svg>
      <span className="truncate text-xs">{domain.display_name || domain.name}</span>
      {domain.is_system && (
        <svg
          className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600"
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
      {!domain.is_system && !canDrag && (
        <span className="theme-surface-muted theme-text-muted shrink-0 rounded px-1 py-0.5 text-[9px] font-medium">
          Read-only
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Droppable folder node
// ---------------------------------------------------------------------------

function DroppableFolder({
  folder,
  selectedId,
  onSelect,
  depth,
  expanded,
  onToggle,
  onContextMenu,
  onFileContextMenu,
}: {
  folder: FolderNode;
  selectedId: string | null;
  onSelect: (domain: Domain) => void;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: FolderNode) => void;
  onFileContextMenu: (e: React.MouseEvent, domain: Domain) => void;
}) {
  const isExpanded = expanded.has(folder.path);
  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  return (
    <div ref={setNodeRef}>
      <button
        type="button"
        onClick={() => onToggle(folder.path)}
        onContextMenu={(e) => onContextMenu(e, folder)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
          isOver
            ? "bg-teal-100 dark:bg-teal-900/40"
            : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <svg
          className={`theme-text-muted h-3 w-3 shrink-0 transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <svg
          className={`h-3.5 w-3.5 shrink-0 ${
            isExpanded
              ? "text-teal-500 dark:text-teal-400"
              : "theme-text-muted"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          {isExpanded ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          )}
        </svg>
        <span className="theme-text truncate text-xs font-medium">
          {folder.name}
        </span>
        {folder.isSystem && (
          <svg className="theme-text-muted h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
      </button>
      {isExpanded && (
        <TreeNodeList
          entries={folder.children}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onFolderContextMenu={onContextMenu}
          onFileContextMenu={onFileContextMenu}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive tree list
// ---------------------------------------------------------------------------

function TreeNodeList({
  entries,
  selectedId,
  onSelect,
  depth,
  expanded,
  onToggle,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  entries: TreeEntry[];
  selectedId: string | null;
  onSelect: (domain: Domain) => void;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: FolderNode) => void;
  onFileContextMenu: (e: React.MouseEvent, domain: Domain) => void;
}) {
  return (
    <div>
      {entries.map((entry) => {
        if (entry.type === "folder") {
          return (
            <DroppableFolder
              key={`folder:${entry.path}`}
              folder={entry}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth}
              expanded={expanded}
              onToggle={onToggle}
              onContextMenu={onFolderContextMenu}
              onFileContextMenu={onFileContextMenu}
            />
          );
        }
        return (
          <DraggableFile
            key={entry.domain.id}
            domain={entry.domain}
            isSelected={selectedId === entry.domain.id}
            onClick={() => onSelect(entry.domain)}
            onContextMenu={(e) => onFileContextMenu(e, entry.domain)}
            depth={depth}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root droppable
// ---------------------------------------------------------------------------

function RootDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "folder:",
    data: { type: "folder", path: "" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto py-1 transition-colors ${
        isOver ? "bg-teal-50/50 dark:bg-teal-900/10" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function ContextMenu({
  x,
  y,
  folder,
  onClose,
  onRename,
  onDelete,
}: {
  x: number;
  y: number;
  folder: FolderNode;
  onClose: () => void;
  onRename: (folder: FolderNode) => void;
  onDelete: (folder: FolderNode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="theme-surface-elevated theme-border fixed z-50 w-40 rounded-lg border py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {!folder.isSystem && (
        <>
          <button
            type="button"
            className="theme-text flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:[background:var(--app-hover)]"
            onClick={() => { onRename(folder); onClose(); }}
          >
            Rename
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-flag-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            onClick={() => { onDelete(folder); onClose(); }}
          >
            Delete folder
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File context menu (right-click on domain)
// ---------------------------------------------------------------------------

function FileContextMenu({
  x,
  y,
  domain,
  onClose,
  onMoveTo,
  onDelete,
}: {
  x: number;
  y: number;
  domain: Domain;
  onClose: () => void;
  onMoveTo: (domain: Domain) => void;
  onDelete: (domain: Domain) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const canManage = canManageDomain(domain);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="theme-surface-elevated theme-border fixed z-50 w-40 rounded-lg border py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      {canManage ? (
        <>
          <button
            type="button"
            className="theme-text flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:[background:var(--app-hover)]"
            onClick={() => onMoveTo(domain)}
          >
            Move to...
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-flag-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            onClick={() => onDelete(domain)}
          >
            Delete
          </button>
        </>
      ) : (
        <div className="theme-text-muted px-3 py-1.5 text-xs">
          Managed domain
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main explorer component
// ---------------------------------------------------------------------------

const STORAGE_KEY_EXPANDED = "nenjo:domains:expanded";
const STORAGE_KEY_SELECTED = "nenjo:domains:selected";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPANDED);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* */ }
  return new Set(["nenjo", "nenjo/platform"]);
}

function saveExpanded(set: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(Array.from(set))); } catch { /* */ }
}

function loadSelectedId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY_SELECTED); } catch { return null; }
}

function saveSelectedId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY_SELECTED, id);
    else localStorage.removeItem(STORAGE_KEY_SELECTED);
  } catch { /* */ }
}

export function DomainsExplorer() {
  const { domains, isLoading, isError, mutate } = useDomains();
  const searchParams = useSearchParams();
  const [selectedDomain, setSelectedDomainRaw] = useState<Domain | null>(null);
  const [expanded, setExpandedRaw] = useState<Set<string>>(loadExpanded);
  const [didRestore, setDidRestore] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<Domain | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<FolderNode | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<FolderNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folder: FolderNode } | null>(null);
  const [draggingDomain, setDraggingDomain] = useState<Domain | null>(null);
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; domain: Domain } | null>(null);
  const [movingDomain, setMovingDomain] = useState<Domain | null>(null);

  // Persist expanded/selected state
  const setSelectedDomain = useCallback((d: Domain | null) => {
    setSelectedDomainRaw(d);
    saveSelectedId(d?.id ?? null);
  }, []);

  const setExpanded: React.Dispatch<React.SetStateAction<Set<string>>> = useCallback((updater) => {
    setExpandedRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveExpanded(next);
      return next;
    });
  }, []);

  // Restore selected domain from URL or localStorage when data loads
  useEffect(() => {
    if (didRestore || !domains?.length) return;
    const domainParam = searchParams.get("domain");
    const savedId = loadSelectedId();
    const targetId = domainParam
      ? domains.find(
          (domain) =>
            domain.id === domainParam ||
            domain.name === domainParam ||
            domain.display_name === domainParam,
        )?.id
      : savedId;
    if (targetId) {
      const match = domains.find((d) => d.id === targetId);
      if (match) {
        setSelectedDomainRaw(match);
        const displayPath = manifestResourceDisplayPath(match);
        if (displayPath) {
          const parts = displayPath.split("/");
          setExpandedRaw((prev) => {
            const next = new Set(prev);
            for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
            return next;
          });
        }
      }
    }
    setDidRestore(true);
  }, [domains, didRestore, searchParams]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tree = useMemo(() => {
    const items = domains ?? [];
    const builtTree = buildTree(items);

    for (const folderPath of localFolders) {
      const parts = folderPath.split("/");
      const alreadyExists = items.some(
        (d) => {
          const displayPath = manifestResourceDisplayPath(d);
          return (
            displayPath === folderPath ||
            displayPath.startsWith(folderPath + "/")
          );
        },
      );
      if (!alreadyExists && parts.length === 1) {
        builtTree.push({
          type: "folder",
          name: parts[0],
          path: folderPath,
          children: [],
          isSystem: false,
        });
      }
    }

    return builtTree;
  }, [domains, localFolders]);

  const currentSelected = useMemo(() => {
    if (!selectedDomain || !domains) return selectedDomain;
    return domains.find((d) => d.id === selectedDomain.id) ?? null;
  }, [domains, selectedDomain]);

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, [setExpanded]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "domain") {
      const domain = active.data.current.domain as Domain;
      if (canManageDomain(domain)) setDraggingDomain(domain);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDraggingDomain(null);
      const { active, over } = event;
      if (!over) return;
      const domainId = active.id as string;
      const overId = over.id as string;
      if (!overId.startsWith("folder:")) return;
      const newPath = overId.replace("folder:", "");
      const domain = domains?.find((d) => d.id === domainId);
      if (!domain || !canManageDomain(domain) || domain.path === newPath) return;
      try {
        await moveDomain(domainId, newPath);
        mutate();
        if (newPath) {
          setExpanded((prev) => { const next = new Set(prev); next.add(newPath); return next; });
        }
      } catch { /* */ }
    },
    [domains, mutate, setExpanded],
  );

  const handleDeleteDomain = async () => {
    if (!confirmDeleteDomain) return;
    if (!canManageDomain(confirmDeleteDomain)) {
      setConfirmDeleteDomain(null);
      return;
    }
    setDeletingId(confirmDeleteDomain.id);
    try {
      await deleteDomain(confirmDeleteDomain.id);
      if (selectedDomain?.id === confirmDeleteDomain.id) setSelectedDomain(null);
      mutate();
    } catch { /* */ } finally {
      setDeletingId(null);
      setConfirmDeleteDomain(null);
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) return;
    try {
      await deleteDomainFolder(confirmDeleteFolder.path);
      setLocalFolders((prev) => prev.filter((f) => f !== confirmDeleteFolder.path));
      mutate();
    } catch { /* */ } finally {
      setConfirmDeleteFolder(null);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim()) return;
    const newPath = renamingFolder.path.includes("/")
      ? renamingFolder.path.split("/").slice(0, -1).join("/") + "/" + renameValue.trim()
      : renameValue.trim();
    try {
      await renameDomainFolder(renamingFolder.path, newPath);
      mutate();
    } catch { /* */ } finally {
      setRenamingFolder(null);
      setRenameValue("");
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const sanitized = newFolderName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    setLocalFolders((prev) => [...prev, sanitized]);
    setExpanded((prev) => { const next = new Set(prev); next.add(sanitized); return next; });
    setNewFolderOpen(false);
    setNewFolderName("");
  };

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, folder: FolderNode) => {
      e.preventDefault();
      setFileContextMenu(null);
      setContextMenu({ x: e.clientX, y: e.clientY, folder });
    },
    [],
  );

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, domain: Domain) => {
      e.preventDefault();
      setContextMenu(null);
      setFileContextMenu({ x: e.clientX, y: e.clientY, domain });
    },
    [],
  );

  const handleMoveDomain = useCallback(
    async (domainId: string, newPath: string) => {
      const domain = domains?.find((d) => d.id === domainId);
      if (!domain || !canManageDomain(domain)) {
        setMovingDomain(null);
        return;
      }
      try {
        await moveDomain(domainId, newPath);
        mutate();
        if (newPath) {
          setExpanded((prev) => { const next = new Set(prev); next.add(newPath); return next; });
        }
      } catch { /* */ }
      setMovingDomain(null);
    },
    [domains, mutate, setExpanded],
  );

  if (isLoading) {
    return (
      <div className="theme-border theme-surface flex rounded-xl border" style={{ height: "calc(100dvh - 200px)" }}>
        <div className="theme-border w-64 border-r p-3">
          <Skeleton className="mb-3 h-4 w-24" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-6 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
        <h3 className="theme-text mt-4 text-lg font-semibold">Failed to load domains</h3>
        <p className="theme-text-muted mt-2 text-sm">Please check your connection and try again.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="theme-border theme-surface flex min-h-[400px] flex-1 overflow-hidden rounded-xl border" style={{ height: "calc(100dvh - 200px)" }}>
        {/* Left panel - File tree */}
        <div className="theme-border theme-surface-muted flex w-64 shrink-0 flex-col border-r">
          <div className="theme-border flex items-center justify-between border-b px-3 py-2">
            <span className="theme-text-muted text-xs font-semibold uppercase tracking-wider">
              Domains
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className="theme-text-muted rounded p-1 transition-colors hover:[background:var(--app-hover)] hover:[color:var(--app-text)]"
                title="New folder"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="theme-text-muted rounded p-1 transition-colors hover:[background:var(--app-hover)] hover:[color:var(--app-text)]"
                title="New domain"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>

          <RootDroppable>
            {(!domains || domains.length === 0) && localFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8">
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">No domains yet</p>
              </div>
            ) : (
              <TreeNodeList
                entries={tree}
                selectedId={currentSelected?.id ?? null}
                onSelect={setSelectedDomain}
                depth={0}
                expanded={expanded}
                onToggle={toggleFolder}
                onFolderContextMenu={handleFolderContextMenu}
                onFileContextMenu={handleFileContextMenu}
              />
            )}
          </RootDroppable>
        </div>

        {/* Right panel - Editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {currentSelected ? (
            <DomainEditorInline
              key={currentSelected.id}
              domain={currentSelected}
              onSaved={() => mutate()}
              onDelete={
                currentSelected.is_system
                  ? undefined
                  : () => setConfirmDeleteDomain(currentSelected)
              }
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              <p className="text-sm">Select a domain to edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggingDomain && (
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 shadow-lg dark:border-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
            {draggingDomain.display_name || draggingDomain.name}
          </div>
        )}
      </DragOverlay>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          folder={contextMenu.folder}
          onClose={() => setContextMenu(null)}
          onRename={(f) => { setRenamingFolder(f); setRenameValue(f.name); }}
          onDelete={(f) => setConfirmDeleteFolder(f)}
        />
      )}

      {/* File context menu (right-click on domain) */}
      {fileContextMenu && (
        <FileContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          domain={fileContextMenu.domain}
          onClose={() => setFileContextMenu(null)}
          onMoveTo={(d) => { setMovingDomain(d); setFileContextMenu(null); }}
          onDelete={(d) => { setConfirmDeleteDomain(d); setFileContextMenu(null); }}
        />
      )}

      {/* Move to folder modal */}
      {movingDomain && (
        <Modal open onClose={() => setMovingDomain(null)} title={`Move "${movingDomain.display_name || movingDomain.name}"`}>
          <div className="space-y-1">
            {getAllFolderPaths(tree)
              .filter((f) => f !== "nenjo" && !f.startsWith("nenjo/"))
              .map((folderPath) => (
                <button
                  key={folderPath}
                  type="button"
                  onClick={() => handleMoveDomain(movingDomain.id, folderPath)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    movingDomain.path === folderPath
                      ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <span className="font-mono text-xs">{folderPath || "(root)"}</span>
                  {movingDomain.path === folderPath && (
                    <span className="ml-auto text-[10px] text-teal-500">current</span>
                  )}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {/* Confirm delete domain */}
      <ConfirmDialog
        open={!!confirmDeleteDomain}
        onClose={() => setConfirmDeleteDomain(null)}
        onConfirm={handleDeleteDomain}
        title="Delete Domain"
        message={`Delete domain "${confirmDeleteDomain?.display_name || confirmDeleteDomain?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        loading={!!deletingId}
      />

      {/* Confirm delete folder */}
      <ConfirmDialog
        open={!!confirmDeleteFolder}
        onClose={() => setConfirmDeleteFolder(null)}
        onConfirm={handleDeleteFolder}
        title="Delete Folder"
        message={`Delete folder "${confirmDeleteFolder?.name}" and all domains inside it?`}
        confirmLabel="Delete All"
        variant="danger"
      />

      {/* Rename folder modal */}
      {renamingFolder && (
        <Modal open onClose={() => setRenamingFolder(null)} title="Rename Folder">
          <form onSubmit={(e) => { e.preventDefault(); handleRenameFolder(); }} className="space-y-4">
            <div>
              <Label htmlFor="rename-folder">New name</Label>
              <Input
                id="rename-folder"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRenamingFolder(null)}>Cancel</Button>
              <Button type="submit" disabled={!renameValue.trim()}>Rename</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <Modal open onClose={() => setNewFolderOpen(false)} title="New Folder">
          <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="space-y-4">
            <div>
              <Label htmlFor="new-folder-name">Folder name</Label>
              <Input
                id="new-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="custom"
                className="font-mono"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lowercase letters, numbers, and underscores only</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newFolderName.trim()}>Create Folder</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create domain modal */}
      <CreateDomainModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { mutate(); setCreateOpen(false); }}
        folders={getAllFolderPaths(tree)}
      />
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Helper: get all folder paths
// ---------------------------------------------------------------------------

function getAllFolderPaths(entries: TreeEntry[]): string[] {
  const paths: string[] = [""];
  const walk = (items: TreeEntry[]) => {
    for (const entry of items) {
      if (entry.type === "folder") {
        paths.push(entry.path);
        walk(entry.children);
      }
    }
  };
  walk(entries);
  return paths;
}

// ---------------------------------------------------------------------------
// Create domain modal (with path selector)
// ---------------------------------------------------------------------------

function CreateDomainModal({
  open,
  onClose,
  onSaved,
  folders,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  folders: string[];
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    setSaving(true);
    try {
      const cmd = command.trim().startsWith("#") ? command.trim() : `#${command.trim()}`;
      await createDomain({
        name: name.trim(),
        path: path || undefined,
        display_name: displayName.trim() || name.trim(),
        command: cmd,
        description: description.trim() || undefined,
      });
      setName("");
      setPath("");
      setDisplayName("");
      setCommand("");
      setDescription("");
      onSaved();
    } catch { /* */ } finally {
      setSaving(false);
    }
  };

  const availableFolders = folders.filter((f) => f !== "nenjo" && !f.startsWith("nenjo/"));

  return (
    <Modal open={open} onClose={onClose} title="Create Domain">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="dm-name">Name</Label>
          <Input
            id="dm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="task_creator"
            required
            className="font-mono"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            System identifier for this domain.
          </p>
        </div>
        <div>
          <Label htmlFor="dm-path">Folder</Label>
          <select
            id="dm-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">(root)</option>
            {availableFolders.map((f) => (
              <option key={f} value={f}>{f || "(root)"}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="dm-display">Display Name</Label>
          <Input id="dm-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Task Creator" />
        </div>
        <div>
          <Label htmlFor="dm-command">Command</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm font-mono text-gray-500 dark:text-gray-400">#</span>
            <Input
              id="dm-command"
              value={command.replace(/^#/, "")}
              onChange={(e) => setCommand(e.target.value.replace(/^#/, ""))}
              placeholder="creator"
              required
              className="font-mono"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The command to activate this domain in chat.
          </p>
        </div>
        <div>
          <Label htmlFor="dm-desc">Description</Label>
          <Textarea id="dm-desc" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} placeholder="What this domain does..." rows={2} maxLength={280} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim() || !command.trim()}>{saving ? "Creating..." : "Create Domain"}</Button>
        </div>
      </form>
    </Modal>
  );
}
