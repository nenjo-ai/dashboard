type ChatStreamAttempt = () => Promise<Response>;
type ChatStreamConsumer = (response: Response) => Promise<void>;

export type ChatStreamReconnect = {
  attempt: number;
  delayMs: number;
  error: unknown;
};

export type ChatStreamRetryOptions = {
  /** Total connection attempts. Omit for retries until cancellation/terminal state. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown) => boolean;
  onConnected?: (reconnected: boolean) => void;
  onReconnecting?: (state: ChatStreamReconnect) => void;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function reconnectDelay(
  retryNumber: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
): number {
  const capped = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, retryNumber - 1),
  );
  if (capped === 0 || jitterRatio === 0) return capped;
  const jitter = capped * jitterRatio;
  return Math.max(0, Math.round(capped - jitter + Math.random() * jitter * 2));
}

async function waitForReconnect(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("The chat stream was cancelled", "AbortError");
  }
  if (ms === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("The chat stream was cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Reconnect a chat SSE request until it reaches a terminal event or is
 * cancelled. The caller must keep the request's idempotency identity stable,
 * so reconnects attach to the existing worker run instead of issuing another
 * command.
 */
export async function consumeChatStreamWithRetry(
  attempt: ChatStreamAttempt,
  consume: ChatStreamConsumer,
  signal?: AbortSignal,
  options: ChatStreamRetryOptions = {},
): Promise<void> {
  const {
    maxAttempts = Number.POSITIVE_INFINITY,
    baseDelayMs = 1_000,
    maxDelayMs = 15_000,
    jitterRatio = 0.2,
    shouldRetry = () => true,
    onConnected,
    onReconnecting,
  } = options;
  let attemptNumber = 0;

  while (attemptNumber < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException("The chat stream was cancelled", "AbortError");
    }
    attemptNumber += 1;

    try {
      const response = await attempt();
      onConnected?.(attemptNumber > 1);
      await consume(response);
      return;
    } catch (error) {
      if (
        isAbortError(error) ||
        signal?.aborted ||
        !shouldRetry(error) ||
        attemptNumber >= maxAttempts
      ) {
        throw error;
      }
      const delayMs = reconnectDelay(
        attemptNumber,
        baseDelayMs,
        maxDelayMs,
        jitterRatio,
      );
      onReconnecting?.({ attempt: attemptNumber + 1, delayMs, error });
      await waitForReconnect(delayMs, signal);
    }
  }
}
