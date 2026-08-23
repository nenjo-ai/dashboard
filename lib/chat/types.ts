import type { ChatRunStatus } from "../types";
import type { RunTrace } from "../agentRunTrace/types";
import type { ChatStreamToolSnapshot } from "../chatStreamDurability";

export type ChatTargetType = "agent" | "council";

export type ChatPhase =
  | "idle"
  | "connecting"
  | "waiting"
  | "thinking"
  | "streaming"
  | "using_tool"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type ActiveToolEntry = ChatStreamToolSnapshot;

export interface ChatTurnError {
  code?: string;
  message: string;
  retryable?: boolean;
}

/**
 * Browser-only state for the one live assistant turn. Final messages and tool
 * calls remain owned by persisted chat history and the run envelope store.
 */
export interface ChatTurnState {
  phase: ChatPhase;
  requestId?: string;
  responseId?: string;
  content: string;
  activityPreview?: string;
  activeTools: ActiveToolEntry[];
  runTrace?: RunTrace;
  error?: ChatTurnError;
}

export interface ChatLifecycle {
  phase: ChatPhase;
  isActive: boolean;
  isTyping: boolean;
  statusText?: string;
  /** The only assistant message allowed to render transient live UI. */
  responseId?: string;
}

export function activeChatPhaseForRunStatus(
  status: ChatRunStatus | undefined,
  hasResponseContent: boolean,
): ChatPhase {
  if (status === "connecting") return "connecting";
  if (status === "retrying") return "waiting";
  if (status === "using_tool") return "using_tool";
  if (status === "generating" && hasResponseContent) return "streaming";
  return "thinking";
}

export function chatRunStatusForPhase(
  phase: ChatPhase,
): ChatRunStatus | undefined {
  switch (phase) {
    case "connecting":
    case "waiting":
      return "connecting";
    case "thinking":
    case "streaming":
    case "finalizing":
      return "generating";
    case "using_tool":
    case "completed":
    case "failed":
    case "cancelled":
      return phase;
    case "idle":
      return undefined;
  }
}
