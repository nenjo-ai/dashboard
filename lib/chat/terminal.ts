import type { ChatRunStatus } from "../types";
import type { ChatPhase } from "./types";

export const TERMINAL_CHAT_PHASES = new Set<ChatPhase>([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminalChatPhase(phase: ChatPhase): boolean {
  return TERMINAL_CHAT_PHASES.has(phase);
}

export function terminalPhaseForStatus(
  status: NonNullable<ChatRunStatus>,
): Extract<ChatPhase, "completed" | "failed" | "cancelled"> | undefined {
  if (status === "completed" || status === "failed" || status === "cancelled") {
    return status;
  }
  return undefined;
}

export function isTerminalAssistantStatus(status: string | undefined): boolean {
  return Boolean(status && status !== "in_progress");
}
