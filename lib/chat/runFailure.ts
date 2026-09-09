import type { ChatMessage, TerminalChatTraceRun } from "../types";

export const DEFAULT_CHAT_RUN_FAILURE_MESSAGE =
  "The model provider could not complete the response.";

export type FailedChatRunProjection = {
  existingResponseId?: string;
  runId?: string;
  activeRunId?: string;
  runEnvelopeId?: string;
  fallbackResponseId: string;
  inputMessageId?: string;
  content: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  timestamp: string;
};

/** Build the same failed assistant message for live and restored run events. */
export function projectFailedChatRunMessage(
  projection: FailedChatRunProjection,
): ChatMessage {
  const id =
    projection.existingResponseId ??
    projection.runId ??
    projection.fallbackResponseId;
  const runEnvelopeId =
    projection.runEnvelopeId ?? projection.runId ?? projection.activeRunId;

  return {
    id,
    role: "assistant",
    content: projection.content,
    timestamp: projection.timestamp,
    replyToMessageId: projection.inputMessageId,
    runStatus: "failed",
    errorCode: projection.errorCode,
    errorMessage:
      projection.errorMessage ?? DEFAULT_CHAT_RUN_FAILURE_MESSAGE,
    retryable: projection.retryable === true,
    isLiveDraft: false,
    ...(runEnvelopeId ? { runEnvelopeId } : {}),
  };
}

export function upsertFailedChatRunMessage(
  messages: ChatMessage[],
  failed: ChatMessage,
): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === failed.id);
  if (index < 0) return [...messages, failed];
  return messages.map((message, messageIndex) =>
    messageIndex === index ? { ...message, ...failed } : message,
  );
}

/** Restore a terminal run that has no persisted assistant response. */
export function projectTerminalChatTraceRun(
  run: TerminalChatTraceRun,
): ChatMessage {
  if (run.status === "failed") {
    return projectFailedChatRunMessage({
      runId: run.run_id,
      fallbackResponseId: run.run_id,
      inputMessageId: run.input_message_id,
      content: "",
      errorCode: run.error_code ?? undefined,
      errorMessage: run.error_message ?? undefined,
      retryable: run.error_retryable,
      timestamp: run.updated_at,
    });
  }
  return {
    id: run.run_id,
    role: "assistant",
    content: "",
    timestamp: run.updated_at,
    replyToMessageId: run.input_message_id,
    runEnvelopeId: run.run_id,
    runStatus: "cancelled",
    errorCode: run.error_code ?? undefined,
    errorMessage: run.error_message ?? undefined,
    isLiveDraft: false,
  };
}
