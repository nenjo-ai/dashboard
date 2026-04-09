"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { useProjectDocuments } from "@/lib/hooks";
import {
  uploadProjectDocument,
  deleteProjectDocument,
  fetchDocumentContent,
  updateDocumentContent,
  downloadProjectDocumentUrl,
} from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ProjectDocument } from "@/lib/types";

interface ProductDocSectionProps {
  projectId: string;
}

export function ProductDocSection({ projectId }: ProductDocSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Viewer state
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docFilename, setDocFilename] = useState("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    documents,
    isLoading,
    mutate: mutateDocs,
  } = useProjectDocuments(projectId);

  // Fetch content when viewer opens
  useEffect(() => {
    if (!viewDocId) {
      setDocContent(null);
      setDocFilename("");
      setContentError(null);
      setIsEditing(false);
      return;
    }

    let cancelled = false;
    setIsLoadingContent(true);
    setContentError(null);
    setDocContent(null);
    setIsEditing(false);

    fetchDocumentContent(projectId, viewDocId)
      .then((res) => {
        if (!cancelled) {
          setDocContent(res.content);
          setDocFilename(res.filename);
        }
      })
      .catch((err) => {
        if (!cancelled) {
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
  }, [projectId, viewDocId]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleUpload = useCallback(
    async (file: File) => {
      if (file.size > 50 * 1024 * 1024) {
        setUploadError("File exceeds maximum size of 50 MB.");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        await uploadProjectDocument(projectId, file);
        await mutateDocs();
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [projectId, mutateDocs],
  );

  const handleDelete = useCallback(
    async (doc: ProjectDocument) => {
      try {
        await deleteProjectDocument(projectId, doc.id);
        if (viewDocId === doc.id) setViewDocId(null);
        await mutateDocs();
      } catch {
        // silent
      } finally {
        setConfirmDeleteId(null);
      }
    },
    [projectId, mutateDocs, viewDocId],
  );

  const handleStartEdit = () => {
    setEditContent(docContent ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent("");
  };

  const handleSaveEdit = async () => {
    if (!viewDocId) return;
    setIsSaving(true);
    try {
      await updateDocumentContent(projectId, viewDocId, editContent);
      setDocContent(editContent);
      setIsEditing(false);
      await mutateDocs();
    } catch (err) {
      setContentError(
        err instanceof Error ? err.message : "Failed to save document",
      );
    } finally {
      setIsSaving(false);
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

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="*/*"
      onChange={handleFileInputChange}
      className="hidden"
    />
  );

  return (
    <>
      <Card static>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <CardTitle>Project Documents</CardTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Upload
              </span>
            </Button>
          </div>
          <CardDescription>
            Product requirements, specs, and reference documents for this project.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {fileInput}

          {/* Upload error */}
          {uploadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {uploadError}
              <button type="button" onClick={() => setUploadError(null)} className="ml-2 font-medium underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          )}

          {/* Document list */}
          {!isLoading && documents && documents.length > 0 && (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-4 py-3 group"
                >
                  {/* Icon */}
                  <svg className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(doc.size_bytes)}
                      <span className="mx-1.5">·</span>
                      <span suppressHydrationWarning>{formatDate(doc.created_at)}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewDocId(doc.id)}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="View document"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <a
                      href={downloadProjectDocumentUrl(projectId, doc.id)}
                      download
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="Download document"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                    {confirmDeleteId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        title="Delete document"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state / drop zone */}
          {!isLoading && (!documents || documents.length === 0) && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-all ${
                isUploading ? "pointer-events-none opacity-60" : ""
              } ${
                isDragging
                  ? "border-deep-space-blue-500 bg-deep-space-blue-50 dark:border-deep-space-blue-400 dark:bg-deep-space-blue-950/30"
                  : "border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-gray-500 dark:hover:bg-gray-800"
              }`}
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 animate-spin text-deep-space-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Uploading...</span>
                </div>
              ) : (
                <>
                  <svg className="h-8 w-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Upload a document
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Click or drag and drop (max 50 MB)
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document viewer modal */}
      <Modal
        open={!!viewDocId}
        onClose={() => setViewDocId(null)}
        title={docFilename || "Document"}
        className="!max-w-5xl"
      >
        <div className="space-y-4">
          {isLoadingContent && (
            <div className="space-y-3 py-4">
              <div className="h-6 w-2/3 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-full animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-5/6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-4/6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-full animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
            </div>
          )}

          {contentError && (
            <div className="text-sm text-red-600 dark:text-red-400">{contentError}</div>
          )}

          {/* Rendered markdown */}
          {!isLoadingContent && !contentError && docContent !== null && !isEditing && (
            <>
              <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
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
                        if (child && typeof child === "object" && "type" in child && (child as React.ReactElement).type === MermaidDiagram) {
                          return <>{children}</>;
                        }
                        return <pre {...props}>{children}</pre>;
                      },
                    }}
                  >
                    {docContent}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    Edit
                  </span>
                </Button>
              </div>
            </>
          )}

          {/* Editor */}
          {!isLoadingContent && !contentError && isEditing && (
            <div className="flex flex-col">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-[75vh] rounded-lg border border-gray-300 bg-white p-4 text-sm text-gray-800 font-mono resize-none focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                placeholder="Write your markdown content here..."
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
