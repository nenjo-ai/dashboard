"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDownToLine,
  FileText,
  Folder,
  Link2,
  Loader2,
  PanelRight,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { useKnowledgeItems } from "@/lib/hooks";
import {
  createKnowledgeItem,
  createKnowledgeItemEdge,
  deleteKnowledgeItem,
  deleteKnowledgeItemEdge,
  downloadKnowledgeItemUrl,
  fetchKnowledgeItemContent,
  fetchKnowledgeItemEdges,
  updateKnowledgeItemContent,
  updateKnowledgeItemMetadata,
  uploadKnowledgeItem,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TagInput } from "@/components/ui/TagInput";
import { Textarea } from "@/components/ui/Textarea";
import { ResizeHandle, useResizablePanel } from "@/components/agents/useResizablePanel";
import { cn } from "@/lib/cn";
import type {
  KnowledgeItem,
  KnowledgeItemAuthority,
  KnowledgeItemEdge,
  KnowledgeItemEdgeType,
  KnowledgeItemKind,
} from "@/lib/types";

interface KnowledgeSectionProps {
  packId: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  item?: KnowledgeItem;
}

const ITEM_KINDS: Array<{ value: KnowledgeItemKind; label: string }> = [
  { value: "guide", label: "Guide" },
  { value: "reference", label: "Reference" },
  { value: "taxonomy", label: "Taxonomy" },
  { value: "domain", label: "Domain" },
  { value: "entity", label: "Entity" },
  { value: "policy", label: "Policy" },
];

const ITEM_AUTHORITIES: Array<{ value: KnowledgeItemAuthority; label: string }> = [
  { value: "canonical", label: "Canonical" },
  { value: "supporting", label: "Supporting" },
  { value: "reference", label: "Reference" },
  { value: "draft", label: "Draft" },
  { value: "deprecated", label: "Deprecated" },
];

const ITEM_EDGE_TYPES: Array<{ value: KnowledgeItemEdgeType; label: string }> = [
  { value: "part_of", label: "Part Of" },
  { value: "defines", label: "Defines" },
  { value: "governs", label: "Governs" },
  { value: "classifies", label: "Classifies" },
  { value: "references", label: "References" },
  { value: "depends_on", label: "Depends On" },
  { value: "extends", label: "Extends" },
  { value: "related_to", label: "Related To" },
];

function buildItemTree(items: KnowledgeItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const item of items) {
    const rawPath = item.path?.trim().replace(/^\/+|\/+$/g, "");
    const pathParts = rawPath ? rawPath.split("/").filter(Boolean) : [];
    const filename = item.filename || pathParts.at(-1) || "Untitled";
    const filenameStem = filename.replace(/\.[^/.]+$/, "");
    const pathLooksLikeFile =
      pathParts.length > 0 &&
      (pathParts.at(-1) === filename || pathParts.at(-1) === filenameStem);
    const folderSegments = pathLooksLikeFile ? pathParts.slice(0, -1) : pathParts;
    const leafName = filename;
    let parent = root;

    for (let i = 0; i < folderSegments.length; i += 1) {
      const seg = folderSegments[i];
      const folderPath = folderSegments.slice(0, i + 1).join("/");
      let folder = parent.find((node) => node.path === folderPath && !node.item);
      if (!folder) {
        folder = { name: seg, path: folderPath, children: [] };
        parent.push(folder);
      }
      parent = folder.children;
    }

    parent.push({
      name: leafName,
      path: [...folderSegments, leafName].join("/"),
      children: [],
      item: item,
    });
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => {
        const aFolder = !a.item;
        const bFolder = !b.item;
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));

  return sortNodes(root);
}

function ItemTreeNode({
  node,
  depth,
  selectedItemId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  const isFolder = !node.item;
  const [expanded, setExpanded] = useState(depth < 2);
  const indent = depth * 16 + 8;
  const guides = Array.from({ length: depth }, (_, index) => index);

  if (isFolder) {
    return (
      <div>
        <div className="relative">
          {guides.map((guideDepth) => (
            <span
              key={`${node.path}-guide-${guideDepth}`}
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-gray-200 dark:bg-gray-700"
              style={{ left: `${guideDepth * 16 + 15}px` }}
            />
          ))}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="relative flex w-full items-center gap-1.5 rounded py-1 text-left hover:[background:var(--app-hover)]"
            style={{ paddingLeft: `${indent}px` }}
          >
            {depth > 0 ? (
              <span
                className="pointer-events-none absolute top-1/2 h-px bg-gray-300 dark:bg-gray-600"
                style={{ left: `${(depth - 1) * 16 + 15}px`, width: "12px" }}
              />
            ) : null}
            <svg
              className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{node.name}</span>
          </button>
        </div>
        {expanded ? (
          <div>
            {node.children.map((child) => (
              <ItemTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedItemId={selectedItemId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const item = node.item;
  if (!item) return null;

  const isActive = item.id === selectedItemId;

  return (
    <div className="relative">
      {guides.map((guideDepth) => (
        <span
          key={`${node.path}-guide-${guideDepth}`}
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-gray-200 dark:bg-gray-700"
          style={{ left: `${guideDepth * 16 + 15}px` }}
        />
      ))}
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={`group relative flex w-full items-center gap-1.5 rounded py-1 text-left transition-colors ${
          isActive
            ? "border-r-2 border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
            : "text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-400"
        }`}
        style={{ paddingLeft: `${indent}px` }}
        title={item.path ?? item.filename}
      >
        {depth > 0 ? (
          <span
            className="pointer-events-none absolute top-1/2 h-px bg-gray-300 dark:bg-gray-600"
            style={{ left: `${(depth - 1) * 16 + 15}px`, width: "12px" }}
          />
        ) : null}
        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
        <div className="min-w-0 flex-1 truncate text-sm">{node.name}</div>
        {item.authority === "canonical" ? (
          <span className="ml-auto shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Canonical
          </span>
        ) : null}
      </button>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KnowledgeSection({ packId }: KnowledgeSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightPanel = useResizablePanel(360, 300, 560);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemContent, setItemContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");

  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [itemFilename, setItemFilename] = useState("");
  const [itemPath, setItemPath] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemKind, setItemKind] = useState<KnowledgeItemKind | "">("");
  const [itemAuthority, setItemAuthority] = useState<KnowledgeItemAuthority>("reference");
  const [itemSummary, setItemSummary] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [itemAliases, setItemAliases] = useState<string[]>([]);
  const [itemKeywords, setItemKeywords] = useState<string[]>([]);

  const [itemEdges, setItemEdges] = useState<KnowledgeItemEdge[]>([]);
  const [isLoadingEdges, setIsLoadingEdges] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [isSavingEdge, setIsSavingEdge] = useState(false);
  const [selectedTargetItemId, setSelectedTargetItemId] = useState("");
  const [selectedEdgeType, setSelectedEdgeType] = useState<KnowledgeItemEdgeType>("references");
  const [edgeNote, setEdgeNote] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    items,
    isLoading,
    mutate: mutateItems,
  } = useKnowledgeItems(packId);

  const selectedItem = items?.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!items || items.length === 0) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!selectedItemId) {
      setItemContent(null);
      setEditContent("");
      setContentError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingContent(true);
    setContentError(null);

    fetchKnowledgeItemContent(packId, selectedItemId)
      .then((res) => {
        if (!cancelled) {
          setItemContent(res.content);
          setEditContent(res.content ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setItemContent(null);
          setEditContent("");
          setContentError(
            err instanceof Error ? err.message : "Failed to load item",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [packId, selectedItemId]);

  useEffect(() => {
    if (!selectedItem) {
      setItemFilename("");
      setItemPath("");
      setItemTitle("");
      setItemKind("");
      setItemAuthority("reference");
      setItemSummary("");
      setItemStatus("");
      setItemTags([]);
      setItemAliases([]);
      setItemKeywords([]);
      return;
    }

    setItemFilename(selectedItem.filename ?? "");
    setItemPath(selectedItem.path ?? "");
    setItemTitle(selectedItem.title ?? "");
    setItemKind(selectedItem.kind ?? "");
    setItemAuthority(selectedItem.authority);
    setItemSummary(selectedItem.summary ?? "");
    setItemStatus(selectedItem.status ?? "");
    setItemTags(selectedItem.tags ?? []);
    setItemAliases(selectedItem.aliases ?? []);
    setItemKeywords(selectedItem.keywords ?? []);
    setMetadataError(null);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItemId) {
      setItemEdges([]);
      setSelectedTargetItemId("");
      setEdgeNote("");
      setEdgeError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingEdges(true);
    setEdgeError(null);

    fetchKnowledgeItemEdges(packId, selectedItemId)
      .then((edges) => {
        if (!cancelled) setItemEdges(edges);
      })
      .catch((err) => {
        if (!cancelled) {
          setEdgeError(
            err instanceof Error ? err.message : "Failed to load relationships",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEdges(false);
      });

    return () => {
      cancelled = true;
    };
  }, [packId, selectedItemId]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.size > 20 * 1024 * 1024) {
        setUploadError("File exceeds maximum size of 20 MB.");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        const created = await uploadKnowledgeItem(packId, file);
        await mutateItems();
        setSelectedItemId(created.id);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [packId, mutateItems],
  );

  const handleCreateItem = useCallback(async () => {
    setIsCreatingItem(true);
    setUploadError(null);
    try {
      const created = await createKnowledgeItem(packId);
      await mutateItems();
      setSelectedItemId(created.id);
      setContentMode("edit");
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to create item",
      );
    } finally {
      setIsCreatingItem(false);
    }
  }, [packId, mutateItems]);

  const handleDelete = useCallback(
    async (item: KnowledgeItem) => {
      try {
        await deleteKnowledgeItem(packId, item.id);
        await mutateItems();
        setConfirmDeleteId(null);
        if (selectedItemId === item.id) {
          const remaining = (items ?? []).filter((candidate) => candidate.id !== item.id);
          setSelectedItemId(remaining[0]?.id ?? null);
        }
      } catch {
        setConfirmDeleteId(null);
      }
    },
    [packId, mutateItems, selectedItemId, items],
  );

  const handleSaveContent = async () => {
    if (!selectedItemId) return;
    setIsSavingContent(true);
    setContentError(null);
    try {
      await updateKnowledgeItemContent(packId, selectedItemId, editContent);
      setItemContent(editContent);
      await mutateItems();
    } catch (err) {
      setContentError(
        err instanceof Error ? err.message : "Failed to save item",
      );
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedItemId) return;
    const filename = itemFilename.trim();
    if (!filename) {
      setMetadataError("Filename cannot be empty");
      return;
    }
    setIsSavingMetadata(true);
    setMetadataError(null);
    try {
      await updateKnowledgeItemMetadata(packId, selectedItemId, {
        filename,
        path: itemPath.trim() || null,
        title: itemTitle.trim() || null,
        kind: itemKind || null,
        authority: itemAuthority,
        summary: itemSummary.trim() || null,
        status: itemStatus.trim() || null,
        tags: itemTags,
        aliases: itemAliases,
        keywords: itemKeywords,
      });
      await mutateItems();
    } catch (err) {
      setMetadataError(
        err instanceof Error ? err.message : "Failed to save item metadata",
      );
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleCreateEdge = async () => {
    if (!selectedItemId || !selectedTargetItemId) return;
    setIsSavingEdge(true);
    setEdgeError(null);
    try {
      const edge = await createKnowledgeItemEdge(packId, selectedItemId, {
        target_item_id: selectedTargetItemId,
        edge_type: selectedEdgeType,
        note: edgeNote.trim() || null,
      });
      setItemEdges((current) => [...current, edge]);
      setSelectedTargetItemId("");
      setSelectedEdgeType("references");
      setEdgeNote("");
    } catch (err) {
      setEdgeError(
        err instanceof Error ? err.message : "Failed to create relationship",
      );
    } finally {
      setIsSavingEdge(false);
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    if (!selectedItemId) return;
    setEdgeError(null);
    try {
      await deleteKnowledgeItemEdge(packId, selectedItemId, edgeId);
      setItemEdges((current) => current.filter((edge) => edge.id !== edgeId));
    } catch (err) {
      setEdgeError(
        err instanceof Error ? err.message : "Failed to delete relationship",
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const tree = useMemo(() => buildItemTree(items ?? []), [items]);
  const relatedItemOptions = (items ?? []).filter((item) => item.id !== selectedItemId);
  const itemNameById = new Map(
    (items ?? []).map((item) => [item.id, item.title ?? item.path ?? item.filename]),
  );
  const contentDirty = itemContent !== null && editContent !== itemContent;

  return (
    <Card static className="overflow-hidden rounded-lg bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <CardTitle className="text-base">Documents</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Edit content, metadata, tags, and relationships for this pack.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
              {(items?.length ?? 0).toLocaleString()} items
            </div>
            <Button size="sm" onClick={handleCreateItem} disabled={isCreatingItem || isUploading}>
              {isCreatingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New Item
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex min-h-[780px] overflow-hidden">
          <div className="theme-border theme-surface-muted flex w-72 shrink-0 flex-col overflow-hidden border-r">
            <div className="theme-border border-b px-3 py-2">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-2 transition-all",
                  isUploading ? "pointer-events-none opacity-60" : "",
                  isDragging
                    ? "border-deep-space-blue-500 bg-deep-space-blue-50 dark:border-deep-space-blue-400 dark:bg-deep-space-blue-950/30"
                    : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900",
                )}
              >
                {isUploading ? (
                  <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-deep-space-blue-500" />
                    Uploading...
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Drop files here</p>
                      <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">20 MB max</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload
                    </Button>
                  </>
                )}
              </div>
              {uploadError ? (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                  {uploadError}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  ))}
                </div>
              ) : tree.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  No knowledge items yet.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {tree.map((node) => (
                    <ItemTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedItemId={selectedItemId}
                      onSelect={setSelectedItemId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-gray-900">
            <div className="theme-border flex shrink-0 items-center justify-between gap-4 border-b bg-white px-4 py-3 dark:bg-gray-900">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selectedItem?.path ?? selectedItem?.filename ?? "No item selected"}
                </div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {selectedItem?.title ?? "Upload or select an item from the left"}
                </div>
              </div>
              {selectedItem ? (
                <div className="flex shrink-0 items-center gap-2">
                  <div className="theme-surface flex gap-1 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setContentMode("edit")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        contentMode === "edit"
                          ? "theme-surface-elevated text-deep-space-blue-600 shadow-sm dark:text-deep-space-blue-400"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                      }`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentMode("preview")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        contentMode === "preview"
                          ? "theme-surface-elevated text-deep-space-blue-600 shadow-sm dark:text-deep-space-blue-400"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                      }`}
                    >
                      Preview
                    </button>
                  </div>
                  <a
                    href={downloadKnowledgeItemUrl(packId, selectedItem.id)}
                    download
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Download item"
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                  </a>
                  {confirmDeleteId === selectedItem.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(selectedItem)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(selectedItem.id)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                      <Button size="sm" onClick={handleSaveContent} disabled={!contentDirty || isSavingContent || contentMode !== "edit" || !!contentError}>
                        <Save className="h-4 w-4" />
                        {isSavingContent ? "Saving..." : "Save"}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-hidden">
              {!selectedItem ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Select an item from the left to start editing.
                </div>
              ) : isLoadingContent ? (
                <div className="space-y-3 p-6">
                  <div className="h-6 w-2/3 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-full animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-5/6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-4/6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
                </div>
              ) : contentError ? (
                <div className="p-6">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    {contentError}
                  </div>
                </div>
              ) : contentMode === "preview" ? (
                <div className="h-full overflow-y-auto p-6">
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 dark:prose-a:text-deep-space-blue-400 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-slate-950 dark:prose-pre:bg-slate-950 prose-pre:text-gray-100 prose-pre:border prose-pre:border-slate-800 prose-pre:shadow-none prose-pre:rounded-xl prose-pre:px-4 prose-pre:py-3 prose-pre:overflow-x-auto prose-img:rounded-lg prose-table:text-sm prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:text-gray-100 [&_pre_code]:before:content-none [&_pre_code]:after:content-none [&_pre_code_span]:bg-transparent">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "");
                          const lang = match ? match[1] : "";
                          const codeString = String(children).replace(/\n$/, "");
                          if (lang === "mermaid") return <MermaidDiagram chart={codeString} />;
                          if (className) return <code className={className} {...props}>{children}</code>;
                          return <code {...props}>{children}</code>;
                        },
                        pre({ children, ...props }) {
                          const child = Array.isArray(children) ? children[0] : children;
                          if (
                            child &&
                            typeof child === "object" &&
                            "type" in child &&
                            (child as React.ReactElement).type === MermaidDiagram
                          ) {
                            return <>{children}</>;
                          }
                          return <pre {...props}>{children}</pre>;
                        },
                      }}
                    >
                      {editContent}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="h-full p-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="h-full w-full resize-none rounded-lg border border-gray-200 bg-gray-50/70 p-4 font-mono text-sm leading-6 text-gray-800 shadow-inner focus:border-deep-space-blue-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200 dark:focus:bg-gray-950"
                    placeholder="Write your markdown content here..."
                  />
                </div>
              )}
            </div>

            <div className="theme-border flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500">
              <div className="flex items-center gap-4">
                <span>{editContent.length.toLocaleString()} chars</span>
                {selectedItem ? <span>{formatFileSize(selectedItem.size_bytes)}</span> : null}
                {selectedItem ? <span>Updated {formatDate(selectedItem.updated_at)}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                {contentDirty ? <span className="text-amber-500 dark:text-amber-400">Unsaved changes</span> : null}
                {isSavingContent ? <span>Saving...</span> : null}
              </div>
            </div>
          </div>

          <ResizeHandle onMouseDown={rightPanel.onMouseDown} />
          <div style={{ width: rightPanel.width }} className="theme-surface-muted theme-border flex shrink-0 flex-col overflow-hidden border-l">
            <div className="flex-1 overflow-y-auto p-4">
              {selectedItem ? (
                <div className="space-y-5">
                  <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PanelRight className="h-4 w-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Metadata</h3>
                      </div>
                      <Button size="sm" onClick={handleSaveMetadata} disabled={isSavingMetadata}>
                        <Save className="h-4 w-4" />
                        {isSavingMetadata ? "Saving..." : "Save"}
                      </Button>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Filename</label>
                      <Input value={itemFilename} onChange={(e) => setItemFilename(e.target.value)} placeholder="random.md" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Path</label>
                      <Input value={itemPath} onChange={(e) => setItemPath(e.target.value)} placeholder="domain" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Title</label>
                      <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="Billing Domain" />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Kind</label>
                        <Select value={itemKind} onChange={(e) => setItemKind(e.target.value as KnowledgeItemKind | "")}>
                          <option value="">None</option>
                          {ITEM_KINDS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Authority</label>
                        <Select value={itemAuthority} onChange={(e) => setItemAuthority(e.target.value as KnowledgeItemAuthority)}>
                          {ITEM_AUTHORITIES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Status</label>
                      <Input value={itemStatus} onChange={(e) => setItemStatus(e.target.value)} placeholder="active, review, archived" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Summary</label>
                      <Textarea
                        value={itemSummary}
                        onChange={(e) => setItemSummary(e.target.value)}
                        placeholder="Compact knowledge summary used by prompts and agents."
                        className="min-h-[110px]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Tags</label>
                      <TagInput
                        value={itemTags}
                        onChange={setItemTags}
                        suggestions={["canonical", "policy", "entity", "taxonomy", "guide", "reference", "project"]}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Aliases</label>
                      <TagInput
                        value={itemAliases}
                        onChange={setItemAliases}
                        placeholder="Add an alias..."
                        preserveValue
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Keywords</label>
                      <TagInput
                        value={itemKeywords}
                        onChange={setItemKeywords}
                        placeholder="Add a keyword..."
                        preserveValue
                      />
                    </div>

                    {metadataError ? (
                      <div className="text-xs text-red-600 dark:text-red-400">{metadataError}</div>
                    ) : null}
                  </section>

                  <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Relationships</h3>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Link this item to other knowledge items using the canonical relationship types.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Target item</label>
                      <Select value={selectedTargetItemId} onChange={(e) => setSelectedTargetItemId(e.target.value)}>
                        <option value="">Select an item</option>
                        {relatedItemOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title ?? item.path ?? item.filename}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Relationship type</label>
                      <Select value={selectedEdgeType} onChange={(e) => setSelectedEdgeType(e.target.value as KnowledgeItemEdgeType)}>
                        {ITEM_EDGE_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Note</label>
                      <Textarea
                        value={edgeNote}
                        onChange={(e) => setEdgeNote(e.target.value)}
                        placeholder="Optional explanation for this relationship."
                        className="min-h-[88px]"
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleCreateEdge} disabled={!selectedTargetItemId || isSavingEdge}>
                        <Link2 className="h-4 w-4" />
                        {isSavingEdge ? "Linking..." : "Add Relationship"}
                      </Button>
                    </div>

                    {edgeError ? (
                      <div className="text-xs text-red-600 dark:text-red-400">{edgeError}</div>
                    ) : null}

                    <div className="space-y-2">
                      {isLoadingEdges ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Loading relationships...</div>
                      ) : itemEdges.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">No relationships yet.</div>
                      ) : (
                        itemEdges.map((edge) => {
                          const targetId =
                            edge.source_item_id === selectedItemId
                              ? edge.target_item_id
                              : edge.source_item_id;
                          const direction =
                            edge.source_item_id === selectedItemId ? "outgoing" : "incoming";

                          return (
                            <div key={edge.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950/40">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {direction} · {edge.edge_type.replaceAll("_", " ")}
                                  </p>
                                  <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                                    {itemNameById.get(targetId) ?? targetId}
                                  </p>
                                  {edge.note ? (
                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{edge.note}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEdge(edge.id)}
                                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  title="Delete relationship"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Select an item to edit metadata.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
