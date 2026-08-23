import type {
  AgentLifecycleEvent,
  RunPhase,
  RunTrace,
  TraceSpan,
  TraceStatus,
} from "../agentRunTrace/types";
import type { ChatMessage, ChatRunStatus } from "../types";
import type { ChatLifecycle, ChatPhase } from "./types";

export interface SerialChatWorkQueue {
  /** Schedule work after every previously scheduled stream operation. */
  enqueue(work: () => void | Promise<void>): void;
  /** Wait until all work scheduled so far has settled. */
  drain(): Promise<void>;
}

export interface LiveAssistantDraftUpdate {
  id: string;
  content: string;
  runStatus: ChatRunStatus;
  replyToMessageId?: string;
  runTrace?: RunTrace;
  runEnvelopeId?: string;
  timestamp: string;
}

/**
 * A scheduled paint may only update the response that owned it when queued.
 * Terminal cleanup and a later turn both invalidate the scheduled response ID.
 */
export function scheduledDraftBelongsToResponse(
  scheduledResponseId: string | null,
  currentResponseId: string | null,
): boolean {
  return (
    scheduledResponseId !== null && scheduledResponseId === currentResponseId
  );
}

/** Ignore delayed, unscoped clears while a newer local response is active. */
export function clearSnapshotAppliesToResponse(
  clearResponseId: string | undefined,
  currentResponseId: string | null,
): boolean {
  return (
    currentResponseId === null ||
    (clearResponseId !== undefined && clearResponseId === currentResponseId)
  );
}

/** Keep history loading chrome from hiding messages created after fetch start. */
export function shouldShowChatHistoryLoader(
  isLoadingHistory: boolean,
  messageCount: number,
): boolean {
  return isLoadingHistory && messageCount === 0;
}

/** Only the reducer-owned response may inherit the current turn's animation. */
export function livePhaseForChatMessage(
  message: ChatMessage,
  lifecycle: ChatLifecycle,
): ChatPhase | undefined {
  if (
    !lifecycle.isActive ||
    !lifecycle.responseId ||
    message.role !== "assistant" ||
    message.isLiveDraft !== true
  ) {
    return undefined;
  }
  return message.id === lifecycle.responseId ||
    message.persistedId === lifecycle.responseId
    ? lifecycle.phase
    : undefined;
}

/** Hide legacy empty drafts that no longer belong to an active response. */
export function shouldDisplayChatMessage(
  message: ChatMessage,
  lifecycle: ChatLifecycle,
): boolean {
  if (message.role !== "assistant" || message.isLiveDraft !== true) return true;
  if (livePhaseForChatMessage(message, lifecycle)) return true;
  if (message.content.trim()) return true;
  return (
    message.runStatus === "completed" ||
    message.runStatus === "failed" ||
    message.runStatus === "cancelled"
  );
}

function withoutLeadingActivityPreview(
  content: string,
  preview: string,
): string {
  if (content.startsWith(preview)) {
    return content.slice(preview.length).trimStart();
  }

  const trimmedContent = content.trimStart();
  const trimmedPreview = preview.trim();
  if (trimmedContent.startsWith(trimmedPreview)) {
    return trimmedContent.slice(trimmedPreview.length).trimStart();
  }
  return content;
}

function chatActivityTextPreviews(trace: RunTrace | undefined): string[] {
  if (!trace) return [];
  const seenBatches = new Set<string>();
  const previews: string[] = [];

  for (const span of trace.spans) {
    const candidates =
      span.kind === "tool"
        ? [span]
        : span.kind === "model"
          ? (span.children ?? []).filter((child) => child.kind === "tool")
          : [];
    for (const candidate of candidates) {
      if (
        candidate.kind !== "tool" ||
        candidate.providerNative === true ||
        candidate.name === "respond_to_user"
      ) {
        continue;
      }
      const preview = candidate.textPreview?.trim();
      if (!preview) continue;
      const batchKey = candidate.batchId ?? candidate.id;
      if (seenBatches.has(batchKey)) continue;
      seenBatches.add(batchKey);
      previews.push(preview);
    }
  }
  return previews;
}

/**
 * Derive the live response body without mutating its authoritative stream.
 * Narration that introduced a local tool batch belongs in Activity, while
 * provider trailing blank lines are omitted from display.
 */
export function visibleLiveAssistantContent(
  content: string,
  trace?: RunTrace,
): string {
  let visibleContent = content.trimEnd();
  for (const preview of chatActivityTextPreviews(trace)) {
    visibleContent = withoutLeadingActivityPreview(visibleContent, preview);
  }
  return visibleContent.trimEnd();
}

/**
 * Give the in-memory trace the exact live narration for a top-level tool batch.
 * The durable envelope keeps the worker's bounded preview; this richer copy is
 * only used to move live text between the response body and Activity cleanly.
 */
export function withLiveChatActivityPreview(
  event: AgentLifecycleEvent,
  content: string,
  trace?: RunTrace,
): AgentLifecycleEvent {
  if (
    event.event_type !== "ToolCallStarted" ||
    event.data.parent_call_id ||
    event.data.provider_native === true ||
    event.data.tool_origin === "provider"
  ) {
    return event;
  }

  const preview = visibleLiveAssistantContent(content, trace);
  if (!preview.trim()) return event;
  return {
    ...event,
    data: {
      ...event.data,
      text_preview: preview,
    },
  };
}

/** Activity already communicates ordinary progress; only exceptional states need a notice. */
export function shouldShowChatRunStatusNotice(
  status: ChatRunStatus | undefined,
): boolean {
  return status === "retrying" || status === "failed" || status === "cancelled";
}

/**
 * Upsert the one assistant message that owns a live chat turn.
 *
 * Response text and activity are deliberately attached to the same message so
 * the UI never renders a separate trace card beside the streaming draft.
 */
export function upsertLiveAssistantDraft(
  messages: ChatMessage[],
  update: LiveAssistantDraftUpdate,
): ChatMessage[] {
  const existingIndex = messages.findIndex(
    (message) => message.id === update.id || message.persistedId === update.id,
  );
  if (existingIndex >= 0) {
    return messages.map((message, index) =>
      index === existingIndex
        ? isFinalizedAssistantMessage(message)
          ? message
          : {
              ...message,
              content: update.content,
              runStatus: update.runStatus,
              isLiveDraft: true,
              replyToMessageId: update.replyToMessageId,
              runTrace: update.runTrace ?? message.runTrace,
              runEnvelopeId: update.runEnvelopeId ?? message.runEnvelopeId,
            }
        : message,
    );
  }

  return [
    ...messages,
    {
      id: update.id,
      role: "assistant",
      content: update.content,
      timestamp: update.timestamp,
      replyToMessageId: update.replyToMessageId,
      runStatus: update.runStatus,
      runTrace: update.runTrace,
      runEnvelopeId: update.runEnvelopeId,
      isLiveDraft: true,
    },
  ];
}

function chatMessageIdentityMatches(
  existing: ChatMessage,
  incoming: ChatMessage,
): boolean {
  if (existing.id === incoming.id) return true;
  if (
    incoming.persistedId &&
    (existing.id === incoming.persistedId ||
      existing.persistedId === incoming.persistedId)
  ) {
    return true;
  }
  if (existing.persistedId === incoming.id) return true;

  if (existing.role !== "assistant" || incoming.role !== "assistant") {
    return false;
  }

  const sameInputMessage =
    Boolean(existing.replyToMessageId) &&
    existing.replyToMessageId === incoming.replyToMessageId;
  const sameRunEnvelope =
    Boolean(existing.runEnvelopeId) &&
    existing.runEnvelopeId === incoming.runEnvelopeId;
  return sameInputMessage || sameRunEnvelope;
}

function isFinalizedAssistantMessage(message: ChatMessage): boolean {
  return (
    message.role === "assistant" &&
    (message.isLiveDraft === false ||
      (Boolean(message.persistedId) && message.isLiveDraft !== true))
  );
}

function isTerminalRunStatus(status: ChatRunStatus | undefined): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

export function preferredChatRunTrace(
  existing: RunTrace | undefined,
  incoming: RunTrace | undefined,
): RunTrace | undefined {
  if (isTerminalChatRunTrace(incoming)) return incoming;
  if (isTerminalChatRunTrace(existing)) return existing;
  return incoming ?? existing;
}

function terminalSpanStatus(phase: RunPhase): TraceStatus {
  if (phase === "failed") return "failed";
  if (phase === "cancelled") return "cancelled";
  return "completed";
}

function settleAssistantActivitySpans(
  spans: TraceSpan[],
  status: TraceStatus,
  completedAt: string,
): TraceSpan[] {
  let changed = false;
  const settled = spans.map((span) => {
    const pending = span.status === "running" || span.status === "queued";
    const children = "children" in span ? span.children : undefined;
    const settledChildren = children
      ? settleAssistantActivitySpans(children, status, completedAt)
      : undefined;
    if (!pending && settledChildren === children) return span;
    changed = true;
    return {
      ...span,
      ...(pending ? { status, completedAt } : {}),
      ...(children ? { children: settledChildren } : {}),
    } as TraceSpan;
  });
  return changed ? settled : spans;
}

/**
 * A finalized assistant message is authoritative terminal state.
 *
 * This also repairs traces captured by an older animation frame before their
 * terminal lifecycle event reached the message, preventing stale spinners in
 * completed activity without mutating the stored trace.
 */
export function settledAssistantActivityTrace(
  message: ChatMessage,
  trace: RunTrace | undefined,
): RunTrace | undefined {
  if (!trace || message.isLiveDraft === true) return trace;

  const phase: Extract<RunPhase, "completed" | "failed" | "cancelled"> =
    message.runStatus === "failed" || trace.phase === "failed"
      ? "failed"
      : message.runStatus === "cancelled" || trace.phase === "cancelled"
        ? "cancelled"
        : "completed";
  const completedAt = trace.completedAt ?? message.timestamp;
  const spans = settleAssistantActivitySpans(
    trace.spans,
    terminalSpanStatus(phase),
    completedAt,
  );
  if (
    trace.phase === phase &&
    trace.completedAt === completedAt &&
    spans === trace.spans
  ) {
    return trace;
  }
  return { ...trace, phase, completedAt, spans };
}

function mergeChatMessageIdentity(
  existing: ChatMessage,
  incoming: ChatMessage,
): ChatMessage {
  const existingFinalized = isFinalizedAssistantMessage(existing);
  const incomingFinalized = isFinalizedAssistantMessage(incoming);
  const finalized = existingFinalized || incomingFinalized;
  const runStatus = isTerminalRunStatus(incoming.runStatus)
    ? incoming.runStatus
    : isTerminalRunStatus(existing.runStatus)
      ? existing.runStatus
      : (incoming.runStatus ?? existing.runStatus);

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    persistedId: incoming.persistedId ?? existing.persistedId,
    replyToMessageId: incoming.replyToMessageId ?? existing.replyToMessageId,
    content: incoming.content || existing.content,
    timestamp:
      existingFinalized && !incomingFinalized
        ? existing.timestamp
        : incoming.timestamp || existing.timestamp,
    status: incoming.status ?? existing.status,
    runStatus,
    runEnvelopeId: incoming.runEnvelopeId ?? existing.runEnvelopeId,
    runTrace: preferredChatRunTrace(existing.runTrace, incoming.runTrace),
    isLiveDraft: finalized
      ? false
      : (incoming.isLiveDraft ?? existing.isLiveDraft),
  };
}

/**
 * Collapse every representation of one assistant turn into one React message.
 *
 * The optimistic response UUID, worker message UUID, durable input-message
 * correlation, and local run envelope can arrive in different orders. Any of
 * those stable correlations identifies the same assistant turn. Final state
 * always wins over a late live-draft paint.
 */
export function compactDuplicateChatMessages(
  messages: ChatMessage[],
): ChatMessage[] {
  const compacted: ChatMessage[] = [];
  for (const message of messages) {
    const duplicateIndex = compacted.findIndex((existing) =>
      chatMessageIdentityMatches(existing, message),
    );
    if (duplicateIndex === -1) {
      compacted.push(message);
      continue;
    }
    compacted[duplicateIndex] = mergeChatMessageIdentity(
      compacted[duplicateIndex],
      message,
    );
  }
  return compacted;
}

/**
 * Chat activity is a local tool/lifecycle record, not a second transcript.
 * Token and reasoning deltas already belong to the assistant message draft.
 */
export function shouldPersistChatActivityEvent(
  event: AgentLifecycleEvent,
): boolean {
  return (
    event.event_type !== "AssistantTextDelta" &&
    event.event_type !== "AssistantReasoningDelta"
  );
}

/**
 * Gate recording only on client-side chat constraints. Transcription model
 * selection is server-owned so agent assignments can fall back to org defaults.
 */
export function isVoiceInputDisabled({
  voiceInputAvailable,
  hasSession,
  isAgentTarget,
  isDomainPending,
  hasActiveTurn,
  hasPendingCommand,
  hasPendingDomain,
}: {
  voiceInputAvailable: boolean;
  hasSession: boolean;
  isAgentTarget: boolean;
  isDomainPending: boolean;
  hasActiveTurn: boolean;
  hasPendingCommand: boolean;
  hasPendingDomain: boolean;
}): boolean {
  return (
    !voiceInputAvailable ||
    !hasSession ||
    !isAgentTarget ||
    isDomainPending ||
    hasActiveTurn ||
    hasPendingCommand ||
    hasPendingDomain
  );
}

/**
 * Create a non-poisoning FIFO for async chat stream processing.
 *
 * SSE parsers invoke callbacks synchronously and do not await async handlers.
 * This queue preserves wire order across lifecycle reduction, local envelope
 * writes, final-message attachment, and post-stream history reconciliation.
 */
export function createSerialChatWorkQueue(
  onError: (error: unknown) => void = () => {},
): SerialChatWorkQueue {
  let tail = Promise.resolve();
  return {
    enqueue(work) {
      tail = tail.then(work).catch((error) => {
        try {
          onError(error);
        } catch {
          // Error reporting must never poison later stream work.
        }
      });
    },
    drain() {
      return tail;
    },
  };
}

export function isTerminalChatRunTrace(trace: RunTrace | undefined): boolean {
  return (
    trace?.phase === "completed" ||
    trace?.phase === "failed" ||
    trace?.phase === "cancelled"
  );
}

export function visibleLiveChatRunTrace(
  trace: RunTrace | undefined,
): RunTrace | undefined {
  return trace && !isTerminalChatRunTrace(trace) ? trace : undefined;
}

export function retainedLiveChatRunTrace({
  trace,
  suppressed,
  finalized,
}: {
  trace: RunTrace | undefined;
  suppressed: boolean;
  finalized: boolean;
}): RunTrace | undefined {
  if (suppressed || finalized) return undefined;
  return visibleLiveChatRunTrace(trace);
}

/**
 * Select the trace state to reduce the next lifecycle event into.
 *
 * Chat completion can clear the live trace before a trailing RunCompleted or
 * AssistantMessageFinalized event is processed. Reusing the last trace only when the
 * event belongs to that same run preserves its tool spans without allowing a
 * new run to inherit activity from the previous turn.
 */
export function lifecycleTraceBase({
  activeTrace,
  receivedTrace,
  lastTrace,
  eventRunId,
}: {
  activeTrace: RunTrace | undefined;
  receivedTrace?: RunTrace;
  lastTrace: RunTrace | undefined;
  eventRunId: string | undefined;
}): RunTrace | undefined {
  if (activeTrace) return activeTrace;
  const candidate = receivedTrace ?? lastTrace;
  if (!candidate) return undefined;
  return !eventRunId || candidate.id === eventRunId ? candidate : undefined;
}

/** Resolve one stable identity for lifecycle reduction and local persistence. */
export function lifecycleRunIdentity(
  ...candidates: Array<string | undefined>
): string | undefined {
  return candidates.find((candidate) => Boolean(candidate));
}

export interface AssistantMessageIdentity {
  /** Stable React identity for an assistant message already rendered locally. */
  renderId: string;
  /** Database identity supplied by the worker's terminal response. */
  persistedId?: string;
}

/**
 * Resolve the local and durable identities for a completed assistant message.
 *
 * The worker owns the terminal response UUID, while the dashboard may already
 * have rendered streaming content under a temporary ID. Keeping the render ID
 * stable avoids UI churn while the worker ID becomes the persisted assistant
 * row identity. Activity correlation is handled separately by the durable
 * input-message identity.
 */
export function resolveAssistantMessageIdentity({
  localResponseId,
  workerMessageId,
  fallbackId,
}: {
  localResponseId?: string;
  workerMessageId?: string;
  fallbackId: string;
}): AssistantMessageIdentity {
  const renderId = localResponseId ?? workerMessageId ?? fallbackId;
  return {
    renderId,
    persistedId: workerMessageId,
  };
}

/** Return the durable input message used to hydrate assistant run activity. */
export function assistantActivityInputMessageId(message: {
  role: "user" | "assistant";
  replyToMessageId?: string;
}): string | undefined {
  return message.role === "assistant" ? message.replyToMessageId : undefined;
}

export function shouldShowLiveToolPreview(
  trace: RunTrace | undefined,
): boolean {
  return Boolean(visibleLiveChatRunTrace(trace));
}

export function shouldShowChatCancelControl({
  isTyping,
  activeRunTrace,
}: {
  isTyping: boolean;
  activeRunTrace: RunTrace | undefined;
}): boolean {
  if (visibleLiveChatRunTrace(activeRunTrace)) return true;
  if (isTerminalChatRunTrace(activeRunTrace)) return false;
  return isTyping;
}
