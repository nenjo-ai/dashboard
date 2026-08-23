import type { AgentLifecycleEvent } from "../agentRunTrace/types";
import { createChatStream } from "../api";
import { consumeSseStream } from "../chatStream";
import { consumeChatStreamWithRetry } from "../chatStreamRetry";
import type { ChatStreamRequest } from "../types";
import { CHAT_STREAM_PROTOCOL_VERSION } from "./constants.ts";

export type NormalizedStreamEvent = {
  event_type: string;
  data: Record<string, unknown>;
};

export type RawChatStreamEvent = { event: string; data: unknown };

/** Own the fetch/SSE/retry lifecycle so the controller only handles events. */
export function subscribeToChatStream({
  request,
  afterSequence,
  signal,
  onEvent,
}: {
  request: ChatStreamRequest;
  afterSequence?: number;
  signal: AbortSignal;
  onEvent: (event: RawChatStreamEvent) => void;
}): Promise<void> {
  return consumeChatStreamWithRetry(
    () =>
      createChatStream(
        { ...request, after_sequence: afterSequence || undefined },
        signal,
      ),
    (response) => consumeSseStream(response, onEvent),
    signal,
  );
}

const EVENT_TYPE_MAP: Record<string, string> = {
  hook_started: "HookStarted",
  hook_completed: "HookCompleted",
  run_started: "RunStarted",
  run_completed: "RunCompleted",
  run_failed: "RunFailed",
  run_cancelled: "RunCancelled",
  model_request_started: "ModelRequestStarted",
  assistant_text_delta: "AssistantTextDelta",
  assistant_reasoning_delta: "AssistantReasoningDelta",
  model_request_completed: "ModelRequestCompleted",
  tool_call_started: "ToolCallStarted",
  tool_call_updated: "ToolCallUpdated",
  tool_output_delta: "ToolOutputDelta",
  tool_call_completed: "ToolCallCompleted",
  provider_retry_scheduled: "ProviderRetryScheduled",
  progress_update: "ProgressUpdate",
  assistant_message_finalized: "AssistantMessageFinalized",
  async_operation_event: "AsyncOperationEvent",
  async_operation_transcript: "AsyncOperationTranscript",
  done: "Done",
  error: "Error",
  domain_entered: "DomainEntered",
  domain_exited: "DomainExited",
  message_compacted: "MessageCompacted",
  paused: "Paused",
  resumed: "Resumed",
};

/** Normalize versioned frames, snapshots, and legacy SSE names at one edge. */
export function normalizeSseAgentEvent(event: {
  event: string;
  data: unknown;
}): NormalizedStreamEvent | null {
  if (
    event.event === "snapshot" &&
    event.data &&
    typeof event.data === "object"
  ) {
    return {
      event_type: "ChatRunSnapshot",
      data: event.data as Record<string, unknown>,
    };
  }
  if (
    event.event === "chat_stream_frame" &&
    event.data &&
    typeof event.data === "object"
  ) {
    const frame = event.data as {
      protocol_version?: unknown;
      sequence?: unknown;
      run_id?: unknown;
      input_message_id?: unknown;
      event?: { event_type?: unknown; data?: unknown };
    };
    if (
      frame.protocol_version === CHAT_STREAM_PROTOCOL_VERSION &&
      typeof frame.event?.event_type === "string"
    ) {
      return {
        event_type: frame.event.event_type,
        data: {
          ...((frame.event.data as Record<string, unknown> | undefined) ?? {}),
          __sequence: frame.sequence,
          __frame_run_id: frame.run_id,
          __input_message_id: frame.input_message_id,
        },
      };
    }
  }
  if (typeof event.data === "object" && event.data !== null) {
    const wrapped = event.data as { event_type?: unknown; data?: unknown };
    if (typeof wrapped.event_type === "string") {
      return {
        event_type: wrapped.event_type,
        data: (wrapped.data as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  const eventType = EVENT_TYPE_MAP[event.event];
  if (!eventType || typeof event.data !== "object" || event.data === null) {
    return null;
  }
  return {
    event_type: eventType,
    data: event.data as Record<string, unknown>,
  };
}

export function lifecycleRunId(event: AgentLifecycleEvent): string | undefined {
  return "run_id" in event.data ? event.data.run_id : undefined;
}

export function lifecycleSessionId(
  event: AgentLifecycleEvent,
): string | undefined {
  return "session_id" in event.data ? event.data.session_id : undefined;
}
