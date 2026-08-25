"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ArtifactViewer } from "@/components/artifacts/ArtifactViewer";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import {
  ApiError,
  fetchReview,
  fetchReviews,
  putReviewResponse,
} from "@/lib/api";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import {
  approvalOptions,
  buildHumanDecision,
  validateApprovalAnswers,
} from "@/lib/humanReview";
import { useOrgContext } from "@/lib/org-context";
import type {
  HumanDecision,
  HumanInputSchema,
  ReviewDetail,
  ReviewFormField,
} from "@/lib/types";

function InputValue({
  schema,
  value,
  artifactIds,
}: {
  schema: HumanInputSchema;
  value: unknown;
  artifactIds: ReadonlySet<string>;
}) {
  if (typeof value === "string"
    && (schema.format === "nenjo-artifact-id" || artifactIds.has(value))) {
    return <ArtifactViewer artifactId={value} />;
  }
  if (schema.type === "string" && typeof value === "string") {
    return <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown></div>;
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    return <div className="space-y-4">{Object.entries(value).map(([key, child]) => <section key={key}>
      <h3 className="theme-text mb-1 text-xs font-semibold uppercase tracking-wide">{key.replaceAll("_", " ")}</h3>
      <InputValue schema={schema.properties?.[key] ?? { type: "json" }} value={child} artifactIds={artifactIds} />
    </section>)}</div>;
  }
  if (schema.type === "array" && Array.isArray(value)) {
    return <div className="space-y-2">{value.map((item, index) => <div key={index} className="theme-surface-muted rounded-lg p-3">
      <InputValue schema={schema.items ?? { type: "json" }} value={item} artifactIds={artifactIds} />
    </div>)}</div>;
  }
  return <pre className="theme-surface-muted theme-text overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

const DECISION_MODAL_COPY = {
  approved: {
    title: "Approve review",
    submitLabel: "Confirm approval",
    submitClass: "bg-emerald-600 hover:bg-emerald-700",
  },
  changes_requested: {
    title: "Request changes",
    submitLabel: "Submit change request",
    submitClass: "bg-amber-500 hover:bg-amber-600",
  },
  rejected: {
    title: "Reject review",
    submitLabel: "Reject review",
    submitClass: "bg-red-600 hover:bg-red-700",
  },
} satisfies Record<HumanDecision["outcome"], {
  title: string;
  submitLabel: string;
  submitClass: string;
}>;

function ReviewForm({ request, onResolved }: { request: ReviewDetail; onResolved: () => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [comment, setComment] = useState("");
  const [changeInstructions, setChangeInstructions] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeOutcome, setActiveOutcome] = useState<HumanDecision["outcome"] | null>(null);
  const fields = request.form?.fields ?? [];
  const modalCopy = activeOutcome ? DECISION_MODAL_COPY[activeOutcome] : null;

  function options(field: ReviewFormField) {
    return approvalOptions(field);
  }
  function validateAnswers(): string | null {
    return validateApprovalAnswers(fields, answers);
  }
  function openDecision(outcome: HumanDecision["outcome"]) {
    setError(null);
    setActiveOutcome(outcome);
  }
  const closeDecision = useCallback(() => {
    if (saving) return;
    setError(null);
    setActiveOutcome(null);
  }, [saving]);
  async function submit(outcome: HumanDecision["outcome"]) {
    const answerError = outcome === "approved" ? validateAnswers() : null;
    if (answerError) return setError(answerError);
    const decisionText = outcome === "changes_requested" ? changeInstructions : rejectionReason;
    const decision = buildHumanDecision(outcome, answers, comment, decisionText);
    if (typeof decision === "string") return setError(decision);
    setSaving(true); setError(null);
    try {
      await putReviewResponse(request.id, request.version, decision);
      setActiveOutcome(null);
      await onResolved();
    } catch (cause) {
      const conflict = cause instanceof ApiError && cause.status === 409;
      setError(conflict
        ? "Another reviewer resolved this request. The accepted result has been refreshed."
        : cause instanceof Error ? cause.message : "Resolution failed");
      await onResolved();
      if (conflict) setActiveOutcome(null);
    } finally { setSaving(false); }
  }
  return <div className="border-t pt-4 theme-border">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => openDecision("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
      <button type="button" disabled={saving} onClick={() => openDecision("changes_requested")} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">Request changes</button>
      <button type="button" disabled={saving} onClick={() => openDecision("rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
    </div>
    <Modal
      open={activeOutcome !== null}
      onClose={closeDecision}
      title={modalCopy?.title ?? "Review decision"}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (activeOutcome) void submit(activeOutcome);
        }}
      >
        {activeOutcome === "approved" ? <>
          {fields.length > 0 ? fields.map((field) => field.type === "single_select"
            ? <label key={field.id} className="block text-sm theme-text">
              <span className="mb-1 block font-medium">{field.label}{field.required ? " *" : ""}</span>
              <select className="theme-surface theme-border w-full rounded-lg border p-2" value={String(answers[field.id] ?? "")}
                onChange={(event) => setAnswers((current) => ({ ...current, [field.id]: event.target.value }))}>
                <option value="">Select…</option>{options(field).map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
              </select>
            </label>
            : <fieldset key={field.id} className="text-sm theme-text">
              <legend className="mb-1 font-medium">{field.label}{field.required ? " *" : ""}</legend>
              <div className="space-y-2">{options(field).map((option) => <label key={String(option.value)} className="flex items-center gap-2">
                <input type="checkbox" checked={Array.isArray(answers[field.id]) && (answers[field.id] as unknown[]).includes(String(option.value))}
                  onChange={(event) => setAnswers((current) => { const values = Array.isArray(current[field.id]) ? current[field.id] as string[] : []; return { ...current, [field.id]: event.target.checked ? [...values, String(option.value)] : values.filter((value) => value !== String(option.value)) }; })} />{option.label}
              </label>)}</div>
            </fieldset>) : <p className="theme-text-muted text-sm">No additional approval input is required.</p>}
          <label className="block text-sm theme-text">
            <span className="mb-1 block font-medium">Comment <span className="theme-text-muted font-normal">(optional)</span></span>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Add an approval comment" className="theme-surface theme-border w-full rounded-lg border p-2" />
          </label>
        </> : null}
        {activeOutcome === "changes_requested" ? <label className="block text-sm theme-text">
          <span className="mb-1 block font-medium">Change instructions *</span>
          <textarea autoFocus value={changeInstructions} onChange={(event) => setChangeInstructions(event.target.value)} rows={5} placeholder="Describe what needs to change" className="theme-surface theme-border w-full rounded-lg border p-2" />
        </label> : null}
        {activeOutcome === "rejected" ? <label className="block text-sm theme-text">
          <span className="mb-1 block font-medium">Rejection reason *</span>
          <textarea autoFocus value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={5} placeholder="Explain why this review is being rejected" className="theme-surface theme-border w-full rounded-lg border p-2" />
        </label> : null}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <div className="theme-border flex justify-end gap-2 border-t pt-4">
          <button type="button" disabled={saving} onClick={closeDecision} className="theme-border theme-text rounded-lg border px-4 py-2 text-sm font-medium hover:theme-surface-muted disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || activeOutcome === null} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${modalCopy?.submitClass ?? "bg-gray-600"}`}>
            {saving ? "Submitting…" : modalCopy?.submitLabel ?? "Submit"}
          </button>
        </div>
      </form>
    </Modal>
  </div>;
}

export function HumanReviewInbox({ executionId, taskId }: { executionId?: string; taskId?: string }) {
  const { activeOrgId } = useOrgContext();
  const filters = useMemo(() => ({ status: "pending", executionId, taskId }), [executionId, taskId]);
  const listKey = useMemo(
    () => activeOrgId ? `reviews:${activeOrgId}:${JSON.stringify(filters)}` : null,
    [activeOrgId, filters],
  );
  const { data: requests, error: listError, mutate: refreshList, isLoading } = useSWR(listKey, () => fetchReviews(filters), { refreshInterval: 5000 });
  const [selection, setSelection] = useState<{ orgId: string; reviewId: string } | null>(null);
  const selectedId = selection?.orgId === activeOrgId ? selection.reviewId : null;
  const activeId = selectedId ?? requests?.[0]?.id ?? null;
  const { data: detail, mutate: refreshDetail } = useSWR(
    activeOrgId && activeId ? `review:${activeOrgId}:${activeId}` : null,
    () => fetchReview(activeId!),
    { refreshInterval: 5000 },
  );
  const selected = useMemo(() => requests?.find((request) => request.id === activeId), [requests, activeId]);
  const linkedArtifactIds = useMemo(() => new Set(detail?.artifact_ids ?? []), [detail?.artifact_ids]);
  const refresh = useCallback(async () => {
    await Promise.all([refreshList(), refreshDetail()]);
  }, [refreshDetail, refreshList]);
  useEffect(() => {
    const controller = new AbortController();
    void subscribeExecutionRealtime((event) => {
      if (event.data.type === "task.execution_state") void refreshList();
      if (event.data.type === "execution.event") {
        const payload = event.data.event;
        if (payload && typeof payload === "object" && !Array.isArray(payload)
          && (payload as Record<string, unknown>).kind === "human.request") {
          void refresh();
        }
      }
    }, undefined, controller.signal).catch(() => {
      // Polling remains the recovery path when the organization stream drops.
    });
    return () => controller.abort();
  }, [activeOrgId, refresh, refreshList]);

  if (!isLoading && listError) {
    return (
      <EmptyState
        icon={<TriangleAlert className="h-5 w-5" />}
        title="Reviews could not be loaded"
        description="Check the local worker connection, then refresh this page to try again."
        tone="error"
      />
    );
  }

  if (!isLoading && requests && requests.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="You’re all caught up"
        description="New checkpoints will appear here when an agent needs a decision, correction, or approval."
      />
    );
  }

  return <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
    <aside className="theme-surface theme-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="theme-surface-muted border-b p-3 text-sm font-semibold theme-border">Pending reviews</div>
      {isLoading ? <p className="p-3 text-sm theme-text-muted">Loading…</p> : requests?.length ? requests.map((request) => <button key={request.id} onClick={() => activeOrgId && setSelection({ orgId: activeOrgId, reviewId: request.id })}
        className={`block w-full border-b p-3 text-left theme-border ${request.id === activeId ? "theme-selected" : "hover:theme-surface-muted"}`}>
        <p className="theme-text text-sm font-medium">{request.title}</p><p className="theme-text-muted text-xs">Round {request.round} · {request.step}</p>
      </button>) : listError ? <p className="p-3 text-sm text-red-600">Reviews could not be loaded.</p> : <p className="p-3 text-sm theme-text-muted">No reviews are waiting.</p>}
    </aside>
    <main className="theme-surface theme-border min-h-72 rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {detail && selected ? <div className="space-y-5">
        <header><h2 className="theme-text text-xl font-semibold">{detail.title}</h2><p className="theme-text-muted text-sm">Round {detail.round} · execution {detail.execution_id.slice(0, 8)}</p></header>
        {detail.content !== undefined ? <div className="space-y-4">{detail.content.map((input) => <section key={input.input} className="theme-border rounded-xl border p-4">
          <h3 className="theme-text font-semibold">{input.source_name}</h3>
          {input.purpose ? <p className="theme-text-muted mb-3 text-sm">{input.purpose}</p> : null}
          <InputValue schema={input.schema} value={input.value} artifactIds={linkedArtifactIds} />
        </section>)}</div> : <p className="text-sm text-amber-600">Unlock organization content to view this review.</p>}
        {detail.status === "pending" ? <ReviewForm request={detail} onResolved={refresh} /> : <p className="theme-text-muted text-sm">This review is {detail.status}.</p>}
      </div> : <div className="flex min-h-56 items-center justify-center"><p className="theme-text-muted text-sm">Loading review details…</p></div>}
    </main>
  </div>;
}
