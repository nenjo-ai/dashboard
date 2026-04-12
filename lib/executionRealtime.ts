"use client";

import { createExecutionEventStream } from "./api";
import { consumeSseStream, type SseEvent } from "./chatStream";

export type ExecutionRealtimeEvent = SseEvent & {
  data: Record<string, unknown>;
};

export async function subscribeExecutionRealtime(
  onEvent: (event: ExecutionRealtimeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await createExecutionEventStream(signal);
  await consumeSseStream(response, (event) => {
    if (typeof event.data !== "object" || event.data === null) {
      return;
    }
    onEvent(event as ExecutionRealtimeEvent);
  });
}
