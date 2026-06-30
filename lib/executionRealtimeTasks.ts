import type {
  ExecutionTask,
  ExecutionTaskCurrentStep,
  EncryptedPayload,
  StepAgent,
  StepStatus,
  TaskStatus,
  TaskStepProgress,
} from "./types";
import { EXECUTION_EVENT_TYPE, ExecutionEventKind } from "./executionEvents.ts";

type EventRecord = Record<string, unknown>;

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function executionEventPayload(data: EventRecord): Record<string, unknown> | null {
  if (data.type !== EXECUTION_EVENT_TYPE) return null;
  return recordField(data.event);
}

function workflowStepEventData(data: EventRecord): EventRecord | null {
  const event = executionEventPayload(data);
  if (!event || event.kind !== ExecutionEventKind.WorkflowStep) return null;
  return recordField(event.data);
}

function taskCompletedEventData(data: EventRecord): EventRecord | null {
  const event = executionEventPayload(data);
  if (!event || event.kind !== ExecutionEventKind.TaskCompleted) return null;
  return recordField(event.data);
}

function stepStatus(eventType: string): StepStatus {
  switch (eventType) {
    case "step_completed":
    case "tool_completed":
    case "ability_completed":
    case "delegation_completed":
    case "done":
      return "passed";
    case "step_failed":
    case "tool_failed":
    case "ability_failed":
    case "delegation_failed":
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "step_started":
    case "tool_started":
    case "ability_started":
    case "delegation_started":
    case "running":
    case "progress":
    case "step_warning":
      return "running";
    default:
      return "pending";
  }
}

function taskStatusFromCompleted(success: boolean): TaskStatus {
  return success ? "done" : "failed";
}

function isTerminalStepEvent(eventType: string): boolean {
  return stepStatus(eventType) === "passed" || stepStatus(eventType) === "failed";
}

function isChildActivityStep(step: TaskStepProgress): boolean {
  return (
    step.step_type === "tool" ||
    step.step_type === "ability" ||
    step.step_type === "delegation"
  );
}

function stepAgent(data: Record<string, unknown>): StepAgent | null {
  const agent = recordField(data.agent);
  if (!agent) return null;

  const agentSlug = stringField(agent.agent);
  if (!agentSlug) return null;

  return {
    agent: agentSlug,
    agent_name: stringField(agent.agent_name),
    agent_color: stringField(agent.agent_color),
  };
}

export function taskStepFromRealtimeEvent(
  data: EventRecord,
  nowIso = new Date().toISOString(),
): TaskStepProgress | null {
  const workflow = workflowStepEventData(data);
  if (!workflow) return null;
  const source = workflow;

  const eventType = stringField(source.event_type);
  const stepName = stringField(source.step_name);
  if (!eventType || !stepName) return null;

  const stepType = stringField(source.step_type) ?? "agent";
  const createdAt = stringField(data.created_at) ?? nowIso;
  const payload = recordField(source.payload);
  const eventData = recordField(source.data) ?? {};
  const encryptedPayload = recordField(source.encrypted_payload) as EncryptedPayload | null;
  const status = stepStatus(eventType);

  return {
    step_name: stepName,
    step_type: stepType,
    status,
    event_type: eventType,
    created_at: createdAt,
    started_at: status === "running" || status === "passed" || status === "failed"
      ? createdAt
      : null,
    completed_at: isTerminalStepEvent(eventType) ? createdAt : null,
    duration_ms: numberField(source.duration_ms),
    data: eventData,
    payload,
    encrypted_payload: encryptedPayload,
    agent: stepAgent(source),
  };
}

function currentStepFromStep(step: TaskStepProgress): ExecutionTaskCurrentStep | null {
  if (step.status !== "running") return null;

  const stepSlug = stringField(step.data?.step_slug);
  if (isChildActivityStep(step) && stepSlug) {
    return {
      step_name: stepSlug,
      step_type: "agent",
      status: "running",
      event_type: step.event_type,
      created_at: step.created_at ?? new Date().toISOString(),
      agent: step.agent,
    };
  }

  return {
    step_name: step.step_name,
    step_type: step.step_type,
    status: step.status,
    event_type: step.event_type,
    created_at: step.created_at ?? new Date().toISOString(),
    agent: step.agent,
  };
}

function stepIdentity(step: TaskStepProgress): string {
  const toolCallId = stringField(step.data?.tool_call_id);
  if (toolCallId) return `tool-call:${toolCallId}`;

  const callId = stringField(step.data?.call_id);
  if (callId) return `${step.step_type}:${callId}`;

  const toolCallIds = Array.isArray(step.data?.tool_call_ids)
    ? step.data.tool_call_ids.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  if (toolCallIds.length > 0) {
    return `${step.step_type}:tool-calls:${toolCallIds.join(",")}`;
  }

  const stepRunId = stringField(step.data?.step_run_id);
  if (isChildActivityStep(step) && stepRunId) {
    return `${step.step_type}:${step.step_name}:step-run:${stepRunId}`;
  }
  if (stepRunId) return `step-run:${stepRunId}`;

  return `${step.step_type}:${step.step_name}:${step.event_type}:${step.created_at ?? ""}`;
}

function appendOrReplaceStep(
  steps: TaskStepProgress[],
  next: TaskStepProgress,
): TaskStepProgress[] {
  const key = stepIdentity(next);
  const existingIndex = steps.findIndex((step) => stepIdentity(step) === key);
  if (existingIndex === -1) return [...steps, next];
  if (
    next.status === "running" &&
    (steps[existingIndex].status === "passed" || steps[existingIndex].status === "failed")
  ) {
    return [...steps, next];
  }

  const merged = [...steps];
  merged[existingIndex] = {
    ...merged[existingIndex],
    ...next,
    data: { ...(merged[existingIndex].data ?? {}), ...(next.data ?? {}) },
    payload: next.payload ?? merged[existingIndex].payload,
    encrypted_payload: next.encrypted_payload ?? merged[existingIndex].encrypted_payload,
    agent: next.agent ?? merged[existingIndex].agent,
  };
  return merged;
}

export function mergeExecutionRealtimeEventIntoTasks(
  tasks: ExecutionTask[] | undefined,
  data: EventRecord,
): ExecutionTask[] | undefined {
  if (!tasks) return tasks;

  const type = stringField(data.type);
  const taskId = stringField(data.task_id);
  if (!type || !taskId) return tasks;

  const completed = taskCompletedEventData(data);
  if (completed) {
    const source = completed;
    const success = source.success === true;
    return tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: taskStatusFromCompleted(success),
            current_step: null,
            completed_at: stringField(data.created_at) ?? new Date().toISOString(),
          }
        : task,
    );
  }

  const step = taskStepFromRealtimeEvent(data);
  if (!step) return tasks;

  return tasks.map((task) => {
    if (task.id !== taskId) return task;

    const nextSteps = appendOrReplaceStep(task.steps ?? [], step);
    const clearCurrentStep =
      !isChildActivityStep(step) && isTerminalStepEvent(step.event_type);
    const currentStep = clearCurrentStep
      ? null
      : currentStepFromStep(step) ?? task.current_step ?? null;
    const taskIsStarted =
      task.status === "ready" || task.status === "assigned";

    return {
      ...task,
      status: taskIsStarted ? "in_progress" : task.status,
      current_step: currentStep,
      steps: nextSteps,
      started_at: task.started_at ?? step.started_at,
    };
  });
}

export function replayExecutionRealtimeEventsIntoTasks(
  tasks: ExecutionTask[] | undefined,
  events: EventRecord[],
): ExecutionTask[] | undefined {
  if (!tasks) return tasks;

  let nextTasks = tasks;
  for (const event of events) {
    nextTasks = mergeExecutionRealtimeEventIntoTasks(nextTasks, event) ?? nextTasks;
  }
  return nextTasks;
}

export function splitReplayableExecutionRealtimeEvents(
  tasks: ExecutionTask[] | undefined,
  events: EventRecord[],
): { replayable: EventRecord[]; pending: EventRecord[] } {
  if (!tasks) {
    return { replayable: [], pending: events };
  }

  const taskIds = new Set(tasks.map((task) => task.id));
  const replayable: EventRecord[] = [];
  const pending: EventRecord[] = [];

  for (const event of events) {
    const taskId = stringField(event.task_id);
    if (taskId && taskIds.has(taskId)) {
      replayable.push(event);
    } else {
      pending.push(event);
    }
  }

  return { replayable, pending };
}
