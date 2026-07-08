"use client";

import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Code2,
  Hammer,
  Loader2,
  Route,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  AbilitySpan,
  AsyncOperationSpan,
  DelegationSpan,
  HookSpan,
  ModelSpan,
  RoutineStepSpan,
  RunPhase,
  RunTrace,
  ToolSpan,
  TraceSpan,
  TraceStatus,
} from "@/lib/agentRunTrace/types";
import {
  chatDisplaySpans,
  chronologicalSpans,
  currentCycleSpans,
  filterHistorySpans,
  hasRunningSpan,
  spanChildren,
  visibleAsyncOperationResultPreview,
  visibleHistoryTranscriptEntries,
} from "@/lib/agentRunTrace/visibility";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import type { AgentDefinition } from "@/lib/types";

export interface AgentRunTraceProps {
  trace: RunTrace;
  activeAgent?: AgentDefinition;
  mode?: "live" | "history";
  density?: "regular" | "compact";
  mobile?: boolean;
  className?: string;
  embedded?: boolean;
}

function phaseLabel(phase: RunPhase): string {
  switch (phase) {
    case "thinking":
      return "Thinking";
    case "streaming":
      return "Writing";
    case "executing_tools":
      return "Running tools";
    case "running_ability":
      return "Running ability";
    case "delegating":
      return "Delegating";
    case "running_hook":
      return "Running hook";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "queued":
      return "Queued";
    case "idle":
      return "Working";
  }
}

function statusLabel(status: TraceStatus): string {
  switch (status) {
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
  }
}

function durationMs(startedAt?: string, completedAt?: string): number | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function spanSummary(spans: TraceSpan[]): string {
  const toolCount = countKind(spans, "tool");
  const childCount = countKind(spans, "model");
  const parts = [];
  if (toolCount > 0) parts.push(`${toolCount} tool${toolCount === 1 ? "" : "s"}`);
  if (childCount > 0) parts.push(`${childCount} child turn${childCount === 1 ? "" : "s"}`);
  return parts.join(" - ");
}

function countKind(spans: TraceSpan[], kind: TraceSpan["kind"]): number {
  let count = 0;
  for (const span of spans) {
    if (span.kind === kind) count += 1;
    count += countKind(spanChildren(span), kind);
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    return parsed === value ? value : normalizeJsonValue(parsed, depth + 1);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeJsonValue(nestedValue, depth + 1),
      ]),
    );
  }
  return value;
}

function hasDetailValue(value: unknown): boolean {
  return value != null && value !== "";
}

function isAbilityToolSpan(span: ToolSpan): boolean {
  return span.name === "use_ability" || span.name.endsWith("/use_ability");
}

function detailPayloadForSpan(span: TraceSpan): Record<string, unknown> | undefined {
  if (span.kind === "tool") {
    if (isAbilityToolSpan(span)) return undefined;
    return {
      args: span.rawArgs,
      stdout: span.stdout,
      stderr: span.stderr,
      output: span.output ?? span.outputPreview,
      error: span.errorPreview,
    };
  }
  if (span.kind === "hook") {
    return {
      args: span.rawArgs,
      output: span.outputPreview,
      error: span.errorPreview,
    };
  }
  if (span.kind === "routine_step") {
    return {
      step_type: span.stepType,
      step_slug: span.stepSlug,
      step_run_id: span.stepRunId,
      output: span.outputPreview,
      error: span.errorPreview,
    };
  }
  return undefined;
}

function JsonCodeBlock({ value }: { value: unknown }) {
  return (
    <pre className="theme-surface-muted mt-1 max-h-56 overflow-auto rounded-md px-2.5 py-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
      <code className="language-json font-mono">
        {JSON.stringify(normalizeJsonValue(value), null, 2)}
      </code>
    </pre>
  );
}

function spanRenderKey(span: TraceSpan, index: number, path = "root"): string {
  return `${path}:${span.kind}:${span.id}:${index}`;
}

function statusIcon(status: TraceStatus) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />;
    case "completed":
      return <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <CircleX className="h-3.5 w-3.5 text-red-500" />;
    case "cancelled":
      return <CircleX className="h-3.5 w-3.5 text-gray-400" />;
    case "queued":
      return <Circle className="h-3.5 w-3.5 text-gray-300" />;
  }
}

function spanIcon(span: TraceSpan) {
  switch (span.kind) {
    case "model":
      return <Brain className="h-3.5 w-3.5" />;
    case "routine_step":
      return <Route className="h-3.5 w-3.5" />;
    case "tool":
      return <Terminal className="h-3.5 w-3.5" />;
    case "async_operation":
      return <Route className="h-3.5 w-3.5" />;
    case "ability":
      return <Bot className="h-3.5 w-3.5" />;
    case "delegation":
      return <Route className="h-3.5 w-3.5" />;
    case "hook":
      return <Hammer className="h-3.5 w-3.5" />;
    case "message":
      return <Code2 className="h-3.5 w-3.5" />;
  }
}

function spanTitle(span: TraceSpan): string {
  switch (span.kind) {
    case "model":
      return [span.provider, span.model].filter(Boolean).join(" / ") || "Thinking";
    case "routine_step":
      return span.name;
    case "tool":
      return span.name;
    case "ability":
      return span.displayName;
    case "async_operation":
      return span.label;
    case "delegation":
      return span.targetAgent;
    case "hook":
      return span.hookEvent ? `${span.name}:${span.hookEvent}` : span.name;
    case "message":
      return span.text;
  }
}

function DetailsDisclosure({ span }: { span: TraceSpan }) {
  const [open, setOpen] = useState(false);
  const raw = useMemo(() => detailPayloadForSpan(span), [span]);

  if (!raw || Object.values(raw).every((value) => !hasDetailValue(value))) {
    return null;
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="theme-border theme-surface inline-flex min-h-7 items-center rounded-sm border px-2 text-[10px] font-medium text-gray-500 transition-colors hover:[background:var(--app-hover)] dark:text-gray-400"
      >
        {open ? "Hide details" : "Details"}
      </button>
      {open && <JsonCodeBlock value={raw} />}
    </div>
  );
}

function PreviewText({ children }: { children: string | undefined }) {
  const text = children?.trim();
  if (!text) return null;
  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
      {text}
    </p>
  );
}

function PreviewMarkdown({ children }: { children: string | undefined }) {
  const text = children?.trim();
  if (!text) return null;
  return (
    <div className="prose prose-xs mt-1 max-w-none break-words text-[11px] leading-relaxed text-gray-500 dark:prose-invert dark:text-gray-400 prose-p:my-1 prose-p:whitespace-pre-wrap prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:rounded prose-code:bg-black/[0.06] prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-pre:my-1.5 prose-pre:max-h-56 prose-pre:overflow-auto prose-pre:rounded-md prose-pre:bg-gray-950 prose-pre:p-2 prose-pre:text-gray-100 dark:prose-code:bg-white/[0.08]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
              <table className="my-0 min-w-full border-collapse text-[11px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-gray-100 px-2 py-1 align-top text-gray-500 dark:border-gray-800 dark:text-gray-400">
              {children}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ToolTraceRow({
  span,
  compact,
  showPreview = true,
}: {
  span: ToolSpan;
  compact: boolean;
  showPreview?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPayload = useMemo(() => detailPayloadForSpan(span), [span]);
  const inlinePreview =
    span.textPreview ??
    (span.providerNative ? (span.outputPreview ?? span.errorPreview) : undefined);
  const originLabel = span.providerNative
    ? [span.provider, "provider"].filter(Boolean).join(" ")
    : undefined;
  const hasDetails = Boolean(
    detailsPayload &&
      Object.values(detailsPayload).some((value) => hasDetailValue(value)),
  );
  return (
    <div className="min-w-0">
      <div className="flex min-h-8 items-center gap-2">
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300" title={span.name}>
          {span.name}
        </span>
        {originLabel && (
          <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {originLabel}
          </span>
        )}
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
        {!compact && hasDetails && (
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className="theme-border theme-surface inline-flex min-h-7 shrink-0 items-center rounded-sm border px-2 text-[10px] font-medium text-gray-500 transition-colors hover:[background:var(--app-hover)] dark:text-gray-400"
          >
            {detailsOpen ? "Hide" : "Details"}
          </button>
        )}
      </div>
      {!compact && showPreview && (
        <>
          <PreviewText>{inlinePreview}</PreviewText>
          {detailsOpen && detailsPayload && <JsonCodeBlock value={detailsPayload} />}
        </>
      )}
      {!compact && !showPreview && detailsOpen && detailsPayload && (
        <JsonCodeBlock value={detailsPayload} />
      )}
    </div>
  );
}

function RoutineStepTraceBlock({
  span,
  compact,
}: {
  span: RoutineStepSpan;
  compact: boolean;
}) {
  const forceExpanded = span.status === "running" || span.children.some(hasRunningSpan);
  const [manualExpanded, setManualExpanded] = useState(span.status !== "completed");
  const expanded = forceExpanded || manualExpanded;
  const summary = spanSummary(span.children);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setManualExpanded((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2 rounded-sm text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={span.name}>
          {span.name}
        </span>
        <span className="shrink-0 rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {span.stepType}
        </span>
        {summary && (
          <span className="hidden shrink-0 text-[10px] text-gray-400 sm:inline">
            {summary}
          </span>
        )}
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
      </button>
      {expanded && (
        <div className="theme-border ml-4 border-l pl-3">
          <PreviewSection label="Output" text={span.outputPreview} />
          <PreviewSection label="Error" text={span.errorPreview} />
          {span.children.length > 0 && (
            <div className="mt-2 space-y-1">
              {span.children.map((child, index) => (
                <TraceSpanRow
                  key={spanRenderKey(child, index, span.id)}
                  span={child}
                  compact={compact}
                  nested
                />
              ))}
            </div>
          )}
          {!compact && <DetailsDisclosure span={span} />}
        </div>
      )}
    </div>
  );
}

function AbilityTraceBlock({ span, compact }: { span: AbilitySpan; compact: boolean }) {
  const forceExpanded = span.status === "running" || span.children.some(hasRunningSpan);
  const [manualExpanded, setManualExpanded] = useState(span.status !== "completed");
  const expanded = forceExpanded || manualExpanded;
  const summary = spanSummary(span.children);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setManualExpanded((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2 rounded-sm text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={span.displayName}>
          Ability: {span.displayName}
        </span>
        {summary && (
          <span className="hidden shrink-0 text-[10px] text-gray-400 sm:inline">
            {summary}
          </span>
        )}
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
      </button>
      {expanded && (
        <div className="theme-border ml-4 border-l pl-3">
          <PreviewSection label="Task from parent" text={span.taskPreview} />
          {span.children.length > 0 && (
            <div className="mt-2 space-y-1">
              {span.children.map((child, index) => (
                <TraceSpanRow
                  key={spanRenderKey(child, index, span.id)}
                  span={child}
                  compact={compact}
                  nested
                />
              ))}
            </div>
          )}
          <PreviewSection label="Result to parent" text={span.resultPreview} />
        </div>
      )}
    </div>
  );
}

function AsyncOperationTraceBlock({
  span,
  compact,
}: {
  span: AsyncOperationSpan;
  compact: boolean;
}) {
  const forceExpanded = span.status === "running" || span.children.some(hasRunningSpan);
  const [manualExpanded, setManualExpanded] = useState(span.status !== "completed");
  const expanded = forceExpanded || manualExpanded;
  const summary = spanSummary(span.children);
  const isAbility = span.operationKind === "ability";
  const isSubAgent = span.operationKind === "sub_agent";
  const transcript = visibleHistoryTranscriptEntries(span);
  const resultPreview = visibleAsyncOperationResultPreview(span);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setManualExpanded((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2 rounded-sm text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={span.label}>
          {isAbility ? `Ability: ${span.label}` : `${span.operationKind}: ${span.label}`}
        </span>
        {summary && (
          <span className="hidden shrink-0 text-[10px] text-gray-400 sm:inline">
            {summary}
          </span>
        )}
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
      </button>
      {expanded && (
        <div className="theme-border ml-4 border-l pl-3">
          <PreviewSection
            label={isAbility ? "Task from parent" : span.signal ?? "Status"}
            text={isAbility ? span.taskPreview ?? span.summary : span.summary}
          />
          {transcript.length > 0 && (
            <div className="mt-2 space-y-1">
              {transcript.map((entry, index) => (
                <div
                  key={`${span.id}:transcript:${index}`}
                  className="theme-surface-muted/40 rounded-sm px-1.5 py-1"
                >
                  <div className="flex min-h-6 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-600 dark:text-gray-400">
                      {entry.tool ? `${entry.kind}: ${entry.tool}` : entry.kind}
                    </span>
                    {entry.success != null && (
                      <span className="shrink-0 text-[10px] text-gray-400">
                        {entry.success ? "Done" : "Failed"}
                      </span>
                    )}
                  </div>
                  <PreviewText>{entry.summary}</PreviewText>
                </div>
              ))}
            </div>
          )}
          {span.children.length > 0 && (
            <div className="mt-2 space-y-1">
              {span.children.map((child, index) => (
                <TraceSpanRow
                  key={spanRenderKey(child, index, span.id)}
                  span={child}
                  compact={compact}
                  nested
                />
              ))}
            </div>
          )}
          {(isAbility || isSubAgent) && (
            <PreviewSection label="Result to parent" text={resultPreview} />
          )}
          {!compact && span.details !== undefined && <JsonCodeBlock value={span.details} />}
        </div>
      )}
    </div>
  );
}

function PreviewSection({ label, text }: { label: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="mt-2">
      <div className="text-[10px] font-medium uppercase tracking-normal text-gray-400">
        {label}
      </div>
      <PreviewMarkdown>{text}</PreviewMarkdown>
    </div>
  );
}

function DelegationTraceBlock({ span, compact }: { span: DelegationSpan; compact: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex min-h-8 items-center gap-2">
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={span.targetAgent}>
          Delegate: {span.targetAgent}
        </span>
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
      </div>
      {!compact && (
        <>
          <PreviewSection label="Task" text={span.taskPreview} />
          <PreviewSection label="Result" text={span.resultPreview} />
        </>
      )}
    </div>
  );
}

function HookTraceRow({ span, compact }: { span: HookSpan; compact: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex min-h-8 items-center gap-2">
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300" title={spanTitle(span)}>
          Hook: {spanTitle(span)}
        </span>
        <span className="shrink-0 text-[10px] font-medium text-gray-400">
          {statusLabel(span.status)}
        </span>
      </div>
      {!compact && (
        <>
          <PreviewText>{span.outputPreview ?? span.errorPreview}</PreviewText>
          <DetailsDisclosure span={span} />
        </>
      )}
    </div>
  );
}

function ModelTraceBlock({
  span,
  compact,
}: {
  span: ModelSpan;
  compact: boolean;
}) {
  const children = spanChildren(span);
  const text = span.text?.trim();
  const toolCount = children.filter((child) => child.kind === "tool").length;

  if (!text && children.length === 0) {
    return (
      <div className="flex min-h-8 items-center gap-2">
        <span className="shrink-0">{statusIcon(span.status)}</span>
        <span
          className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300"
          title={spanTitle(span)}
        >
          {span.status === "running" ? "Thinking" : "Thought"}
        </span>
        <span className="shrink-0 text-[10px] text-gray-400">
          {formatDuration(durationMs(span.startedAt, span.completedAt))}
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <PreviewMarkdown>{span.text}</PreviewMarkdown>
      {children.length > 0 && (
        <div className="theme-border mt-2 border-l pl-3">
          {toolCount > 0 && (
            <div className="mb-1 flex min-h-5 items-center gap-1.5 text-[10px] font-medium text-gray-400">
              <Terminal className="h-3 w-3 shrink-0" />
              <span>{toolCount === 1 ? "1 tool call" : `${toolCount} tool calls`}</span>
            </div>
          )}
          <div className="space-y-1">
            {children.map((child, index) => (
              <TraceSpanRow
                key={spanRenderKey(child, index, span.id)}
                span={child}
                compact={compact}
                nested
                suppressToolPreview
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceSpanRow({
  span,
  compact,
  nested = false,
  suppressToolPreview = false,
}: {
  span: TraceSpan;
  compact: boolean;
  nested?: boolean;
  suppressToolPreview?: boolean;
}) {
  const content = (() => {
    switch (span.kind) {
      case "model":
        return <ModelTraceBlock span={span} compact={compact} />;
      case "routine_step":
        return <RoutineStepTraceBlock span={span} compact={compact} />;
      case "tool":
        return (
          <ToolTraceRow
            span={span}
            compact={compact}
            showPreview={!suppressToolPreview}
          />
        );
      case "ability":
        return <AbilityTraceBlock span={span} compact={compact} />;
      case "async_operation":
        return <AsyncOperationTraceBlock span={span} compact={compact} />;
      case "delegation":
        return <DelegationTraceBlock span={span} compact={compact} />;
      case "hook":
        return <HookTraceRow span={span} compact={compact} />;
      case "message":
        return (
          <div className="flex min-h-8 items-center gap-2">
            {statusIcon(span.status)}
            <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-400">
              {span.text}
            </span>
          </div>
        );
    }
  })();

  return (
    <div
      className={cn(
        "min-w-0 rounded-sm px-1.5 py-1",
        nested ? "bg-transparent" : "theme-surface-muted/40",
      )}
    >
      <div className="sr-only">{spanIcon(span)}</div>
      {content}
    </div>
  );
}

export const AgentRunTrace = memo(function AgentRunTrace({
  trace,
  activeAgent,
  mode = "live",
  density = "regular",
  mobile = false,
  className,
  embedded = false,
}: AgentRunTraceProps) {
  const compact = density === "compact";
  const animateAgent =
    mode === "live" &&
    !embedded &&
    trace.phase !== "completed" &&
    trace.phase !== "failed" &&
    trace.phase !== "cancelled";
  const elapsed = formatDuration(durationMs(trace.startedAt, trace.completedAt));
  const phase = phaseLabel(trace.phase);
  const orderedSpans = useMemo(() => chronologicalSpans(trace.spans), [trace.spans]);
  const cycleSpans = useMemo(
    () =>
      mode === "live" && !embedded
        ? currentCycleSpans(orderedSpans)
        : orderedSpans,
    [embedded, mode, orderedSpans],
  );
  const visibleSpans = useMemo(
    () =>
      mode === "history" || embedded
        ? filterHistorySpans(cycleSpans)
        : cycleSpans,
    [cycleSpans, embedded, mode],
  );
  const displaySpans = useMemo(
    () =>
      trace.source === "chat" ? chatDisplaySpans(visibleSpans) : visibleSpans,
    [trace.source, visibleSpans],
  );

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        mobile || embedded
          ? "w-full max-w-full"
          : mode === "history"
            ? "w-full"
            : "w-full",
        className,
      )}
    >
      {mode === "live" && !embedded && (
        activeAgent ? (
          <RoleIdenticon
            roleId={activeAgent.id}
            color={activeAgent.color}
            size={32}
            className="shrink-0"
            animate={animateAgent}
            name={activeAgent.name}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-tangerine-100 text-xs font-bold text-vivid-tangerine-700">
            AI
          </div>
        )
      )}
      <div
        className={cn(
          "theme-border theme-surface min-w-0 rounded-xl border",
          embedded && "border-0 bg-transparent px-0 py-0 dark:bg-transparent",
          mode === "live" && "rounded-tl-sm",
          !embedded && (compact ? "px-3 py-2" : "px-4 py-2.5"),
          mobile || embedded
            ? "flex-1"
            : mode === "history"
              ? "w-full flex-1"
              : "w-full max-w-[75%]",
        )}
      >
        <div className="flex min-h-7 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
            {phase}
          </span>
          {elapsed && (
            <span className="shrink-0 text-[10px] text-gray-400 tabular-nums">
              {elapsed}
            </span>
          )}
        </div>
        {trace.errorMessage && (
          <p className="mt-1 text-xs text-red-500 dark:text-red-400">
            {trace.errorMessage}
          </p>
        )}
        {displaySpans.length > 0 && (
          <div className={cn("mt-1.5 space-y-1", compact && "mt-1")}>
            {displaySpans.map((span, index) => (
              <TraceSpanRow
                key={spanRenderKey(span, index)}
                span={span}
                compact={compact}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
