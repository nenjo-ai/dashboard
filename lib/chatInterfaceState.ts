import type { RunTrace } from "./agentRunTrace/types";

export interface SerialChatWorkQueue {
  /** Schedule work after every previously scheduled stream operation. */
  enqueue(work: () => void | Promise<void>): void;
  /** Wait until all work scheduled so far has settled. */
  drain(): Promise<void>;
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
 * AssistantResponse event is processed. Reusing the last trace only when the
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
export function lifecycleRunIdentity(...candidates: Array<string | undefined>): string | undefined {
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
