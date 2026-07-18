export const EXECUTION_EVENT_TYPE = "execution.event" as const;

export const ExecutionEventKind = {
  WorkflowStep: "workflow.step",
  AgentTrace: "agent.trace",
  TaskArtifacts: "task.artifacts",
} as const;

export type ExecutionEventKind =
  (typeof ExecutionEventKind)[keyof typeof ExecutionEventKind];

/** True when a realtime payload means execution state can be refreshed. */
export function executionRealtimeEventIsTerminal(
  data: Record<string, unknown>,
): boolean {
  if (data.type !== "task.execution_state") return false;
  const state = typeof data.state === "object" && data.state !== null
    ? data.state as Record<string, unknown>
    : null;
  const status = state?.status;
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "rejected"
  );
}
