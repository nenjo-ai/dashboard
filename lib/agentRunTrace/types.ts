export type RunPhase =
  | "idle"
  | "queued"
  | "thinking"
  | "streaming"
  | "executing_tools"
  | "running_ability"
  | "delegating"
  | "running_hook"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type RunTraceSource = "chat" | "execution" | "routine";

export type TraceStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface RunTrace {
  id: string;
  sessionId: string;
  source: RunTraceSource;
  executionRunId?: string;
  taskId?: string;
  phase: RunPhase;
  startedAt: string;
  completedAt?: string;
  spans: TraceSpan[];
  errorMessage?: string;
}

export type TraceSpan =
  | ModelSpan
  | RoutineStepSpan
  | ToolSpan
  | AbilitySpan
  | AsyncOperationSpan
  | DelegationSpan
  | HookSpan
  | MessageSpan;

export interface TraceSpanBase {
  id: string;
  status: TraceStatus;
  startedAt: string;
  completedAt?: string;
}

export interface ModelSpan extends TraceSpanBase {
  kind: "model";
  provider?: string;
  model?: string;
  text?: string;
  children?: TraceSpan[];
}

export interface ToolSpan extends TraceSpanBase {
  kind: "tool";
  batchId?: string;
  name: string;
  argsSummary?: string;
  rawArgs?: unknown;
  textPreview?: string;
  output?: unknown;
  outputPreview?: string;
  errorPreview?: string;
  providerNative?: boolean;
  provider?: string;
  stdout?: string;
  stderr?: string;
  children?: TraceSpan[];
}

export interface RoutineStepSpan extends TraceSpanBase {
  kind: "routine_step";
  name: string;
  stepType: string;
  stepSlug?: string;
  stepRunId?: string;
  outputPreview?: string;
  errorPreview?: string;
  children: TraceSpan[];
}

export interface AbilitySpan extends TraceSpanBase {
  kind: "ability";
  name: string;
  displayName: string;
  toolName: string;
  taskPreview?: string;
  resultPreview?: string;
  rawArgs?: unknown;
  children: TraceSpan[];
}

export interface AsyncOperationTranscriptEntry {
  kind: string;
  summary: string;
  tool?: string;
  success?: boolean;
}

export interface AsyncOperationSpan extends TraceSpanBase {
  kind: "async_operation";
  operationKind: string;
  label: string;
  signal?: string;
  summary?: string;
  taskPreview?: string;
  resultPreview?: string;
  details?: unknown;
  transcript: AsyncOperationTranscriptEntry[];
  children: TraceSpan[];
}

export interface DelegationSpan extends TraceSpanBase {
  kind: "delegation";
  targetAgent: string;
  taskPreview?: string;
  resultPreview?: string;
  children: TraceSpan[];
}

export interface HookSpan extends TraceSpanBase {
  kind: "hook";
  name: string;
  hookEvent?: string;
  source?: string;
  outputPreview?: string;
  errorPreview?: string;
  rawArgs?: unknown;
}

export interface MessageSpan extends TraceSpanBase {
  kind: "message";
  role: "assistant" | "system" | "tool";
  text: string;
}

export type AgentLifecycleEvent =
  | {
      event_type: "RunStarted";
      data: {
        run_id: string;
        session_id: string;
        input_message_id?: string;
        parent_run_id?: string;
        agent_id?: string;
        agent_name?: string;
        source?: RunTraceSource;
        execution_run_id?: string;
      };
    }
  | {
      event_type: "RunCompleted" | "RunCancelled";
      data: {
        run_id?: string;
        session_id?: string;
      };
    }
  | {
      event_type: "RunFailed";
      data: {
        run_id?: string;
        session_id?: string;
        message: string;
      };
    }
  | {
      event_type: "Paused" | "Resumed";
      data: {
        run_id?: string;
        session_id?: string;
      };
    }
  | {
      event_type: "ModelRequestStarted";
      data: {
        run_id?: string;
        request_id: string;
        parent_call_id?: string;
        provider?: string;
        model?: string;
      };
    }
  | {
      event_type: "AssistantTextDelta";
      data: {
        run_id?: string;
        request_id: string;
        delta: string;
        checkpoint?: string;
      };
    }
  | {
      event_type: "AssistantReasoningDelta";
      data: {
        run_id?: string;
        request_id: string;
        delta: string;
      };
    }
  | {
      event_type: "AssistantMessageFinalized";
      data: { run_id?: string; message_id: string; input_message_id?: string };
    }
  | {
      event_type: "ProviderRetryScheduled";
      data: {
        run_id?: string;
        request_id: string;
        message: string;
        delay_ms: number;
      };
    }
  | {
      event_type: "ProgressUpdate";
      data: { run_id?: string; status: string; message: string };
    }
  | {
      event_type: "ToolCallUpdated";
      data: { run_id?: string; call_id: string };
    }
  | {
      event_type: "ModelRequestCompleted";
      data: {
        run_id?: string;
        request_id: string;
        parent_call_id?: string;
      };
    }
  | {
      event_type: "MessageCompacted";
      data: {
        run_id?: string;
        messages_before: number;
        messages_after: number;
      };
    }
  | {
      event_type: "ToolCallStarted";
      data: {
        run_id?: string;
        batch_id: string;
        call_id: string;
        parent_call_id?: string;
        tool_name: string;
        tool_args?: unknown;
        args_summary?: string;
        text_preview?: string;
        provider_native?: boolean;
        provider?: string;
        tool_origin?: string;
      };
    }
  | {
      event_type: "ToolOutputDelta";
      data: {
        run_id?: string;
        call_id: string;
        stream: "stdout" | "stderr" | "preview";
        delta: string;
      };
    }
  | {
      event_type: "ToolCallCompleted";
      data: {
        run_id?: string;
        batch_id?: string;
        call_id: string;
        parent_call_id?: string;
        success: boolean;
        tool_name?: string;
        tool_args?: unknown;
        args_summary?: string;
        output?: unknown;
        output_preview?: string;
        error_preview?: string;
        provider_native?: boolean;
        provider?: string;
        tool_origin?: string;
      };
    }
  | {
      event_type: "AsyncOperationEvent";
      data: {
        run_id?: string;
        operation_id: string;
        kind: string;
        label: string;
        status: string;
        signal: string;
        model_visible?: boolean;
        parent_operation_id?: string;
        parent_tool_name?: string;
        summary?: string;
        result_preview?: string;
        details?: unknown;
      };
    }
  | {
      event_type: "AsyncOperationTranscript";
      data: {
        run_id?: string;
        operation_id: string;
        kind: string;
        label: string;
        event: AsyncOperationTranscriptEntry;
      };
    }
  | {
      event_type: "HookStarted";
      data: {
        run_id?: string;
        call_id: string;
        hook: string;
        hook_event?: string;
        source?: string;
        raw_args?: unknown;
      };
    }
  | {
      event_type: "HookCompleted";
      data: {
        run_id?: string;
        call_id: string;
        success: boolean;
        output_preview?: string;
        error_preview?: string;
      };
    };
