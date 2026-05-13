"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { useProjectDocuments } from "@/lib/hooks";
import {
  createProjectDocument,
  createProjectDocumentEdge,
  deleteProjectDocument,
  deleteProjectDocumentEdge,
  downloadProjectDocumentUrl,
  fetchDocumentContent,
  fetchProjectDocumentEdges,
  updateDocumentContent,
  updateProjectDocumentMetadata,
  uploadProjectDocument,
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
import type {
  ProjectDocument,
  ProjectDocumentAuthority,
  ProjectDocumentEdge,
  ProjectDocumentEdgeType,
  ProjectDocumentKind,
} from "@/lib/types";

interface ProductDocSectionProps {
  projectId: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  document?: ProjectDocument;
}

const DOCUMENT_KINDS: Array<{ value: ProjectDocumentKind; label: string }> = [
  { value: "guide", label: "Guide" },
  { value: "reference", label: "Reference" },
  { value: "taxonomy", label: "Taxonomy" },
  { value: "domain", label: "Domain" },
  { value: "entity", label: "Entity" },
  { value: "policy", label: "Policy" },
];

const DOCUMENT_AUTHORITIES: Array<{ value: ProjectDocumentAuthority; label: string }> = [
  { value: "canonical", label: "Canonical" },
  { value: "supporting", label: "Supporting" },
  { value: "reference", label: "Reference" },
  { value: "draft", label: "Draft" },
  { value: "deprecated", label: "Deprecated" },
];

const DOCUMENT_EDGE_TYPES: Array<{ value: ProjectDocumentEdgeType; label: string }> = [
  { value: "part_of", label: "Part Of" },
  { value: "defines", label: "Defines" },
  { value: "governs", label: "Governs" },
  { value: "classifies", label: "Classifies" },
  { value: "references", label: "References" },
  { value: "depends_on", label: "Depends On" },
  { value: "extends", label: "Extends" },
  { value: "related_to", label: "Related To" },
];

function buildDocumentTree(documents: ProjectDocument[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const doc of documents) {
    const rawPath = doc.path?.trim().replace(/^\/+|\/+$/g, "");
    const pathParts = rawPath ? rawPath.split("/").filter(Boolean) : [];
    const filename = doc.filename || pathParts.at(-1) || "Untitled";
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
      let folder = parent.find((node) => node.path === folderPath && !node.document);
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
      document: doc,
    });
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => {
        const aFolder = !a.document;
        const bFolder = !b.document;
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));

  return sortNodes(root);
}

function DocumentTreeNode({
  node,
  depth,
  selectedDocumentId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedDocumentId: string | null;
  onSelect: (docId: string) => void;
}) {
  const isFolder = !node.document;
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
            <svg className="h-3.5 w-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{node.name}</span>
          </button>
        </div>
        {expanded ? (
          <div>
            {node.children.map((child) => (
              <DocumentTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedDocumentId={selectedDocumentId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const doc = node.document;
  if (!doc) return null;

  const isActive = doc.id === selectedDocumentId;

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
        onClick={() => onSelect(doc.id)}
        className={`group relative flex w-full items-center gap-1.5 rounded py-1 text-left transition-colors ${
          isActive
            ? "border-r-2 border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
            : "text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-400"
        }`}
        style={{ paddingLeft: `${indent}px` }}
        title={doc.path ?? doc.filename}
      >
        {depth > 0 ? (
          <span
            className="pointer-events-none absolute top-1/2 h-px bg-gray-300 dark:bg-gray-600"
            style={{ left: `${(depth - 1) * 16 + 15}px`, width: "12px" }}
          />
        ) : null}
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <div className="min-w-0 flex-1 truncate text-sm">{node.name}</div>
        {doc.authority === "canonical" ? (
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

export function ProductDocSection({ projectId }: ProductDocSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightPanel = useResizablePanel(360, 300, 560);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");

  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [docFilename, setDocFilename] = useState("");
  const [docPath, setDocPath] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docKind, setDocKind] = useState<ProjectDocumentKind | "">("");
  const [docAuthority, setDocAuthority] = useState<ProjectDocumentAuthority>("reference");
  const [docSummary, setDocSummary] = useState("");
  const [docStatus, setDocStatus] = useState("");
  const [docTags, setDocTags] = useState<string[]>([]);
  const [docAliases, setDocAliases] = useState<string[]>([]);
  const [docKeywords, setDocKeywords] = useState<string[]>([]);

  const [documentEdges, setDocumentEdges] = useState<ProjectDocumentEdge[]>([]);
  const [isLoadingEdges, setIsLoadingEdges] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [isSavingEdge, setIsSavingEdge] = useState(false);
  const [selectedTargetDocumentId, setSelectedTargetDocumentId] = useState("");
  const [selectedEdgeType, setSelectedEdgeType] = useState<ProjectDocumentEdgeType>("references");
  const [edgeNote, setEdgeNote] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    documents,
    isLoading,
    mutate: mutateDocs,
  } = useProjectDocuments(projectId);

  const selectedDoc = documents?.find((doc) => doc.id === selectedDocId) ?? null;

  useEffect(() => {
    if (!documents || documents.length === 0) {
      setSelectedDocId(null);
      return;
    }
    if (!selectedDocId || !documents.some((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  useEffect(() => {
    if (!selectedDocId) {
      setDocContent(null);
      setEditContent("");
      setContentError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingContent(true);
    setContentError(null);

    fetchDocumentContent(projectId, selectedDocId)
      .then((res) => {
        if (!cancelled) {
          setDocContent(res.content);
          setEditContent(res.content ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDocContent(null);
          setEditContent("");
          setContentError(
            err instanceof Error ? err.message : "Failed to load document",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedDocId]);

  useEffect(() => {
    if (!selectedDoc) {
      setDocFilename("");
      setDocPath("");
      setDocTitle("");
      setDocKind("");
      setDocAuthority("reference");
      setDocSummary("");
      setDocStatus("");
      setDocTags([]);
      setDocAliases([]);
      setDocKeywords([]);
      return;
    }

    setDocFilename(selectedDoc.filename ?? "");
    setDocPath(selectedDoc.path ?? "");
    setDocTitle(selectedDoc.title ?? "");
    setDocKind(selectedDoc.kind ?? "");
    setDocAuthority(selectedDoc.authority);
    setDocSummary(selectedDoc.summary ?? "");
    setDocStatus(selectedDoc.status ?? "");
    setDocTags(selectedDoc.tags ?? []);
    setDocAliases(selectedDoc.aliases ?? []);
    setDocKeywords(selectedDoc.keywords ?? []);
    setMetadataError(null);
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedDocId) {
      setDocumentEdges([]);
      setSelectedTargetDocumentId("");
      setEdgeNote("");
      setEdgeError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingEdges(true);
    setEdgeError(null);

    fetchProjectDocumentEdges(projectId, selectedDocId)
      .then((edges) => {
        if (!cancelled) setDocumentEdges(edges);
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
  }, [projectId, selectedDocId]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.size > 50 * 1024 * 1024) {
        setUploadError("File exceeds maximum size of 50 MB.");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        const created = await uploadProjectDocument(projectId, file);
        await mutateDocs();
        setSelectedDocId(created.id);
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [projectId, mutateDocs],
  );

  const handleCreateDocument = useCallback(async () => {
    setIsCreatingDocument(true);
    setUploadError(null);
    try {
      const created = await createProjectDocument(projectId);
      await mutateDocs();
      setSelectedDocId(created.id);
      setContentMode("edit");
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to create document",
      );
    } finally {
      setIsCreatingDocument(false);
    }
  }, [projectId, mutateDocs]);

  const handleDelete = useCallback(
    async (doc: ProjectDocument) => {
      try {
        await deleteProjectDocument(projectId, doc.id);
        await mutateDocs();
        setConfirmDeleteId(null);
        if (selectedDocId === doc.id) {
          const remaining = (documents ?? []).filter((item) => item.id !== doc.id);
          setSelectedDocId(remaining[0]?.id ?? null);
        }
      } catch {
        setConfirmDeleteId(null);
      }
    },
    [projectId, mutateDocs, selectedDocId, documents],
  );

  const handleSaveContent = async () => {
    if (!selectedDocId) return;
    setIsSavingContent(true);
    setContentError(null);
    try {
      await updateDocumentContent(projectId, selectedDocId, editContent);
      setDocContent(editContent);
      await mutateDocs();
    } catch (err) {
      setContentError(
        err instanceof Error ? err.message : "Failed to save document",
      );
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedDocId) return;
    const filename = docFilename.trim();
    if (!filename) {
      setMetadataError("Filename cannot be empty");
      return;
    }
    setIsSavingMetadata(true);
    setMetadataError(null);
    try {
      await updateProjectDocumentMetadata(projectId, selectedDocId, {
        filename,
        path: docPath.trim() || null,
        title: docTitle.trim() || null,
        kind: docKind || null,
        authority: docAuthority,
        summary: docSummary.trim() || null,
        status: docStatus.trim() || null,
        tags: docTags,
        aliases: docAliases,
        keywords: docKeywords,
      });
      await mutateDocs();
    } catch (err) {
      setMetadataError(
        err instanceof Error ? err.message : "Failed to save document metadata",
      );
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleCreateEdge = async () => {
    if (!selectedDocId || !selectedTargetDocumentId) return;
    setIsSavingEdge(true);
    setEdgeError(null);
    try {
      const edge = await createProjectDocumentEdge(projectId, selectedDocId, {
        target_document_id: selectedTargetDocumentId,
        edge_type: selectedEdgeType,
        note: edgeNote.trim() || null,
      });
      setDocumentEdges((current) => [...current, edge]);
      setSelectedTargetDocumentId("");
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
    if (!selectedDocId) return;
    setEdgeError(null);
    try {
      await deleteProjectDocumentEdge(projectId, selectedDocId, edgeId);
      setDocumentEdges((current) => current.filter((edge) => edge.id !== edgeId));
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

  const tree = useMemo(() => buildDocumentTree(documents ?? []), [documents]);
  const relatedDocumentOptions = (documents ?? []).filter((doc) => doc.id !== selectedDocId);
  const documentNameById = new Map(
    (documents ?? []).map((doc) => [doc.id, doc.title ?? doc.path ?? doc.filename]),
  );
  const contentDirty = docContent !== null && editContent !== docContent;

  return (
    <Card static className="overflow-hidden">
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <CardTitle>Project Documents</CardTitle>
            </div>
            <CardDescription>
              Project knowledge organized as files on the left, content in the center, and metadata on the right.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {(documents?.length ?? 0).toLocaleString()} docs
            </div>
            <Button size="sm" onClick={handleCreateDocument} disabled={isCreatingDocument || isUploading}>
              <span className="inline-flex items-center gap-1.5">
                {isCreatingDocument ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
                New Document
              </span>
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
            <div className="theme-border border-b p-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-4 text-center transition-all ${
                  isUploading ? "pointer-events-none opacity-60" : ""
                } ${
                  isDragging
                    ? "border-deep-space-blue-500 bg-deep-space-blue-50 dark:border-deep-space-blue-400 dark:bg-deep-space-blue-950/30"
                    : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500 dark:hover:bg-gray-800"
                }`}
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="h-4 w-4 animate-spin text-deep-space-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading...
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Click or drag in a file</p>
                  </>
                )}
              </div>
              {uploadError ? (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
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
                  No project documents yet.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {tree.map((node) => (
                    <DocumentTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedDocumentId={selectedDocId}
                      onSelect={setSelectedDocId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="theme-border theme-surface-muted flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {selectedDoc?.path ?? selectedDoc?.filename ?? "No document selected"}
                </div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {selectedDoc?.title ?? "Upload or select a document from the left"}
                </div>
              </div>
              {selectedDoc ? (
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
                    href={downloadProjectDocumentUrl(projectId, selectedDoc.id)}
                    download
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    title="Download document"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </a>
                  {confirmDeleteId === selectedDoc.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleDelete(selectedDoc)}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(selectedDoc.id)}>
                        Delete
                      </Button>
                      <Button size="sm" onClick={handleSaveContent} disabled={!contentDirty || isSavingContent || contentMode !== "edit" || !!contentError}>
                        {isSavingContent ? "Saving..." : "Save"}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-hidden">
              {!selectedDoc ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  Select a document from the left to start editing.
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
                    className="h-full w-full resize-none rounded-lg border border-gray-300 bg-white p-4 font-mono text-sm text-gray-800 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                    placeholder="Write your markdown content here..."
                  />
                </div>
              )}
            </div>

            <div className="theme-border flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500">
              <div className="flex items-center gap-4">
                <span>{editContent.length.toLocaleString()} chars</span>
                {selectedDoc ? <span>{formatFileSize(selectedDoc.size_bytes)}</span> : null}
                {selectedDoc ? <span>Updated {formatDate(selectedDoc.updated_at)}</span> : null}
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
              {selectedDoc ? (
                <div className="space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Metadata</h3>
                      <Button size="sm" onClick={handleSaveMetadata} disabled={isSavingMetadata}>
                        {isSavingMetadata ? "Saving..." : "Save"}
                      </Button>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Filename</label>
                      <Input value={docFilename} onChange={(e) => setDocFilename(e.target.value)} placeholder="random.md" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Path</label>
                      <Input value={docPath} onChange={(e) => setDocPath(e.target.value)} placeholder="domain" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Title</label>
                      <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Billing Domain" />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Kind</label>
                        <Select value={docKind} onChange={(e) => setDocKind(e.target.value as ProjectDocumentKind | "")}>
                          <option value="">None</option>
                          {DOCUMENT_KINDS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Authority</label>
                        <Select value={docAuthority} onChange={(e) => setDocAuthority(e.target.value as ProjectDocumentAuthority)}>
                          {DOCUMENT_AUTHORITIES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Status</label>
                      <Input value={docStatus} onChange={(e) => setDocStatus(e.target.value)} placeholder="active, review, archived" />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Summary</label>
                      <Textarea
                        value={docSummary}
                        onChange={(e) => setDocSummary(e.target.value)}
                        placeholder="Compact knowledge summary used by prompts and agents."
                        className="min-h-[110px]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Tags</label>
                      <TagInput
                        value={docTags}
                        onChange={setDocTags}
                        suggestions={["canonical", "policy", "entity", "taxonomy", "guide", "reference", "project"]}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Aliases</label>
                      <TagInput
                        value={docAliases}
                        onChange={setDocAliases}
                        placeholder="Add an alias..."
                        preserveValue
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Keywords</label>
                      <TagInput
                        value={docKeywords}
                        onChange={setDocKeywords}
                        placeholder="Add a keyword..."
                        preserveValue
                      />
                    </div>

                    {metadataError ? (
                      <div className="text-xs text-red-600 dark:text-red-400">{metadataError}</div>
                    ) : null}
                  </section>

                  <section className="space-y-3 border-t border-gray-200 pt-5 dark:border-gray-700">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Relationships</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Link this document to other project docs using the canonical relationship types.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Target document</label>
                      <Select value={selectedTargetDocumentId} onChange={(e) => setSelectedTargetDocumentId(e.target.value)}>
                        <option value="">Select a document</option>
                        {relatedDocumentOptions.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.title ?? doc.path ?? doc.filename}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Relationship type</label>
                      <Select value={selectedEdgeType} onChange={(e) => setSelectedEdgeType(e.target.value as ProjectDocumentEdgeType)}>
                        {DOCUMENT_EDGE_TYPES.map((option) => (
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
                      <Button size="sm" onClick={handleCreateEdge} disabled={!selectedTargetDocumentId || isSavingEdge}>
                        {isSavingEdge ? "Linking..." : "Add Relationship"}
                      </Button>
                    </div>

                    {edgeError ? (
                      <div className="text-xs text-red-600 dark:text-red-400">{edgeError}</div>
                    ) : null}

                    <div className="space-y-2">
                      {isLoadingEdges ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Loading relationships...</div>
                      ) : documentEdges.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">No relationships yet.</div>
                      ) : (
                        documentEdges.map((edge) => {
                          const targetId =
                            edge.source_document_id === selectedDocId
                              ? edge.target_document_id
                              : edge.source_document_id;
                          const direction =
                            edge.source_document_id === selectedDocId ? "outgoing" : "incoming";

                          return (
                            <div key={edge.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {direction} · {edge.edge_type.replaceAll("_", " ")}
                                  </p>
                                  <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                                    {documentNameById.get(targetId) ?? targetId}
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
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
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
                  Select a document to edit metadata.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
