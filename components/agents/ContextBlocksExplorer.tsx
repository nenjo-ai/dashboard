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
import { useContextBlocks } from "@/lib/hooks";
import {
  deleteContextBlock,
  createContextBlock,
  moveContextBlock,
  deleteFolder,
  renameFolder,
} from "@/lib/api";
import { ContextBlockEditorInline } from "./ContextBlockEditor";
import { JinjaGuide } from "./TemplateVariableReference";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import JSZip from "jszip";
import type { ContextBlock } from "@/lib/types";

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
  block: ContextBlock;
}

type TreeEntry = FolderNode | FileNode;

function buildTree(blocks: ContextBlock[]): TreeEntry[] {
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

    // Ensure parent exists
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

  for (const block of blocks) {
    if (block.path) {
      const folder = getOrCreateFolder(block.path);
      folder.children.push({ type: "file", block });
    } else {
      rootItems.push({ type: "file", block });
    }
  }

  // Collect top-level folders
  folderMap.forEach((node, path) => {
    if (!path.includes("/")) {
      if (!rootFolders.has(path)) {
        rootFolders.add(path);
        rootItems.push(node);
      }
    }
  });

  // Sort: folders first, then files alphabetically
  const sortEntries = (entries: TreeEntry[]) => {
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      const nameA = a.type === "folder" ? a.name : a.block.name;
      const nameB = b.type === "folder" ? b.name : b.block.name;
      return nameA.localeCompare(nameB);
    });
    for (const entry of entries) {
      if (entry.type === "folder") sortEntries(entry.children);
    }
  };

  sortEntries(rootItems);
  return rootItems;
}

function pathToDotted(path: string, name: string): string {
  if (!path) return name;
  return `${path.replace(/\//g, ".")}.${name}`;
}

function collectBlocks(entries: TreeEntry[]): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      blocks.push(entry.block);
    } else {
      blocks.push(...collectBlocks(entry.children));
    }
  }
  return blocks;
}

async function downloadFolderAsZip(folder: FolderNode) {
  const blocks = collectBlocks(folder.children);
  if (blocks.length === 0) return;
  const zip = new JSZip();
  for (const block of blocks) {
    const relativePath = block.path.startsWith(folder.path + "/")
      ? block.path.slice(folder.path.length + 1)
      : block.path === folder.path
        ? ""
        : block.path;
    const filePath = relativePath
      ? `${relativePath}/${block.name}.md`
      : `${block.name}.md`;
    zip.file(filePath, block.template ?? "");
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folder.name}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Draggable file node
// ---------------------------------------------------------------------------

function DraggableFile({
  block,
  isSelected,
  onClick,
  depth,
}: {
  block: ContextBlock;
  isSelected: boolean;
  onClick: () => void;
  depth: number;
}) {
  const canDrag = !block.is_system;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    disabled: !canDrag,
    data: { type: "block", block },
  });

  return (
    <button
      ref={setNodeRef}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${
        isSelected
          ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
          : "theme-text hover:[background:var(--app-hover)]"
      }`}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {/* File icon */}
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
          d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
        />
      </svg>
      <span className="truncate text-xs">{block.display_name || block.name}</span>
      {block.is_system && (
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
    </button>
  );
}

// ---------------------------------------------------------------------------
// Droppable folder node
// ---------------------------------------------------------------------------

function DroppableFolder({
  folder,
  selectedBlockId,
  onSelectBlock,
  depth,
  expanded,
  onToggle,
  onContextMenu,
}: {
  folder: FolderNode;
  selectedBlockId: string | null;
  onSelectBlock: (block: ContextBlock) => void;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: FolderNode) => void;
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
        {/* Chevron */}
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
        {/* Folder icon */}
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
            className="theme-text-muted h-3 w-3 shrink-0"
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
      </button>
      {isExpanded && (
        <TreeNodeList
          entries={folder.children}
          selectedBlockId={selectedBlockId}
          onSelectBlock={onSelectBlock}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onFolderContextMenu={onContextMenu}
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
  selectedBlockId,
  onSelectBlock,
  depth,
  expanded,
  onToggle,
  onFolderContextMenu,
}: {
  entries: TreeEntry[];
  selectedBlockId: string | null;
  onSelectBlock: (block: ContextBlock) => void;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: FolderNode) => void;
}) {
  return (
    <div>
      {entries.map((entry) => {
        if (entry.type === "folder") {
          return (
            <DroppableFolder
              key={`folder:${entry.path}`}
              folder={entry}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              depth={depth}
              expanded={expanded}
              onToggle={onToggle}
              onContextMenu={onFolderContextMenu}
            />
          );
        }
        return (
          <DraggableFile
            key={entry.block.id}
            block={entry.block}
            isSelected={selectedBlockId === entry.block.id}
            onClick={() => onSelectBlock(entry.block)}
            depth={depth}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root droppable (for dropping to root path "")
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
  onDownload,
}: {
  x: number;
  y: number;
  folder: FolderNode;
  onClose: () => void;
  onRename: (folder: FolderNode) => void;
  onDelete: (folder: FolderNode) => void;
  onDownload: (folder: FolderNode) => void;
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
      <button
        type="button"
        className="theme-text flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:[background:var(--app-hover)]"
        onClick={() => { onDownload(folder); onClose(); }}
      >
        Download as .zip
      </button>
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
// Main explorer component
// ---------------------------------------------------------------------------

const CB_STORAGE_EXPANDED = "nenjo:contextblocks:expanded";
const CB_STORAGE_SELECTED = "nenjo:contextblocks:selected";

function loadCbExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(CB_STORAGE_EXPANDED);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* */ }
  return new Set(["nenjo"]);
}

function saveCbExpanded(set: Set<string>) {
  try { localStorage.setItem(CB_STORAGE_EXPANDED, JSON.stringify(Array.from(set))); } catch { /* */ }
}

function loadCbSelectedId(): string | null {
  try { return localStorage.getItem(CB_STORAGE_SELECTED); } catch { return null; }
}

function saveCbSelectedId(id: string | null) {
  try {
    if (id) localStorage.setItem(CB_STORAGE_SELECTED, id);
    else localStorage.removeItem(CB_STORAGE_SELECTED);
  } catch { /* */ }
}

export function ContextBlocksExplorer() {
  const { contextBlocks, isLoading, isError, mutate } = useContextBlocks();
  const searchParams = useSearchParams();
  const [selectedBlock, setSelectedBlockRaw] = useState<ContextBlock | null>(null);
  const [expanded, setExpandedRaw] = useState<Set<string>>(loadCbExpanded);
  const [didAutoSelect, setDidAutoSelect] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<ContextBlock | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<FolderNode | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<FolderNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folder: FolderNode } | null>(null);
  const [draggingBlock, setDraggingBlock] = useState<ContextBlock | null>(null);
  const [localFolders, setLocalFolders] = useState<string[]>([]);

  // Persisting wrappers
  const setSelectedBlock = useCallback((b: ContextBlock | null) => {
    setSelectedBlockRaw(b);
    saveCbSelectedId(b?.id ?? null);
  }, []);

  const setExpanded: React.Dispatch<React.SetStateAction<Set<string>>> = useCallback((updater) => {
    setExpandedRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCbExpanded(next);
      return next;
    });
  }, []);

  // Auto-select block from ?block= query param or localStorage
  useEffect(() => {
    if (didAutoSelect || !contextBlocks?.length) return;

    // URL param takes priority
    const blockParam = searchParams.get("block");
    const savedId = loadCbSelectedId();
    const targetId = blockParam
      ? contextBlocks.find((b) => b.name === blockParam)?.id
      : savedId;

    if (targetId) {
      const match = contextBlocks.find((b) => b.id === targetId);
      if (match) {
        setSelectedBlockRaw(match);
        if (match.path) {
          const parts = match.path.split("/");
          setExpandedRaw((prev) => {
            const next = new Set(prev);
            for (let i = 1; i <= parts.length; i++) {
              next.add(parts.slice(0, i).join("/"));
            }
            return next;
          });
        }
      }
    }
    setDidAutoSelect(true);
  }, [contextBlocks, searchParams, didAutoSelect]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const tree = useMemo(() => {
    const blocks = contextBlocks ?? [];
    const builtTree = buildTree(blocks);

    // Add local-only empty folders
    for (const folderPath of localFolders) {
      const parts = folderPath.split("/");
      // Check if folder already exists in the tree (has blocks)
      const alreadyExists = blocks.some(
        (b) => b.path === folderPath || b.path.startsWith(folderPath + "/"),
      );
      if (!alreadyExists) {
        // Add as top-level if single segment, otherwise find parent
        if (parts.length === 1) {
          builtTree.push({
            type: "folder",
            name: parts[0],
            path: folderPath,
            children: [],
            isSystem: false,
          });
        }
      }
    }

    return builtTree;
  }, [contextBlocks, localFolders]);

  // When blocks change, update selected block if it was updated
  const currentSelectedBlock = useMemo(() => {
    if (!selectedBlock || !contextBlocks) return selectedBlock;
    return contextBlocks.find((b) => b.id === selectedBlock.id) ?? null;
  }, [contextBlocks, selectedBlock]);

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "block") {
      setDraggingBlock(active.data.current.block as ContextBlock);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDraggingBlock(null);
      const { active, over } = event;
      if (!over) return;

      const blockId = active.id as string;
      const overId = over.id as string;
      if (!overId.startsWith("folder:")) return;

      const newPath = overId.replace("folder:", "");
      const block = contextBlocks?.find((b) => b.id === blockId);
      if (!block || block.path === newPath) return;

      try {
        await moveContextBlock(blockId, newPath);
        mutate();
        // Expand target folder
        if (newPath) {
          setExpanded((prev) => { const next = new Set(prev); next.add(newPath); return next; });
        }
      } catch {
        /* silently fail */
      }
    },
    [contextBlocks, mutate],
  );

  const handleDeleteBlock = async () => {
    if (!confirmDeleteBlock) return;
    setDeletingId(confirmDeleteBlock.id);
    try {
      await deleteContextBlock(confirmDeleteBlock.id);
      if (selectedBlock?.id === confirmDeleteBlock.id) setSelectedBlock(null);
      mutate();
    } catch {
      /* silently fail */
    } finally {
      setDeletingId(null);
      setConfirmDeleteBlock(null);
    }
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) return;
    try {
      await deleteFolder(confirmDeleteFolder.path);
      setLocalFolders((prev) => prev.filter((f) => f !== confirmDeleteFolder.path));
      mutate();
    } catch {
      /* silently fail */
    } finally {
      setConfirmDeleteFolder(null);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim()) return;
    const newPath = renamingFolder.path.includes("/")
      ? renamingFolder.path.split("/").slice(0, -1).join("/") + "/" + renameValue.trim()
      : renameValue.trim();
    try {
      await renameFolder(renamingFolder.path, newPath);
      mutate();
    } catch {
      /* silently fail */
    } finally {
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
      setContextMenu({ x: e.clientX, y: e.clientY, folder });
    },
    [],
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
        <h3 className="theme-text mt-4 text-lg font-semibold">
          Failed to load context blocks
        </h3>
        <p className="theme-text-muted mt-2 text-sm">
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="theme-border theme-surface flex min-h-[400px] flex-1 overflow-hidden rounded-xl border" style={{ height: "calc(100dvh - 200px)" }}>
        {/* Left panel — File tree */}
        <div className="theme-border theme-surface-muted flex w-64 shrink-0 flex-col border-r">
          {/* Toolbar */}
          <div className="theme-border flex items-center justify-between border-b px-3 py-2">
            <span className="theme-text-muted text-xs font-semibold uppercase tracking-wider">
              Context Blocks
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className="rounded p-1 text-gray-400 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
                title="New folder"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded p-1 text-gray-400 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
                title="New block"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tree */}
          <RootDroppable>
            {(!contextBlocks || contextBlocks.length === 0) && localFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8">
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  No context blocks yet
                </p>
              </div>
            ) : (
              <TreeNodeList
                entries={tree}
                selectedBlockId={currentSelectedBlock?.id ?? null}
                onSelectBlock={setSelectedBlock}
                depth={0}
                expanded={expanded}
                onToggle={toggleFolder}
                onFolderContextMenu={handleFolderContextMenu}
              />
            )}
          </RootDroppable>

          <JinjaGuide />
        </div>

        {/* Right panel — Inline editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {currentSelectedBlock ? (
            <ContextBlockEditorInline
              key={currentSelectedBlock.id}
              block={currentSelectedBlock}
              onSaved={() => mutate()}
              onDelete={
                currentSelectedBlock.is_system
                  ? undefined
                  : () => setConfirmDeleteBlock(currentSelectedBlock)
              }
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                />
              </svg>
              <p className="text-sm">Select a context block to edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggingBlock && (
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 shadow-lg dark:border-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
            {draggingBlock.display_name || draggingBlock.name}
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
          onRename={(f) => {
            setRenamingFolder(f);
            setRenameValue(f.name);
          }}
          onDelete={(f) => setConfirmDeleteFolder(f)}
          onDownload={(f) => downloadFolderAsZip(f)}
        />
      )}

      {/* Confirm delete block */}
      <ConfirmDialog
        open={!!confirmDeleteBlock}
        onClose={() => setConfirmDeleteBlock(null)}
        onConfirm={handleDeleteBlock}
        title="Delete Context Block"
        message={`Delete context block "${confirmDeleteBlock?.display_name || confirmDeleteBlock?.name}"?`}
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
        message={`Delete folder "${confirmDeleteFolder?.name}" and all blocks inside it?`}
        confirmLabel="Delete All"
        variant="danger"
      />

      {/* Rename folder modal */}
      {renamingFolder && (
        <Modal open onClose={() => setRenamingFolder(null)} title="Rename Folder">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameFolder();
            }}
            className="space-y-4"
          >
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
              <Button type="button" variant="secondary" onClick={() => setRenamingFolder(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Rename
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <Modal open onClose={() => setNewFolderOpen(false)} title="New Folder">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateFolder();
            }}
            className="space-y-4"
          >
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
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNewFolderOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newFolderName.trim()}>
                Create Folder
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create block modal */}
      <CreateContextBlockModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          mutate();
          setCreateOpen(false);
        }}
        folders={getAllFolderPaths(tree)}
      />
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Helper: get all folder paths from tree
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
// Create modal (with path selector)
// ---------------------------------------------------------------------------

function CreateContextBlockModal({
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
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createContextBlock({
        name: name.trim(),
        path: path || undefined,
        display_name: displayName.trim() || undefined,
        description: description.trim() || undefined,
        template: "",
      });
      setName("");
      setPath("");
      setDisplayName("");
      setDescription("");
      onSaved();
    } catch {
      /* silently fail */
    } finally {
      setSaving(false);
    }
  };

  // Filter out system folders
  const availableFolders = folders.filter((f) => f !== "nenjo" && !f.startsWith("nenjo/"));

  return (
    <Modal open={open} onClose={onClose} title="Create Context Block">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="cb-name">Name</Label>
          <Input
            id="cb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="coding_standards"
            required
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="cb-path">Folder</Label>
          <select
            id="cb-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">(root)</option>
            {availableFolders.map((f) => (
              <option key={f} value={f}>
                {f || "(root)"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Reference: <code className="font-mono text-teal-600 dark:text-teal-400">
              {"{{ " + pathToDotted(path, name || "name") + " }}"}
            </code>
          </p>
        </div>
        <div>
          <Label htmlFor="cb-display">Display Name</Label>
          <Input
            id="cb-display"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Coding Standards"
          />
        </div>
        <div>
          <Label htmlFor="cb-desc">Description</Label>
          <Textarea
            id="cb-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 280))}
            placeholder="What this context block provides..."
            rows={2}
            maxLength={280}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{description.length}/280</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Creating..." : "Create Block"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
