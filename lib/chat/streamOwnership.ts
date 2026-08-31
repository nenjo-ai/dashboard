import type { ChatRunStatus } from "../types";

type ChatTurnOccupancy = {
  runStatus?: ChatRunStatus;
  hasRequest: boolean;
  hasResponse: boolean;
  hasActiveTools: boolean;
  hasLivePreview: boolean;
  hasActiveTrace: boolean;
};

function isTerminalRunStatus(status: ChatRunStatus | undefined): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

/** Terminal lifecycle state wins over refs retained until stream cleanup. */
export function chatTurnHasActiveWork(occupancy: ChatTurnOccupancy): boolean {
  if (isTerminalRunStatus(occupancy.runStatus)) return false;
  return (
    occupancy.hasRequest ||
    occupancy.hasResponse ||
    occupancy.hasActiveTools ||
    occupancy.hasLivePreview ||
    occupancy.hasActiveTrace
  );
}

/** Async stream completion may only mutate the attempt that created it. */
export function streamAttemptOwnsLiveTurn(
  streamAttemptId: string,
  activeAttemptId: string | undefined,
): boolean {
  return streamAttemptId === activeAttemptId;
}

export function isTerminalStreamSnapshotStatus(status: string): boolean {
  return (
    status === "completed" ||
    status === "done" ||
    status === "failed" ||
    status === "error" ||
    status === "cancelled"
  );
}
