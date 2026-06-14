import type { AgentLifecycleEvent } from "../types";

export interface NormalizedTraceStreamEvent {
  event_type: string;
  data?: Record<string, unknown>;
}

const canonicalLifecycleEvents = new Set<string>([
  "RunStarted",
  "RunCompleted",
  "RunFailed",
  "RunCancelled",
  "Paused",
  "Resumed",
  "ModelRequestStarted",
  "AssistantTextDelta",
  "ModelRequestCompleted",
  "MessageCompacted",
  "ToolCallStarted",
  "ToolOutputDelta",
  "ToolCallCompleted",
  "AsyncOperationEvent",
  "AsyncOperationTranscript",
  "HookStarted",
  "HookCompleted",
]);

export function chatStreamEventToLifecycleEvent(
  event: NormalizedTraceStreamEvent,
): AgentLifecycleEvent | undefined {
  if (!canonicalLifecycleEvents.has(event.event_type)) return undefined;
  const data = event.data ?? {};
  if (
    (event.event_type === "HookStarted" ||
      event.event_type === "HookCompleted") &&
    typeof data.call_id !== "string"
  ) {
    return undefined;
  }
  return { ...event, data } as AgentLifecycleEvent;
}
