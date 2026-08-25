import type {
  ChatStreamClearSnapshot,
  ChatStreamSnapshot,
} from "../chatStreamDurability.ts";

export type ChatSessionIndicatorStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ChatSessionIndicator = {
  status: ChatSessionIndicatorStatus;
  responseId?: string;
  updatedAt: number;
};

export type ChatSessionIndicatorState = Record<string, ChatSessionIndicator>;

type SessionIndicatorEvent = ChatStreamSnapshot | ChatStreamClearSnapshot;

function isTerminalIndicator(status: ChatSessionIndicatorStatus): boolean {
  return status !== "running";
}

function indicatorForEvent(
  event: SessionIndicatorEvent,
): ChatSessionIndicator | undefined {
  if ("clear" in event) {
    if (!event.terminalStatus) return undefined;
    return {
      status: event.terminalStatus,
      responseId: event.responseId,
      updatedAt: event.updatedAt,
    };
  }

  const status: ChatSessionIndicatorStatus =
    event.status === "failed" || event.status === "error"
      ? "failed"
      : event.status === "cancelled"
        ? "cancelled"
        : event.status === "completed" || event.status === "done"
          ? "completed"
          : "running";

  return {
    status,
    responseId: event.responseId ?? event.requestId,
    updatedAt: event.updatedAt,
  };
}

/**
 * Project stream checkpoints into one status per session. A terminal event is
 * absorbing for its response so delayed active frames cannot revive it; a new
 * response identity can start the same session again.
 */
export function reduceChatSessionIndicators(
  state: ChatSessionIndicatorState,
  event: SessionIndicatorEvent,
): ChatSessionIndicatorState {
  const existing = state[event.sessionId];
  const incoming = indicatorForEvent(event);

  if (!incoming) {
    if (!existing) return state;
    if (
      event.responseId &&
      existing.responseId &&
      event.responseId !== existing.responseId
    ) {
      return state;
    }
    const next = { ...state };
    delete next[event.sessionId];
    return next;
  }

  if (existing && incoming.updatedAt < existing.updatedAt) return state;

  const sameResponse = existing?.responseId === incoming.responseId;
  if (existing && sameResponse && isTerminalIndicator(existing.status)) {
    return state;
  }

  if (
    existing &&
    existing.status === incoming.status &&
    existing.responseId === incoming.responseId &&
    existing.updatedAt === incoming.updatedAt
  ) {
    return state;
  }

  return { ...state, [event.sessionId]: incoming };
}
