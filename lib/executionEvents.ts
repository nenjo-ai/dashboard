export const EXECUTION_EVENT_TYPE = "execution.event" as const;

export const ExecutionEventKind = {
  WorkflowStep: "workflow.step",
  AgentTrace: "agent.trace",
  TaskCompleted: "task.completed",
} as const;

export type ExecutionEventKind =
  (typeof ExecutionEventKind)[keyof typeof ExecutionEventKind];
