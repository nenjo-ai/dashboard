"use client";

import { useState } from "react";
import { fetchTaskAttachmentContent } from "@/lib/api";
import { decryptContentPayload } from "@/lib/cryptoContent";
import type { TaskAttachment } from "@/lib/types";

/** Displays encrypted handoffs by run and decrypts only on explicit demand. */
export function TaskAttachments({
  taskId,
  attachments,
  isLoading,
  isError,
}: {
  taskId: string;
  attachments: TaskAttachment[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const [opened, setOpened] = useState<Record<string, string>>({});
  if (isLoading) return <p className="theme-text-muted text-sm">Loading attachments…</p>;
  if (isError) return <p className="text-sm text-red-500">Failed to load attachments.</p>;
  if (!attachments?.length) return <p className="theme-text-muted text-sm">No attachments yet.</p>;
  const groups = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const group = groups.get(attachment.execution_run_id) ?? [];
    group.push(attachment);
    groups.set(attachment.execution_run_id, group);
  }
  return <div className="space-y-4">{Array.from(groups, ([runId, values]) => (
    <section key={runId}>
      <h3 className="theme-text-muted mb-2 text-xs font-semibold">Run {runId.slice(0, 8)}</h3>
      <div className="space-y-2">{values.map((attachment) => (
        <div className="theme-border rounded-lg border p-3" key={attachment.id}>
          <button className="theme-text text-left text-sm font-medium" type="button" onClick={async () => {
            if (opened[attachment.id]) return;
            setOpened((current) => ({ ...current, [attachment.id]: "Loading…" }));
            try {
              const encryptedPayload = attachment.encrypted_payload
                ?? await fetchTaskAttachmentContent(taskId, attachment.id);
              const plaintext = await decryptContentPayload(encryptedPayload);
              setOpened((current) => ({ ...current, [attachment.id]: plaintext ?? "Unable to decrypt attachment" }));
            } catch (cause) {
              setOpened((current) => ({
                ...current,
                [attachment.id]: cause instanceof Error ? cause.message : "Unable to load attachment",
              }));
            }
          }}>{attachment.name}</button>
          <p className="theme-text-muted mt-1 text-xs">
            {attachment.kind === "final_output"
              ? `Agent final output · ${attachment.storage_kind === "s3" ? "object storage" : "database"}`
              : `${attachment.source_step_slug} → ${attachment.destination_step_slug} · ${attachment.edge_condition}`}
          </p>
          {opened[attachment.id] ? <pre className="theme-surface-muted theme-text mt-2 overflow-x-auto whitespace-pre-wrap rounded p-3 text-xs">{opened[attachment.id]}</pre> : null}
        </div>
      ))}</div>
    </section>
  ))}</div>;
}
