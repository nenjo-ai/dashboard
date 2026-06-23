import type { RunTrace } from "./agentRunTrace/types";

export function isTerminalChatRunTrace(trace: RunTrace | undefined): boolean {
  return (
    trace?.phase === "completed" ||
    trace?.phase === "failed" ||
    trace?.phase === "cancelled"
  );
}

export function visibleLiveChatRunTrace(
  trace: RunTrace | undefined,
): RunTrace | undefined {
  return trace && !isTerminalChatRunTrace(trace) ? trace : undefined;
}

export function retainedLiveChatRunTrace({
  trace,
  suppressed,
  finalized,
}: {
  trace: RunTrace | undefined;
  suppressed: boolean;
  finalized: boolean;
}): RunTrace | undefined {
  if (suppressed || finalized) return undefined;
  return visibleLiveChatRunTrace(trace);
}

export function shouldShowLiveToolPreview(
  trace: RunTrace | undefined,
): boolean {
  return Boolean(visibleLiveChatRunTrace(trace));
}

export function shouldShowChatCancelControl({
  isTyping,
  activeRunTrace,
}: {
  isTyping: boolean;
  activeRunTrace: RunTrace | undefined;
}): boolean {
  if (visibleLiveChatRunTrace(activeRunTrace)) return true;
  if (isTerminalChatRunTrace(activeRunTrace)) return false;
  return isTyping;
}
