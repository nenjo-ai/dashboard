import { chatStreamEventToLifecycleEvent } from "./agentRunTrace/adapters/chatStream.ts";
import { EXECUTION_EVENT_TYPE, ExecutionEventKind } from "./executionEvents.ts";
import { reduceRunTraceEvents } from "./agentRunTrace/reducer.ts";
import type { AgentLifecycleEvent, RunTrace } from "./agentRunTrace/types";
import { normalizeToolCallArgs } from "./toolCallDisplay.ts";
import type {
  EncryptedPayload,
  ExecutionTraceEvent,
  ExecutionTraceRoutineStep,
} from "./types";

type EventRecord = Record<string, unknown>;

type TracePayload = {
  message?: unknown;
  delta?: unknown;
  status?: unknown;
  tool_args?: unknown;
  tool_name?: unknown;
  details?: unknown;
  text_preview?: unknown;
  output_preview?: unknown;
  error_preview?: unknown;
  task_preview?: unknown;
  result_preview?: unknown;
  tool_origin?: unknown;
  provider_native?: unknown;
  provider?: unknown;
};

export type ExecutionTraceEnvelope = {
  executionRunId: string;
  taskId: string | null;
  routineStep: ExecutionTraceRoutineStep | null;
  event: EventRecord;
  createdAt?: string;
  sequence?: number;
};

export type ExecutionTraceGroup = {
  routineStep: ExecutionTraceRoutineStep | null;
  trace: RunTrace;
};

function recordField(value: unknown): EventRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as EventRecord)
    : null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function boolField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function encryptedPayload(value: unknown): EncryptedPayload | undefined {
  return recordField(value) as unknown as EncryptedPayload | undefined;
}

function eventType(event: EventRecord): string | undefined {
  return stringField(event.event_type);
}

function eventData(event: EventRecord): EventRecord {
  return recordField(event.data) ?? {};
}

function traceRunId(envelope: ExecutionTraceEnvelope, data: EventRecord): string {
  return (
    stringField(data.run_id) ??
    envelope.routineStep?.step_run_id ??
    envelope.taskId ??
    envelope.executionRunId
  );
}

async function decryptPayload(value: unknown): Promise<TracePayload | undefined> {
  const encrypted = encryptedPayload(value);
  if (!encrypted) return undefined;

  try {
    const { decryptContentPayload } = await import("./cryptoContent");
    const decrypted = await decryptContentPayload(encrypted);
    if (!decrypted) return undefined;
    const parsed = JSON.parse(decrypted) as unknown;
    return recordField(parsed) as TracePayload | undefined;
  } catch (error) {
    console.warn("Failed to decrypt execution trace payload", {
      objectId: encrypted.object_id,
      objectType: encrypted.object_type,
      keyVersion: encrypted.key_version,
      error,
    });
    return undefined;
  }
}

async function lifecycleEventFromEnvelope(
  envelope: ExecutionTraceEnvelope,
): Promise<AgentLifecycleEvent | undefined> {
  const type = eventType(envelope.event);
  if (!type) return undefined;

  const rawData = eventData(envelope.event);
  const decryptedPayload = await decryptPayload(rawData.encrypted_payload);
  const payload = decryptedPayload ?? (recordField(rawData.payload) as TracePayload | null) ?? {};
  const runId = traceRunId(envelope, rawData);
  const providerNative =
    boolField(payload.provider_native) ??
    boolField(rawData.provider_native) ??
    (stringField(payload.tool_origin) === "provider" ||
      stringField(rawData.tool_origin) === "provider");
  const toolArgs =
    payload.tool_args !== undefined ? payload.tool_args : rawData.tool_args;

  const data: EventRecord = {
    ...rawData,
    run_id: runId,
    session_id: stringField(rawData.session_id) ?? runId,
    execution_run_id: envelope.executionRunId,
    message:
      stringField(payload.message) ?? stringField(rawData.message),
    delta: stringField(payload.delta) ?? rawData.delta,
    status: stringField(payload.status) ?? rawData.status,
    tool_args: toolArgs,
    tool_name: stringField(payload.tool_name) ?? rawData.tool_name,
    details: payload.details !== undefined ? payload.details : rawData.details,
    args_summary:
      toolArgs !== undefined ? normalizeToolCallArgs(toolArgs) : rawData.args_summary,
    text_preview:
      stringField(payload.text_preview) ?? stringField(rawData.text_preview),
    output_preview:
      stringField(payload.output_preview) ?? stringField(rawData.output_preview),
    error_preview:
      stringField(payload.error_preview) ?? stringField(rawData.error_preview),
    task_preview:
      stringField(payload.task_preview) ?? stringField(rawData.task_preview),
    result_preview:
      stringField(payload.result_preview) ?? stringField(rawData.result_preview),
    tool_origin: stringField(payload.tool_origin) ?? rawData.tool_origin,
    provider_native: providerNative,
    provider: stringField(payload.provider) ?? rawData.provider,
  };
  delete data.payload;
  delete data.encrypted_payload;

  return chatStreamEventToLifecycleEvent({ event_type: type, data });
}

export function traceEnvelopeFromRealtimeEvent(
  data: EventRecord,
): ExecutionTraceEnvelope | null {
  if (data.type !== EXECUTION_EVENT_TYPE) return null;
  const event = recordField(data.event);
  if (!event || event.kind !== ExecutionEventKind.AgentTrace) return null;
  const eventData = recordField(event.data);
  const executionRunId = stringField(data.execution_run_id);
  const payload = recordField(eventData?.payload);
  if (!executionRunId || !payload) return null;

  return {
    executionRunId,
    taskId: stringField(data.task_id) ?? null,
    routineStep: recordField(eventData?.routine_step) as ExecutionTraceRoutineStep | null,
    event: payload,
  };
}

export function traceEnvelopeFromPersistedEvent(
  event: ExecutionTraceEvent,
): ExecutionTraceEnvelope {
  return {
    executionRunId: event.execution_run_id,
    taskId: event.task_id,
    routineStep: event.routine_step ?? null,
    event: event.event,
    createdAt: event.created_at,
    sequence: event.sequence,
  };
}

export async function lifecycleEventsFromExecutionTraceEnvelopes(
  envelopes: ExecutionTraceEnvelope[],
): Promise<AgentLifecycleEvent[]> {
  const resolved = await Promise.all(envelopes.map(lifecycleEventFromEnvelope));
  return resolved.filter((event): event is AgentLifecycleEvent => Boolean(event));
}

export async function buildExecutionTraceGroups(
  envelopes: ExecutionTraceEnvelope[],
): Promise<Map<string, ExecutionTraceGroup>> {
  const ordered = envelopes
    .map((envelope, index) => ({ envelope, index }))
    .sort((a, b) => {
      const aSequence = a.envelope.sequence ?? Number.MAX_SAFE_INTEGER;
      const bSequence = b.envelope.sequence ?? Number.MAX_SAFE_INTEGER;
      if (aSequence !== bSequence) return aSequence - bSequence;

      const aTime = a.envelope.createdAt
        ? new Date(a.envelope.createdAt).getTime()
        : Number.NaN;
      const bTime = b.envelope.createdAt
        ? new Date(b.envelope.createdAt).getTime()
        : Number.NaN;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }

      return a.index - b.index;
    })
    .map(({ envelope }) => envelope);
  const groups = new Map<string, { routineStep: ExecutionTraceRoutineStep | null; events: AgentLifecycleEvent[] }>();

  for (const envelope of ordered) {
    const event = await lifecycleEventFromEnvelope(envelope);
    if (!event) continue;
    const data = "run_id" in event.data ? event.data : {};
    const key =
      envelope.routineStep?.step_run_id ??
      stringField(data.run_id) ??
      envelope.taskId ??
      envelope.executionRunId;
    const group = groups.get(key) ?? {
      routineStep: envelope.routineStep,
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }

  const traces = new Map<string, ExecutionTraceGroup>();
  for (const [key, group] of Array.from(groups.entries())) {
    const trace = reduceRunTraceEvents(undefined, group.events, {
      source: "execution",
      defaultRunId: key,
      defaultSessionId: key,
    });
    if (trace) {
      traces.set(key, { routineStep: group.routineStep, trace });
    }
  }
  return traces;
}
