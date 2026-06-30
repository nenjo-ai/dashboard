import type {
  AgentLifecycleEvent,
  AsyncOperationSpan,
  HookSpan,
  ModelSpan,
  RunPhase,
  RunTrace,
  RunTraceSource,
  ToolSpan,
  TraceSpan,
  TraceStatus,
} from "./types";

export interface ReduceRunTraceOptions {
  now?: string;
  defaultRunId?: string;
  defaultSessionId?: string;
  source?: RunTraceSource;
}

function timestamp(options?: ReduceRunTraceOptions): string {
  return options?.now ?? new Date().toISOString();
}

function eventRunId(event: AgentLifecycleEvent): string | undefined {
  return "run_id" in event.data ? event.data.run_id : undefined;
}

function eventSessionId(event: AgentLifecycleEvent): string | undefined {
  return "session_id" in event.data ? event.data.session_id : undefined;
}

function createTrace(
  event: AgentLifecycleEvent,
  options?: ReduceRunTraceOptions,
): RunTrace | undefined {
  const now = timestamp(options);
  if (event.event_type === "RunStarted") {
    return {
      id: event.data.run_id,
      sessionId: event.data.session_id,
      source: event.data.source ?? options?.source ?? "chat",
      executionRunId: event.data.execution_run_id,
      phase: "queued",
      startedAt: now,
      spans: [],
    };
  }

  const runId = eventRunId(event) ?? options?.defaultRunId;
  const sessionId = eventSessionId(event) ?? options?.defaultSessionId;
  if (!runId || !sessionId) return undefined;
  return {
    id: runId,
    sessionId,
    source: options?.source ?? "chat",
    phase: "queued",
    startedAt: now,
    spans: [],
  };
}

function phaseAfterSpanCompletion(
  spans: TraceSpan[],
  fallback: RunPhase,
): RunPhase {
  if (spans.some((span) => span.status === "running")) {
    const active = [...spans]
      .reverse()
      .find((span) => span.status === "running");
    if (!active) return fallback;
    switch (active.kind) {
      case "model":
        return "thinking";
      case "ability":
        return "running_ability";
      case "async_operation":
        if (active.operationKind === "ability") return "running_ability";
        if (active.operationKind === "sub_agent") return "delegating";
        return "executing_tools";
      case "delegation":
        return "delegating";
      case "hook":
        return "running_hook";
      case "tool":
        return "executing_tools";
      case "message":
        return "streaming";
    }
  }
  return fallback;
}

function hasTopLevelSpan(spans: TraceSpan[], spanId: string): boolean {
  return spans.some((span) => span.id === spanId);
}

function withSpan(
  spans: TraceSpan[],
  spanId: string,
  update: (span: TraceSpan) => TraceSpan,
): TraceSpan[] {
  return spans.map((span) => {
    if (span.id === spanId) return update(span);
    if ("children" in span && span.children) {
      return {
        ...span,
        children: withSpan(span.children, spanId, update),
      } as TraceSpan;
    }
    return span;
  });
}

function appendOrReplaceSpan(spans: TraceSpan[], next: TraceSpan): TraceSpan[] {
  const index = spans.findIndex((span) => span.id === next.id);
  if (index === -1) return [...spans, next];
  return spans.map((span, currentIndex) =>
    currentIndex === index ? ({ ...span, ...next } as TraceSpan) : span,
  );
}

function appendChildSpan(
  spans: TraceSpan[],
  parentId: string,
  child: TraceSpan,
): { spans: TraceSpan[]; appended: boolean } {
  let appended = false;
  const nextSpans = withSpan(spans, parentId, (span) => {
    if (!("children" in span)) return span;
    appended = true;
    return {
      ...span,
      children: appendOrReplaceSpan(span.children ?? [], child),
    } as TraceSpan;
  });
  return { spans: nextSpans, appended };
}

function findSpan(spans: TraceSpan[], spanId: string): TraceSpan | undefined {
  for (const span of spans) {
    if (span.id === spanId) return span;
    if ("children" in span && span.children) {
      const child = findSpan(span.children, spanId);
      if (child) return child;
    }
  }
  return undefined;
}

function completeRunningSpans(
  spans: TraceSpan[],
  completedAt: string,
): TraceSpan[] {
  return spans.map((span) => {
    const next =
      span.status === "running"
        ? ({ ...span, status: "completed", completedAt } as TraceSpan)
        : span;
    if ("children" in next && next.children) {
      return {
        ...next,
        children: completeRunningSpans(next.children, completedAt),
      } as TraceSpan;
    }
    return next;
  });
}

function isTerminalAssistantResponseStatus(status?: string): boolean {
  return Boolean(status && status !== "in_progress");
}

function completeSpanStatus(success: boolean): TraceStatus {
  return success ? "completed" : "failed";
}

function asyncStatus(status: string): TraceStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
    case "stopped":
      return "failed";
    case "queued":
      return "queued";
    default:
      return "running";
  }
}

function phaseForAsyncOperation(kind: string): RunPhase {
  if (kind === "ability") return "running_ability";
  if (kind === "sub_agent") return "delegating";
  return "executing_tools";
}

function parseAbilityFromToolName(toolName: string): string | undefined {
  const match = toolName.match(/(?:^|\/)([A-Za-z0-9_-]+)$/);
  return match?.[1];
}

export function abilityDisplayName({
  abilityDisplayName,
  abilityName,
  toolName,
}: {
  abilityDisplayName?: string;
  abilityName?: string;
  toolName?: string;
}): string {
  return (
    abilityDisplayName?.trim() ||
    abilityName?.trim() ||
    (toolName ? parseAbilityFromToolName(toolName) : undefined) ||
    "Ability"
  );
}

export function reduceRunTrace(
  state: RunTrace | undefined,
  event: AgentLifecycleEvent,
  options?: ReduceRunTraceOptions,
): RunTrace | undefined {
  const now = timestamp(options);
  const trace = state ?? createTrace(event, options);
  if (!trace) return undefined;

  switch (event.event_type) {
    case "RunStarted":
      return createTrace(event, options);
    case "RunCompleted":
      return {
        ...trace,
        phase: "completed",
        completedAt: now,
        spans: completeRunningSpans(trace.spans, now),
      };
    case "RunFailed":
      return {
        ...trace,
        phase: "failed",
        completedAt: now,
        errorMessage: event.data.message,
      };
    case "RunCancelled":
      return {
        ...trace,
        phase: "cancelled",
        completedAt: now,
      };
    case "Paused":
      return {
        ...trace,
        phase: "paused",
        spans: appendOrReplaceSpan(trace.spans, {
          kind: "message",
          id: `paused:${now}`,
          status: "completed",
          role: "system",
          text: "Paused",
          startedAt: now,
          completedAt: now,
        }),
      };
    case "Resumed":
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(trace.spans, "idle"),
        spans: appendOrReplaceSpan(trace.spans, {
          kind: "message",
          id: `resumed:${now}`,
          status: "completed",
          role: "system",
          text: "Resumed",
          startedAt: now,
          completedAt: now,
        }),
      };
    case "ModelRequestStarted": {
      const span: ModelSpan = {
        kind: "model",
        id: event.data.request_id,
        status: "running",
        provider: event.data.provider,
        model: event.data.model,
        children: [],
        startedAt: now,
      };
      const parentId = event.data.parent_call_id;
      const childResult = parentId
        ? appendChildSpan(trace.spans, parentId, span)
        : undefined;
      return {
        ...trace,
        phase: childResult?.appended
          ? phaseAfterSpanCompletion(childResult.spans, "running_ability")
          : "thinking",
        spans: childResult?.appended
          ? childResult.spans
          : appendOrReplaceSpan(trace.spans, span),
      };
    }
    case "AssistantTextDelta": {
      const spans = withSpan(trace.spans, event.data.request_id, (span) => {
        if (span.kind !== "model") return span;
        return { ...span, text: `${span.text ?? ""}${event.data.delta}` };
      });
      return {
        ...trace,
        phase: hasTopLevelSpan(trace.spans, event.data.request_id)
          ? "streaming"
          : phaseAfterSpanCompletion(spans, "running_ability"),
        spans,
      };
    }
    case "AssistantResponse":
      if (!isTerminalAssistantResponseStatus(event.data.status)) {
        return trace;
      }
      return {
        ...trace,
        phase: "completed",
        completedAt: now,
        spans: completeRunningSpans(trace.spans, now),
      };
    case "MessageCompacted":
      return {
        ...trace,
        spans: appendOrReplaceSpan(trace.spans, {
          kind: "message",
          id: `compaction:${now}`,
          status: "completed",
          role: "system",
          text: `Compacted context (${event.data.messages_before} -> ${event.data.messages_after} messages)`,
          startedAt: now,
          completedAt: now,
        }),
      };
    case "ModelRequestCompleted": {
      const spans = withSpan(trace.spans, event.data.request_id, (span) => ({
        ...span,
        status: "completed",
        completedAt: now,
      }));
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(spans, "idle"),
        spans,
      };
    }
    case "ToolCallStarted": {
      const span: ToolSpan = {
        kind: "tool",
        id: event.data.call_id,
        batchId: event.data.batch_id,
        status: "running",
        name: event.data.tool_name,
        argsSummary: event.data.args_summary,
        rawArgs: event.data.tool_args,
        textPreview: event.data.text_preview,
        providerNative:
          event.data.provider_native === true ||
          event.data.tool_origin === "provider",
        provider: event.data.provider,
        startedAt: now,
      };
      const activeAbilityId = event.data.parent_call_id;
      const childResult = activeAbilityId
        ? appendChildSpan(trace.spans, activeAbilityId, span)
        : undefined;
      return {
        ...trace,
        phase: "executing_tools",
        spans: childResult?.appended
          ? childResult.spans
          : appendOrReplaceSpan(trace.spans, span),
      };
    }
    case "ToolOutputDelta":
      return {
        ...trace,
        spans: withSpan(trace.spans, event.data.call_id, (span) => {
          if (span.kind !== "tool") return span;
          if (event.data.stream === "stdout") {
            return {
              ...span,
              stdout: `${span.stdout ?? ""}${event.data.delta}`,
            };
          }
          if (event.data.stream === "stderr") {
            return {
              ...span,
              stderr: `${span.stderr ?? ""}${event.data.delta}`,
            };
          }
          return {
            ...span,
            textPreview: `${span.textPreview ?? ""}${event.data.delta}`,
          };
        }),
      };
    case "ToolCallCompleted": {
      const spans = withSpan(trace.spans, event.data.call_id, (span) => {
        if (span.kind !== "tool") return span;
        return {
          ...span,
          batchId: event.data.batch_id ?? span.batchId,
          status: completeSpanStatus(event.data.success),
          completedAt: now,
          rawArgs: event.data.tool_args ?? span.rawArgs,
          argsSummary:
            event.data.tool_args !== undefined
              ? (event.data.args_summary ?? span.argsSummary)
              : span.argsSummary,
          outputPreview: event.data.output_preview ?? span.outputPreview,
          errorPreview: event.data.error_preview ?? span.errorPreview,
          providerNative:
            span.providerNative ||
            event.data.provider_native === true ||
            event.data.tool_origin === "provider",
          provider: event.data.provider ?? span.provider,
        };
      });
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(spans, "idle"),
        spans,
      };
    }
    case "AsyncOperationEvent": {
      const existing = findSpan(trace.spans, event.data.operation_id);
      const previousAsync =
        existing?.kind === "async_operation" ? existing : undefined;
      const isTerminal = ["completed", "failed", "stopped"].includes(
        event.data.status,
      );
      const base: AsyncOperationSpan = {
        kind: "async_operation",
        id: event.data.operation_id,
        status: asyncStatus(event.data.status),
        operationKind: event.data.kind,
        label: event.data.label,
        signal: event.data.signal,
        summary: event.data.summary,
        taskPreview:
          event.data.signal === "started"
            ? event.data.summary
            : previousAsync?.taskPreview,
        resultPreview:
          event.data.result_preview ??
          (isTerminal ? event.data.summary : previousAsync?.resultPreview),
        details: event.data.details,
        transcript: [],
        children: [],
        startedAt: existing?.startedAt ?? now,
        completedAt: isTerminal ? now : existing?.completedAt,
      };
      const nextSpan =
        existing && "children" in existing
          ? ({
              ...base,
              children: existing.children ?? [],
              transcript: previousAsync?.transcript ?? [],
            } satisfies AsyncOperationSpan)
          : base;
      const parentId = event.data.parent_operation_id;
      const childResult = parentId
        ? appendChildSpan(trace.spans, parentId, nextSpan)
        : undefined;
      const spans = childResult?.appended
        ? childResult.spans
        : appendOrReplaceSpan(trace.spans, nextSpan);
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(
          spans,
          phaseForAsyncOperation(event.data.kind),
        ),
        spans,
      };
    }
    case "AsyncOperationTranscript": {
      const spans = withSpan(trace.spans, event.data.operation_id, (span) => {
        if (span.kind !== "async_operation") return span;
        return {
          ...span,
          transcript: [...span.transcript, event.data.event],
        };
      });
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(
          spans,
          phaseForAsyncOperation(event.data.kind),
        ),
        spans,
      };
    }
    case "HookStarted": {
      const span: HookSpan = {
        kind: "hook",
        id: event.data.call_id,
        status: "running",
        name: event.data.hook,
        hookEvent: event.data.hook_event,
        source: event.data.source,
        rawArgs: event.data.raw_args,
        startedAt: now,
      };
      return {
        ...trace,
        phase: "running_hook",
        spans: appendOrReplaceSpan(trace.spans, span),
      };
    }
    case "HookCompleted": {
      const spans = withSpan(trace.spans, event.data.call_id, (span) => {
        if (span.kind !== "hook") return span;
        return {
          ...span,
          status: completeSpanStatus(event.data.success),
          completedAt: now,
          outputPreview: event.data.output_preview ?? span.outputPreview,
          errorPreview: event.data.error_preview ?? span.errorPreview,
        };
      });
      return {
        ...trace,
        phase: phaseAfterSpanCompletion(spans, "idle"),
        spans,
      };
    }
  }
}

export function reduceRunTraceEvents(
  state: RunTrace | undefined,
  events: AgentLifecycleEvent[],
  options?: ReduceRunTraceOptions,
): RunTrace | undefined {
  return events.reduce(
    (nextState, event) => reduceRunTrace(nextState, event, options),
    state,
  );
}
