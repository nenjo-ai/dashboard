import type { RunTrace } from "../agentRunTrace/types";
import type { ChatStreamSnapshot } from "../chatStreamDurability";
import { appendPreview, upsertActiveTool } from "./toolCalls.ts";
import { isTerminalChatPhase } from "./terminal.ts";
import type {
  ActiveToolEntry,
  ChatLifecycle,
  ChatPhase,
  ChatTurnError,
  ChatTurnState,
} from "./types";

export type ChatTurnEvent =
  | {
      type: "prompt_submitted";
      requestId: string;
      responseId: string;
      runTrace?: RunTrace;
    }
  | { type: "model_invoked" }
  | { type: "phase_changed"; phase: ChatPhase }
  | { type: "text_delta"; delta: string }
  | { type: "content_replaced"; content: string }
  | { type: "tool_upserted"; tool: ActiveToolEntry }
  | { type: "tools_replaced"; tools: ActiveToolEntry[] }
  | { type: "preview_appended"; preview?: string }
  | { type: "preview_replaced"; preview?: string }
  | { type: "trace_replaced"; runTrace?: RunTrace }
  | { type: "completed" }
  | { type: "failed"; error?: ChatTurnError }
  | { type: "cancelled" }
  | { type: "restored"; snapshot: ChatStreamSnapshot }
  | { type: "reset" };

export const EMPTY_CHAT_TURN: ChatTurnState = {
  phase: "idle",
  content: "",
  activeTools: [],
};

export function createChatTurnState(
  state: Partial<ChatTurnState> = {},
): ChatTurnState {
  return {
    ...EMPTY_CHAT_TURN,
    ...state,
    activeTools: state.activeTools ?? [],
  };
}

function canApplyTurnEvent(
  state: ChatTurnState,
  event: ChatTurnEvent,
): boolean {
  if (!isTerminalChatPhase(state.phase)) return true;
  return event.type === "prompt_submitted" || event.type === "reset";
}

/**
 * The single transient state machine for an assistant turn. Terminal events
 * are deliberately idempotent: duplicated or late stream frames cannot bring
 * a completed/cancelled/failed turn back to life.
 */
export function chatTurnReducer(
  state: ChatTurnState,
  event: ChatTurnEvent,
): ChatTurnState {
  if (!canApplyTurnEvent(state, event)) return state;

  switch (event.type) {
    case "prompt_submitted":
      return createChatTurnState({
        phase: "connecting",
        requestId: event.requestId,
        responseId: event.responseId,
        runTrace: event.runTrace,
      });
    case "model_invoked":
      return { ...state, phase: "thinking" };
    case "phase_changed":
      return { ...state, phase: event.phase };
    case "text_delta":
      return {
        ...state,
        phase: "streaming",
        content: state.content + event.delta,
      };
    case "content_replaced":
      return { ...state, phase: "streaming", content: event.content };
    case "tool_upserted":
      return {
        ...state,
        phase: event.tool.status === "running" ? "using_tool" : "thinking",
        activeTools: upsertActiveTool(state.activeTools, event.tool),
      };
    case "tools_replaced":
      return { ...state, activeTools: event.tools };
    case "preview_appended":
      return {
        ...state,
        activityPreview: appendPreview(state.activityPreview, event.preview),
      };
    case "preview_replaced":
      return { ...state, activityPreview: event.preview };
    case "trace_replaced":
      return { ...state, runTrace: event.runTrace };
    case "completed":
      return {
        ...state,
        phase: "completed",
        activeTools: [],
        activityPreview: undefined,
      };
    case "failed":
      return {
        ...state,
        phase: "failed",
        activeTools: [],
        activityPreview: undefined,
        error: event.error,
      };
    case "cancelled":
      return {
        ...state,
        phase: "cancelled",
        activeTools: [],
        activityPreview: undefined,
      };
    case "restored": {
      const { snapshot } = event;
      const terminal = [
        "done",
        "completed",
        "error",
        "failed",
        "cancelled",
      ].includes(snapshot.status);
      const phase: ChatPhase = terminal
        ? snapshot.status === "cancelled"
          ? "cancelled"
          : snapshot.status === "error" || snapshot.status === "failed"
            ? "failed"
            : "completed"
        : snapshot.status === "connecting"
          ? "connecting"
          : snapshot.status === "using_tool"
            ? "using_tool"
            : snapshot.content
              ? "streaming"
              : "thinking";
      return createChatTurnState({
        phase,
        requestId: snapshot.requestId,
        responseId: snapshot.responseId ?? snapshot.requestId,
        content: snapshot.content,
        activityPreview: snapshot.livePreview,
        activeTools: snapshot.activeTools ?? [],
        runTrace: snapshot.activeRunTrace as RunTrace | undefined,
      });
    }
    case "reset":
      return EMPTY_CHAT_TURN;
  }
}

export function chatLifecycle(state: ChatTurnState): ChatLifecycle {
  const isActive = !isTerminalChatPhase(state.phase) && state.phase !== "idle";
  const statusText: Partial<Record<ChatPhase, string>> = {
    connecting: "Connecting to the agent",
    waiting: "Waiting for the agent",
    thinking: "Agent is thinking",
    streaming: "Agent is responding",
    using_tool: "Agent is using a tool",
    finalizing: "Finalizing response",
  };
  return {
    phase: state.phase,
    isActive,
    isTyping: isActive,
    statusText: statusText[state.phase],
    ...(isActive && state.responseId ? { responseId: state.responseId } : {}),
  };
}
