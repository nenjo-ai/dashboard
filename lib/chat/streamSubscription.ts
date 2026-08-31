import { consumeChatStreamWithRetry } from "../chatStreamRetry.ts";
import type { ChatStreamRetryOptions } from "../chatStreamRetry.ts";
import type { ChatStreamSubscriptionRequest } from "../types";

export type RawChatStreamEvent = { event: string; data: unknown };

export type ChatStreamConnectionState =
  | { state: "connected"; reconnected: boolean }
  | { state: "reconnecting"; attempt: number; delayMs: number };

export type ChatStreamTransport = {
  create: (
    request: Exclude<ChatStreamSubscriptionRequest, { retry_of_run_id: string }>,
    signal?: AbortSignal,
  ) => Promise<Response>;
  retry: (
    runId: string,
    request: { attempt_id: string; after_sequence?: number },
    signal?: AbortSignal,
  ) => Promise<Response>;
  consume: (
    response: Response,
    onEvent: (event: RawChatStreamEvent) => void,
  ) => Promise<void>;
};

export type SubscriptionRetryOptions = Pick<
  ChatStreamRetryOptions,
  "maxAttempts" | "baseDelayMs" | "maxDelayMs" | "jitterRatio"
>;

class ChatStreamEndedBeforeTerminalEvent extends Error {
  constructor() {
    super("Chat stream ended before the run reached a terminal state");
    this.name = "ChatStreamEndedBeforeTerminalEvent";
  }
}

function shouldReconnectChatStream(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("status" in error) ||
    typeof error.status !== "number"
  ) {
    return true;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

/** Reopen one durable run until a terminal frame arrives or cancellation wins. */
export function subscribeToDurableChatStream({
  request,
  afterSequence,
  getAfterSequence,
  signal,
  onEvent,
  onConnectionState,
  transport,
  retryOptions,
  isTerminalEvent,
}: {
  request: ChatStreamSubscriptionRequest;
  afterSequence?: number;
  getAfterSequence?: () => number | undefined;
  signal: AbortSignal;
  onEvent: (event: RawChatStreamEvent) => void;
  onConnectionState?: (state: ChatStreamConnectionState) => void;
  transport: ChatStreamTransport;
  retryOptions?: SubscriptionRetryOptions;
  isTerminalEvent: (event: RawChatStreamEvent) => boolean;
}): Promise<void> {
  let terminalEventSeen = false;
  return consumeChatStreamWithRetry(
    () =>
      "retry_of_run_id" in request
        ? transport.retry(
            request.retry_of_run_id,
            {
              attempt_id: request.attempt_id,
              after_sequence:
                getAfterSequence?.() ?? afterSequence ?? undefined,
            },
            signal,
          )
        : transport.create(
            {
              ...request,
              after_sequence:
                getAfterSequence?.() ?? afterSequence ?? undefined,
            },
            signal,
          ),
    async (response) => {
      await transport.consume(response, (event) => {
        if (isTerminalEvent(event)) terminalEventSeen = true;
        onEvent(event);
      });
      if (!terminalEventSeen) {
        throw new ChatStreamEndedBeforeTerminalEvent();
      }
    },
    signal,
    {
      ...retryOptions,
      shouldRetry: shouldReconnectChatStream,
      onConnected: (reconnected) =>
        onConnectionState?.({ state: "connected", reconnected }),
      onReconnecting: ({ attempt, delayMs }) =>
        onConnectionState?.({ state: "reconnecting", attempt, delayMs }),
    },
  );
}
