"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  FileCheck2,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  X,
} from "lucide-react";

import { uploadArtifact } from "@/lib/api";
import { useOrgContext } from "@/lib/org-context";
import { cn } from "@/lib/cn";

const MAX_ATTACHMENTS = 16;

type AttachmentState = "uploading" | "ready" | "failed";

export interface DraftArtifactAttachment {
  localId: string;
  file: File;
  state: AttachmentState;
  orgId: string | null;
  artifactId?: string;
  error?: string;
}

export function useArtifactAttachments(maxAttachments = MAX_ATTACHMENTS) {
  const { activeOrgId } = useOrgContext();
  const [attachments, setAttachments] = useState<DraftArtifactAttachment[]>([]);
  const attachmentOrgId = useRef(activeOrgId);
  const controllers = useRef(new Map<string, AbortController>());
  const occupiedIds = useRef(new Map<string, string | null>());

  const upload = useCallback(
    (attachment: DraftArtifactAttachment) => {
      const controller = new AbortController();
      controllers.current.set(attachment.localId, controller);
      setAttachments((current) =>
        current.map((item) =>
          item.localId === attachment.localId
            ? {
                ...item,
                state: "uploading",
                orgId: activeOrgId,
                artifactId: undefined,
                error: undefined,
              }
            : item,
        ),
      );
      if (!activeOrgId) {
        setAttachments((current) =>
          current.map((item) =>
            item.localId === attachment.localId
              ? {
                  ...item,
                  state: "failed",
                  error: "Select an organization before attaching files.",
                }
              : item,
          ),
        );
        controllers.current.delete(attachment.localId);
        return;
      }
      void uploadArtifact(attachment.file, activeOrgId, {
        signal: controller.signal,
      })
        .then((artifact) => {
          if (controllers.current.get(attachment.localId) !== controller)
            return;
          controllers.current.delete(attachment.localId);
          setAttachments((current) =>
            current.map((item) =>
              item.localId === attachment.localId
                ? {
                    ...item,
                    state: "ready",
                    artifactId: artifact.id,
                    error: undefined,
                  }
                : item,
            ),
          );
        })
        .catch((cause) => {
          if (
            controller.signal.aborted ||
            controllers.current.get(attachment.localId) !== controller
          )
            return;
          controllers.current.delete(attachment.localId);
          setAttachments((current) =>
            current.map((item) =>
              item.localId === attachment.localId
                ? {
                    ...item,
                    state: "failed",
                    error:
                      cause instanceof Error
                        ? cause.message
                        : "Artifact upload failed.",
                  }
                : item,
            ),
          );
        });
    },
    [activeOrgId],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const selected = Array.from(files).slice(
        0,
        Math.max(
          0,
          maxAttachments -
            Array.from(occupiedIds.current.values()).filter(
              (orgId) => orgId === activeOrgId,
            ).length,
        ),
      );
      const additions = selected.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        state: "uploading" as const,
        orgId: activeOrgId,
      }));
      additions.forEach((attachment) =>
        occupiedIds.current.set(attachment.localId, attachment.orgId),
      );
      setAttachments((current) => [
        ...current.filter((attachment) => attachment.orgId === activeOrgId),
        ...additions,
      ]);
      additions.forEach(upload);
    },
    [activeOrgId, maxAttachments, upload],
  );

  const remove = useCallback((localId: string) => {
    controllers.current.get(localId)?.abort();
    controllers.current.delete(localId);
    occupiedIds.current.delete(localId);
    setAttachments((current) =>
      current.filter((item) => item.localId !== localId),
    );
  }, []);

  const retry = useCallback(
    (localId: string) => {
      const attachment = attachments.find((item) => item.localId === localId);
      if (attachment) upload(attachment);
    },
    [attachments, upload],
  );

  const clear = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    occupiedIds.current.clear();
    setAttachments([]);
  }, []);

  useEffect(() => {
    if (attachmentOrgId.current === activeOrgId) return;
    controllers.current.forEach((controller, localId) => {
      controller.abort();
      controllers.current.delete(localId);
      occupiedIds.current.delete(localId);
    });
    attachmentOrgId.current = activeOrgId;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setAttachments((current) =>
          current.filter((item) => item.orgId === activeOrgId),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [activeOrgId]);

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
      occupiedIds.current.clear();
    },
    [],
  );

  const activeAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.orgId === activeOrgId),
    [activeOrgId, attachments],
  );
  const artifactIds = useMemo(
    () =>
      activeAttachments.flatMap((attachment) =>
        attachment.state === "ready" && attachment.artifactId
          ? [attachment.artifactId]
          : [],
      ),
    [activeAttachments],
  );
  const isReady = activeAttachments.every(
    (attachment) => attachment.state === "ready",
  );

  return {
    attachments: activeAttachments,
    artifactIds,
    isReady,
    canAdd: activeAttachments.length < maxAttachments,
    addFiles,
    remove,
    retry,
    clear,
  };
}

type ArtifactAttachmentListProps = {
  attachments: DraftArtifactAttachment[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
};

export function ArtifactAttachmentList({
  attachments,
  onRemove,
  onRetry,
}: ArtifactAttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Pending attachments">
      {attachments.map((attachment) => (
        <div
          key={attachment.localId}
          className="theme-border theme-surface-muted flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
          title={attachment.error}
        >
          {attachment.state === "uploading" ? (
            <LoaderCircle
              className="h-3.5 w-3.5 shrink-0 animate-spin"
              aria-label="Uploading"
            />
          ) : null}
          {attachment.state === "ready" ? (
            <FileCheck2
              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
              aria-label="Ready"
            />
          ) : null}
          {attachment.state === "failed" ? (
            <AlertCircle
              className="h-3.5 w-3.5 shrink-0 text-red-600"
              aria-label="Upload failed"
            />
          ) : null}
          <span className="theme-text max-w-48 truncate">
            {attachment.file.name}
          </span>
          {attachment.state === "failed" ? (
            <button
              type="button"
              onClick={() => onRetry(attachment.localId)}
              className="theme-text-muted rounded p-0.5 hover:theme-text"
              aria-label={`Retry ${attachment.file.name}`}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(attachment.localId)}
            className="theme-text-muted rounded p-0.5 hover:theme-text"
            aria-label={`Remove ${attachment.file.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ArtifactAttachmentButton({
  canAdd,
  disabled,
  disabledReason,
  iconOnly = false,
  className,
  onAdd,
}: {
  canAdd: boolean;
  disabled?: boolean;
  disabledReason?: string;
  iconOnly?: boolean;
  className?: string;
  onAdd: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || !canAdd;
  const title = disabled
    ? (disabledReason ?? "File attachments are unavailable")
    : canAdd
      ? "Attach file"
      : `A maximum of ${MAX_ATTACHMENTS} files can be attached at once`;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isDisabled}
        title={title}
        aria-label={title}
        className={cn(
          iconOnly
            ? "theme-border theme-surface theme-text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors hover:theme-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            : "theme-text-muted flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:theme-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <Paperclip className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {iconOnly ? null : "Attach file"}
      </button>
    </>
  );
}

export function ArtifactAttachmentComposer({
  attachments,
  canAdd,
  disabled,
  disabledReason,
  onAdd,
  onRemove,
  onRetry,
}: ArtifactAttachmentListProps & {
  canAdd: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onAdd: (files: FileList) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ArtifactAttachmentList
        attachments={attachments}
        onRemove={onRemove}
        onRetry={onRetry}
      />
      <ArtifactAttachmentButton
        canAdd={canAdd}
        disabled={disabled}
        disabledReason={disabledReason}
        onAdd={onAdd}
      />
    </div>
  );
}
