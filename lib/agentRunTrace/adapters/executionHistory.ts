import { buildRoutineDisplaySteps } from "../../routineStepEvents";
import { normalizeToolCallArgs } from "../../toolCallDisplay";
import type { ExecutionDetails, ExecutionTask, TaskStepProgress } from "../../types";
import { abilityDisplayName } from "../reducer";
import type {
  AbilitySpan,
  DelegationSpan,
  HookSpan,
  ModelSpan,
  RoutineStepSpan,
  RunPhase,
  RunTrace,
  ToolSpan,
  TraceSpan,
  TraceStatus,
} from "../types";

function statusFromRun(status: string): RunPhase {
  switch (status) {
    case "completed":
    case "done":
    case "resolved":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "paused":
      return "paused";
    case "running":
    case "in_progress":
      return "executing_tools";
    default:
      return "idle";
  }
}

function statusFromStep(step: TaskStepProgress): TraceStatus {
  if (
    step.event_type === "step_failed" ||
    step.event_type === "tool_failed" ||
    step.event_type === "ability_failed" ||
    step.event_type === "delegation_failed" ||
    step.status === "failed"
  ) return "failed";
  if (
    step.event_type === "step_completed" ||
    step.event_type === "tool_completed" ||
    step.event_type === "ability_completed" ||
    step.event_type === "delegation_completed" ||
    step.status === "passed"
  ) return "completed";
  if (step.status === "skipped") return "cancelled";
  if (
    step.event_type === "step_started" ||
    step.event_type === "tool_started" ||
    step.event_type === "ability_started" ||
    step.event_type === "delegation_started" ||
    step.status === "running"
  ) return "running";
  return "queued";
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stepId(task: ExecutionTask, step: TaskStepProgress, index: number): string {
  const callId = step.data?.call_id;
  if (typeof callId === "string" && callId) return callId;
  const toolCallId = step.data?.tool_call_id;
  if (typeof toolCallId === "string" && toolCallId) return toolCallId;
  const operationId = step.data?.operation_id;
  if (typeof operationId === "string" && operationId) return operationId;
  const stepRunId = step.data?.step_run_id;
  if (typeof stepRunId === "string" && stepRunId) return stepRunId;
  const taskPart = task.id ?? task.slug ?? task.title;
  return `${taskPart}:${step.step_type}:${step.step_name}:${index}`;
}

function parentCallId(step: TaskStepProgress): string | undefined {
  return textValue(step.data?.parent_call_id) ?? textValue(step.data?.parent_tool_name);
}

function batchId(step: TaskStepProgress): string | undefined {
  return textValue(step.data?.batch_id);
}

function toolArgs(step: TaskStepProgress): unknown {
  return step.payload?.tool_args ?? step.data?.tool_args;
}

function outputPreview(step: TaskStepProgress): string | undefined {
  return (
    textValue(step.payload?.output_preview) ??
    textValue(step.data?.output_preview) ??
    textValue(step.payload?.result_preview) ??
    textValue(step.data?.result_preview)
  );
}

function outputValue(step: TaskStepProgress): unknown {
  return step.payload?.output ?? step.data?.output;
}

function errorPreview(step: TaskStepProgress): string | undefined {
  return textValue(step.payload?.error_preview) ?? textValue(step.data?.error_preview);
}

function stepSlug(step: TaskStepProgress): string | undefined {
  return textValue(step.data?.step_slug);
}

function stepRunId(step: TaskStepProgress): string | undefined {
  return textValue(step.data?.step_run_id);
}

function isRoutineStep(step: TaskStepProgress): boolean {
  return [
    "agent",
    "gate",
    "council",
    "terminal",
    "terminal_fail",
    "merge",
    "lambda",
  ].includes(step.step_type);
}

function expandToolStep(step: TaskStepProgress): TaskStepProgress[] {
  if (step.step_type !== "tool") return [step];
  const toolNames = Array.isArray(step.data?.tool_names)
    ? step.data.tool_names.filter((value): value is string => typeof value === "string")
    : [];
  if (toolNames.length === 0) return [step];

  const toolCallIds = Array.isArray(step.data?.tool_call_ids)
    ? step.data.tool_call_ids
    : [];
  const toolArgs = Array.isArray(step.data?.tool_args)
    ? step.data.tool_args
    : [];

  return toolNames.map((toolName, toolIndex) => ({
    ...step,
    step_name: toolName,
    data: {
      ...(step.data ?? {}),
      batch_id: step.data?.batch_id,
      tool_call_id:
        typeof toolCallIds[toolIndex] === "string"
          ? toolCallIds[toolIndex]
          : step.data?.tool_call_id,
      tool_index: toolIndex,
      tool_args: toolArgs[toolIndex] ?? step.data?.tool_args,
    },
  }));
}

function stepSpan(task: ExecutionTask, step: TaskStepProgress, index: number): TraceSpan {
  const id = stepId(task, step, index);
  const status = statusFromStep(step);
  const startedAt =
    step.started_at ?? step.created_at ?? task.started_at ?? new Date(0).toISOString();
  const completedAt = step.completed_at ?? undefined;

  if (isRoutineStep(step)) {
    return {
      kind: "routine_step",
      id,
      status,
      name: step.step_name,
      stepType: step.step_type,
      stepSlug: stepSlug(step),
      stepRunId: stepRunId(step),
      outputPreview: outputPreview(step),
      errorPreview: errorPreview(step),
      children: [],
      startedAt,
      completedAt,
    } satisfies RoutineStepSpan;
  }

  if (step.step_type === "ability") {
    const abilityName =
      textValue(step.data?.ability) ??
      textValue(step.payload?.ability) ??
      step.step_name;
    return {
      kind: "ability",
      id,
      status,
      name: abilityName,
      displayName: abilityDisplayName({
        abilityName,
        toolName: step.step_name,
      }),
      toolName: step.step_name,
      taskPreview:
        textValue(step.payload?.task_preview) ?? textValue(step.data?.task_preview),
      resultPreview: outputPreview(step),
      rawArgs: step.payload ?? step.data,
      children: [],
      startedAt,
      completedAt,
    } satisfies AbilitySpan;
  }

  if (step.step_type === "delegation") {
    const targetAgent =
      textValue(step.data?.target_agent) ??
      textValue(step.payload?.target_agent) ??
      step.step_name;
    return {
      kind: "delegation",
      id,
      status,
      targetAgent,
      taskPreview:
        textValue(step.payload?.task_preview) ?? textValue(step.data?.task_preview),
      resultPreview: outputPreview(step),
      children: [],
      startedAt,
      completedAt,
    } satisfies DelegationSpan;
  }

  if (step.step_type === "hook") {
    return {
      kind: "hook",
      id,
      status,
      name: step.step_name,
      hookEvent: textValue(step.data?.hook_event),
      source: textValue(step.data?.source),
      outputPreview: outputPreview(step),
      errorPreview: errorPreview(step),
      rawArgs: step.payload ?? step.data,
      startedAt,
      completedAt,
    } satisfies HookSpan;
  }

  if (step.step_type === "model") {
    return {
      kind: "model",
      id,
      status,
      provider: textValue(step.data?.provider),
      model: textValue(step.data?.model),
      startedAt,
      completedAt,
    } satisfies ModelSpan;
  }

  const args = toolArgs(step);
  return {
    kind: "tool",
    id,
    batchId: batchId(step),
    status,
    name: step.step_name,
    argsSummary: normalizeToolCallArgs(args),
    rawArgs: args,
    output: outputValue(step),
    outputPreview: outputPreview(step),
    errorPreview: errorPreview(step),
    startedAt,
    completedAt,
  } satisfies ToolSpan;
}

function mergeSpan(previous: TraceSpan, next: TraceSpan): TraceSpan {
  if (previous.kind !== next.kind) return next;
  const base = {
    ...previous,
    ...next,
    startedAt: previous.startedAt <= next.startedAt ? previous.startedAt : next.startedAt,
    completedAt: next.completedAt ?? previous.completedAt,
  };
  if ("children" in previous || "children" in next) {
    return {
      ...base,
      children: [
        ...(("children" in previous ? previous.children : undefined) ?? []),
        ...(("children" in next ? next.children : undefined) ?? []),
      ],
    } as TraceSpan;
  }
  return base as TraceSpan;
}

function upsertSpan(spans: TraceSpan[], span: TraceSpan): TraceSpan[] {
  const existingIndex = spans.findIndex((candidate) => candidate.id === span.id);
  if (existingIndex === -1) return [...spans, span];
  return spans.map((candidate, index) =>
    index === existingIndex ? mergeSpan(candidate, span) : candidate,
  );
}

function appendChildSpan(
  spans: TraceSpan[],
  parentId: string,
  child: TraceSpan,
): { spans: TraceSpan[]; appended: boolean } {
  let appended = false;
  const nextSpans = spans.map((span) => {
    if (span.id === parentId && "children" in span) {
      appended = true;
      return {
        ...span,
        children: upsertSpan(span.children ?? [], child),
      } as TraceSpan;
    }
    if ("children" in span && span.children) {
      const result = appendChildSpan(span.children, parentId, child);
      if (result.appended) {
        appended = true;
        return { ...span, children: result.spans } as TraceSpan;
      }
    }
    return span;
  });
  return { spans: nextSpans, appended };
}

export function executionTasksToRunTrace(
  execution: ExecutionDetails,
  tasks: ExecutionTask[],
): RunTrace {
  const spans: TraceSpan[] = [];
  for (const task of tasks) {
    if (task.steps.length === 0) {
      spans.push({
        kind: "message",
        id: task.id ?? task.slug ?? task.title,
        status: statusFromStep({
          step_name: task.title,
          step_type: "message",
          status: task.status === "completed" ? "passed" : "running",
          event_type: task.status === "completed" ? "step_completed" : "step_started",
          started_at: task.started_at,
          completed_at: task.completed_at,
          duration_ms: null,
        }),
        role: "system",
        text: task.slug ? `${task.slug} - ${task.title}` : task.title,
        startedAt:
          task.started_at ?? execution.started_at ?? execution.created_at,
        completedAt: task.completed_at ?? undefined,
      });
      continue;
    }

    const isRoutineTask =
      Boolean(execution.routine_id ?? task.routine_id) ||
      task.steps.some((step) => stepSlug(step) || stepRunId(step));

    if (isRoutineTask) {
      buildRoutineDisplaySteps(task.steps).forEach((group, groupIndex) => {
        const parentSpan = stepSpan(task, group.step, groupIndex);
        const children = group.children.flatMap((child, childIndex) =>
          expandToolStep(child).map((expandedChild) =>
            stepSpan(task, expandedChild, childIndex),
          ),
        );

        if ("children" in parentSpan) {
          spans.splice(
            0,
            spans.length,
            ...upsertSpan(spans, {
              ...parentSpan,
              children,
            } as TraceSpan),
          );
        } else {
          spans.splice(0, spans.length, ...upsertSpan(spans, parentSpan));
          for (const child of children) {
            spans.splice(0, spans.length, ...upsertSpan(spans, child));
          }
        }
      });
      continue;
    }

    task.steps.forEach((step, index) => {
      for (const expandedStep of expandToolStep(step)) {
        const span = stepSpan(task, expandedStep, index);
        const parentId = parentCallId(expandedStep);
        if (parentId) {
          const childResult = appendChildSpan(spans, parentId, span);
          if (childResult.appended) {
            spans.splice(0, spans.length, ...childResult.spans);
            continue;
          }
        }
        spans.splice(0, spans.length, ...upsertSpan(spans, span));
      }
    });
  }

  return {
    id: execution.id,
    sessionId: execution.id,
    source: execution.routine_id ? "routine" : "execution",
    executionRunId: execution.id,
    phase: statusFromRun(execution.status),
    startedAt: execution.started_at ?? execution.created_at,
    completedAt:
      execution.completed_at ?? execution.cancelled_at ?? undefined,
    spans,
  };
}
