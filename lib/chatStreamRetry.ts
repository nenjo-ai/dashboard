type ChatStreamAttempt = () => Promise<Response>;
type ChatStreamConsumer = (response: Response) => Promise<void>;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Reconnect a chat SSE request once using the caller's unchanged request body.
 * The request's `id` is its API idempotency key, so a reconnect can recover a
 * lost stream without issuing another worker command.
 */
export async function consumeChatStreamWithRetry(
  attempt: ChatStreamAttempt,
  consume: ChatStreamConsumer,
  signal?: AbortSignal,
): Promise<void> {
  let lastError: unknown;

  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    if (signal?.aborted) {
      throw new DOMException("The chat stream was cancelled", "AbortError");
    }

    try {
      await consume(await attempt());
      return;
    } catch (error) {
      if (isAbortError(error) || signal?.aborted || attemptNumber === 1) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}
