import type {
  RunPhase,
  RunTrace,
  ToolSpan,
  TraceSpan,
  TraceStatus,
} from "./types";
import type { ChatActivitySummary } from "../types";

export interface TraceActivitySummary {
  status: string;
  detail?: string;
  duration?: string;
  ariaLabel: string;
}

export type TraceDisplayItem =
  | { kind: "span"; span: TraceSpan }
  | { kind: "tool_batch"; id: string; tools: ToolSpan[] }
  | {
      kind: "wait_sequence";
      id: string;
      waits: ToolSpan[];
      textPreviews: string[];
    };

const PHASE_LABEL: Record<RunPhase, string> = {
  idle: "Working",
  queued: "Queued",
  thinking: "Thinking",
  streaming: "Responding",
  executing_tools: "Using tools",
  running_ability: "Running ability",
  delegating: "Delegating",
  running_hook: "Running hook",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_LABEL: Record<TraceStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function spanChildren(span: TraceSpan): TraceSpan[] {
  return "children" in span ? (span.children ?? []) : [];
}

function allSpans(spans: TraceSpan[]): TraceSpan[] {
  return spans.flatMap((span) => [span, ...allSpans(spanChildren(span))]);
}

function sentenceCase(value: string): string {
  const words = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Tool";
}

function pluralizeResource(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return "resources";
  return normalized.endsWith("s") ? normalized : `${normalized}s`;
}

function toolVerbLabel(
  name: string,
): { running: string; completed: string; failed: string } | undefined {
  const match = /^(list|get|read|search|inspect|create|build|update|write|delete|remove)_(.+)$/.exec(
    name,
  );
  if (!match) return undefined;
  const [, verb, rawResource] = match;
  const resource =
    verb === "list" ? pluralizeResource(rawResource) : rawResource.replace(/_/g, " ");
  const forms: Record<string, [string, string]> = {
    list: ["Listing", "Listed"],
    get: ["Reading", "Read"],
    read: ["Reading", "Read"],
    search: ["Searching", "Searched"],
    inspect: ["Inspecting", "Inspected"],
    create: ["Creating", "Created"],
    build: ["Building", "Built"],
    update: ["Updating", "Updated"],
    write: ["Writing", "Wrote"],
    delete: ["Deleting", "Deleted"],
    remove: ["Removing", "Removed"],
  };
  const [running, completed] = forms[verb];
  return {
    running: `${running} ${resource}`,
    completed: `${completed} ${resource}`,
    failed: `Could not ${verb} ${resource}`,
  };
}

export function tracePhaseLabel(phase: RunPhase): string {
  return PHASE_LABEL[phase];
}

export function traceStatusLabel(status: TraceStatus): string {
  return STATUS_LABEL[status];
}

export function formatTraceDuration(
  startedAt?: string,
  completedAt?: string,
  now = Date.now(),
): string {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  return formatDurationMilliseconds(Math.max(0, end - start));
}

function formatDurationMilliseconds(milliseconds: number): string {
  if (milliseconds < 1000) return "<1s";
  if (milliseconds < 10_000) {
    return `${(milliseconds / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  }
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function toolActivityLabel(tool: ToolSpan): string {
  if (tool.name === "wait") {
    if (tool.status === "running" || tool.status === "queued") return "Waiting";
    if (tool.status === "failed") return "Wait failed";
    if (tool.status === "cancelled") return "Wait cancelled";
    return "Waited";
  }
  if (tool.name === "web_search") {
    if (tool.status === "running") return "Searching the web";
    if (tool.status === "failed") return "Web search failed";
    return "Searched the web";
  }
  if (tool.name === "shell") {
    if (tool.status === "running" || tool.status === "queued") {
      return "Running shell command";
    }
    if (tool.status === "failed") return "Shell command failed";
    return "Ran shell command";
  }
  const labels = toolVerbLabel(tool.name);
  if (!labels) return sentenceCase(tool.name);
  if (tool.status === "running" || tool.status === "queued") {
    return labels.running;
  }
  return tool.status === "failed" ? labels.failed : labels.completed;
}

function waitDisplayCandidate(span: TraceSpan): {
  waits: ToolSpan[];
  textPreviews: string[];
} | undefined {
  if (span.kind === "tool") {
    if (span.name !== "wait") return undefined;
    const preview = span.textPreview?.trim();
    return {
      waits: [span],
      textPreviews: preview ? [preview] : [],
    };
  }
  if (span.kind !== "model") return undefined;

  const children = span.children ?? [];
  if (
    children.length === 0 ||
    !children.every((child) => child.kind === "tool" && child.name === "wait")
  ) {
    return undefined;
  }

  const waits = children as ToolSpan[];
  const textPreviews: string[] = [];
  const modelText = span.text?.trim();
  if (modelText) textPreviews.push(modelText);
  for (const wait of waits) {
    const preview = wait.textPreview?.trim();
    if (preview && preview !== modelText) textPreviews.push(preview);
  }
  return { waits, textPreviews };
}

export function groupTraceDisplayItems(spans: TraceSpan[]): TraceDisplayItem[] {
  const items: TraceDisplayItem[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    const waitCandidate = waitDisplayCandidate(span);
    if (waitCandidate) {
      const waits = [...waitCandidate.waits];
      const textPreviews = [...waitCandidate.textPreviews];
      let nextIndex = index + 1;
      while (nextIndex < spans.length) {
        const nextWait = waitDisplayCandidate(spans[nextIndex]);
        if (!nextWait) break;
        waits.push(...nextWait.waits);
        textPreviews.push(...nextWait.textPreviews);
        nextIndex += 1;
      }
      if (waits.length > 1) {
        items.push({
          kind: "wait_sequence",
          id: waits[0].id,
          waits,
          textPreviews,
        });
        index = nextIndex - 1;
        continue;
      }
    }

    if (span.kind !== "tool") {
      items.push({ kind: "span", span });
      continue;
    }
    const batchId = span.batchId ?? span.id;
    const previous = items.at(-1);
    if (previous?.kind === "tool_batch" && previous.id === batchId) {
      previous.tools.push(span);
    } else {
      items.push({ kind: "tool_batch", id: batchId, tools: [span] });
    }
  }
  return items;
}

export function waitSequenceDuration(
  waits: ToolSpan[],
  now = Date.now(),
): string {
  let totalMilliseconds = 0;
  let hasValidDuration = false;
  for (const wait of waits) {
    const start = new Date(wait.startedAt).getTime();
    const end = wait.completedAt
      ? new Date(wait.completedAt).getTime()
      : now;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    hasValidDuration = true;
    totalMilliseconds += Math.max(0, end - start);
  }
  return hasValidDuration ? formatDurationMilliseconds(totalMilliseconds) : "";
}

export function toolBatchLabel(tools: ToolSpan[]): string {
  if (
    tools.length > 1 &&
    tools.every((tool) => tool.name.startsWith("list_"))
  ) {
    return `Queried ${tools.length} resource types`;
  }
  return `${tools.length} tool call${tools.length === 1 ? "" : "s"}`;
}

export function toolBatchStatus(tools: ToolSpan[]): TraceStatus {
  if (tools.some((tool) => tool.status === "failed")) return "failed";
  if (tools.some((tool) => tool.status === "running")) return "running";
  if (tools.some((tool) => tool.status === "queued")) return "queued";
  if (tools.some((tool) => tool.status === "cancelled")) return "cancelled";
  return "completed";
}

export function toolBatchProgress(tools: ToolSpan[]): string {
  const completed = tools.filter((tool) => tool.status === "completed").length;
  const status = toolBatchStatus(tools);
  if (status === "completed") return "Done";
  if (status === "failed") return "Needs attention";
  return `${completed} of ${tools.length} complete`;
}

export function traceActivitySummary(trace: RunTrace): TraceActivitySummary {
  const spans = allSpans(trace.spans);
  const tools = spans.filter((span): span is ToolSpan => span.kind === "tool");
  const activeTool = [...tools].reverse().find((tool) => tool.status === "running");
  const abilityCount = spans.filter(
    (span) => span.kind === "ability" || span.kind === "async_operation",
  ).length;
  const status = activeTool ? toolActivityLabel(activeTool) : tracePhaseLabel(trace.phase);
  const detailParts: string[] = [];
  if (tools.length > 0) {
    if (activeTool && tools.length > 1) {
      const complete = tools.filter((tool) => tool.status === "completed").length;
      detailParts.push(`${complete} of ${tools.length} complete`);
    } else {
      detailParts.push(`${tools.length} tool call${tools.length === 1 ? "" : "s"}`);
    }
  }
  if (abilityCount > 0) {
    detailParts.push(
      `${abilityCount} ${abilityCount === 1 ? "operation" : "operations"}`,
    );
  }
  const detail = detailParts.join(" · ") || undefined;
  const duration = formatTraceDuration(trace.startedAt, trace.completedAt);
  const ariaLabel = ["Activity", status, detail, duration]
    .filter(Boolean)
    .join(", ");
  return { status, detail, duration: duration || undefined, ariaLabel };
}

/** Keep persisted run-level timing authoritative when archived details load. */
export function withPersistedActivityTiming(
  trace: RunTrace,
  summary?: Pick<ChatActivitySummary, "startedAt" | "completedAt">,
): RunTrace {
  if (!summary) return trace;
  const completedAt = summary.completedAt ?? trace.completedAt;
  if (
    trace.startedAt === summary.startedAt &&
    trace.completedAt === completedAt
  ) {
    return trace;
  }
  return {
    ...trace,
    startedAt: summary.startedAt,
    completedAt,
  };
}

/** Present the Postgres summary before the detailed S3 trace is requested. */
export function storedTraceActivitySummary(
  summary: ChatActivitySummary,
): TraceActivitySummary {
  const status =
    summary.status === "running"
      ? "Working"
      : summary.status === "failed"
        ? "Failed"
        : summary.status === "cancelled"
          ? "Cancelled"
          : "Completed";
  const detailParts: string[] = [];
  if (summary.toolCallCount > 0) {
    detailParts.push(
      `${summary.toolCallCount} tool call${summary.toolCallCount === 1 ? "" : "s"}`,
    );
  }
  if (summary.operationCount > 0) {
    detailParts.push(
      `${summary.operationCount} ${summary.operationCount === 1 ? "operation" : "operations"}`,
    );
  }
  const detail = detailParts.join(" · ") || undefined;
  const duration = formatTraceDuration(summary.startedAt, summary.completedAt);
  const ariaLabel = ["Activity", status, detail, duration]
    .filter(Boolean)
    .join(", ");
  return { status, detail, duration: duration || undefined, ariaLabel };
}
