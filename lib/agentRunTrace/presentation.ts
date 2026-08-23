import type {
  RunPhase,
  RunTrace,
  ToolSpan,
  TraceSpan,
  TraceStatus,
} from "./types";

export interface TraceActivitySummary {
  status: string;
  detail?: string;
  duration?: string;
  ariaLabel: string;
}

export type TraceDisplayItem =
  | { kind: "span"; span: TraceSpan }
  | { kind: "tool_batch"; id: string; tools: ToolSpan[] };

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
  const milliseconds = Math.max(0, end - start);
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

export function groupTraceDisplayItems(spans: TraceSpan[]): TraceDisplayItem[] {
  const items: TraceDisplayItem[] = [];
  for (const span of spans) {
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
