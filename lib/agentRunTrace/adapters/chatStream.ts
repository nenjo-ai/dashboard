import type { AgentLifecycleEvent } from "../types";

export interface NormalizedTraceStreamEvent {
  event_type: string;
  data?: Record<string, unknown>;
}

export const canonicalLifecycleEventTypes = [
  "RunStarted",
  "RunCompleted",
  "RunFailed",
  "RunCancelled",
  "Paused",
  "Resumed",
  "ModelRequestStarted",
  "AssistantTextDelta",
  "AssistantResponse",
  "ModelRequestCompleted",
  "MessageCompacted",
  "ToolCallStarted",
  "ToolOutputDelta",
  "ToolCallCompleted",
  "AsyncOperationEvent",
  "AsyncOperationTranscript",
  "HookStarted",
  "HookCompleted",
] as const;

const canonicalLifecycleEvents = new Set<string>(canonicalLifecycleEventTypes);

function recordField(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function mergeAsyncOperationPayload(
  eventType: string,
  data: Record<string, unknown>,
  payload: object,
): Record<string, unknown> {
  const fields = payload as Record<string, unknown>;
  if (eventType === "AsyncOperationEvent") {
    return {
      ...data,
      label: nonEmptyString(fields.label) ?? data.label,
      summary: nonEmptyString(fields.summary) ?? data.summary,
    };
  }
  if (eventType === "AsyncOperationTranscript") {
    return {
      ...data,
      label: nonEmptyString(fields.label) ?? data.label,
      event: recordField(fields.event) ?? data.event,
    };
  }
  return data;
}

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
