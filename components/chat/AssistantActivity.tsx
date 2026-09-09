"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert } from "lucide-react";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { cn } from "@/lib/cn";
import { loadEnvelopeEvents } from "@/lib/agentRunTrace/envelopeStore";
import {
  reduceRunTraceEventRecords,
  type RunTraceEventRecord,
} from "@/lib/agentRunTrace/reducer";
import { settledAssistantActivityTrace } from "@/lib/chat/derivations";
import { lifecycleEventRecordsFromExecutionTraceEnvelopes } from "@/lib/executionTraceEvents";
import { useChatTraceEvents } from "@/lib/hooks";
import {
  storedTraceActivitySummary,
  traceActivitySummary,
  withPersistedActivityTiming,
} from "@/lib/agentRunTrace/presentation";
import {
  chatDisplaySpans,
  filterHistorySpans,
  hasMeaningfulChatActivity,
} from "@/lib/agentRunTrace/visibility";
import type { RunTrace } from "@/lib/agentRunTrace/types";
import type { ChatMessage } from "@/lib/types";

/**
 * Activity for one assistant message.
 *
 * Activity starts collapsed for both live and historical turns. Its compact
 * metrics arrive with chat history; detailed S3-backed events are fetched only
 * when the user opens it. Pre-migration IndexedDB envelopes remain a fallback.
 */
export function AssistantActivity({
  message,
  compact = false,
  hasResponseContent,
  isLive: isLiveOverride,
}: {
  message: ChatMessage;
  compact?: boolean;
  hasResponseContent?: boolean;
  isLive?: boolean;
}) {
  const isLive = isLiveOverride ?? message.isLiveDraft === true;
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const activityPanelId = useId();
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const [loadedEnvelope, setLoadedEnvelope] = useState<{
    envelopeId: string;
    trace?: RunTrace;
    failed: boolean;
  }>();
  const remoteRunId =
    activityOpen && !message.runTrace ? message.runEnvelopeId : undefined;
  const {
    traceEvents: remoteTraceEvents,
    traceTruncated,
    isLoading: remoteTraceLoading,
    isError: remoteTraceFailed,
    mutate: retryRemoteTrace,
  } = useChatTraceEvents(remoteRunId);
  const matchingLoadedEnvelope =
    loadedEnvelope?.envelopeId === message.runEnvelopeId
      ? loadedEnvelope
      : undefined;
  const envelopeTrace = matchingLoadedEnvelope?.trace;
  const activityLoadFailed = matchingLoadedEnvelope?.failed === true;
  const sourceActivityTrace = message.runTrace ?? envelopeTrace;
  const activityMessage = useMemo(
    () =>
      isLive === (message.isLiveDraft === true)
        ? message
        : { ...message, isLiveDraft: isLive },
    [isLive, message],
  );
  const activityTrace = useMemo(() => {
    const trace = settledAssistantActivityTrace(
      activityMessage,
      sourceActivityTrace,
    );
    return trace
      ? withPersistedActivityTiming(trace, message.activitySummary)
      : undefined;
  }, [activityMessage, message.activitySummary, sourceActivityTrace]);
  const displaySpans = useMemo(
    () =>
      activityTrace
        ? filterHistorySpans(chatDisplaySpans(activityTrace.spans))
        : [],
    [activityTrace],
  );
  const hasActivity =
    hasMeaningfulChatActivity(displaySpans) ||
    activityLoadFailed ||
    (!sourceActivityTrace && Boolean(message.runEnvelopeId));
  const responseContentVisible =
    hasResponseContent ?? Boolean(message.content.trim());
  const summary = useMemo(() => {
    if (activityTrace) {
      return traceActivitySummary({
        ...activityTrace,
        spans: displaySpans,
      });
    }
    if (message.activitySummary) {
      return storedTraceActivitySummary(message.activitySummary);
    }
    const status =
      message.runStatus === "connecting"
        ? "Connecting"
        : message.runStatus === "generating"
          ? "Responding"
          : message.runStatus === "using_tool"
            ? "Using tools"
            : message.runStatus === "retrying"
              ? "Retrying"
              : message.runStatus === "failed"
                ? "Failed"
                : message.runStatus === "cancelled"
                  ? "Cancelled"
                  : "Completed";
    return { status, ariaLabel: `Activity, ${status}` };
  }, [activityTrace, displaySpans, message.activitySummary, message.runStatus]);
  const normalizedStatus = summary.status.toLowerCase();
  const activityFailed = normalizedStatus.includes("failed");
  const activityCompleted = normalizedStatus.includes("completed");

  useEffect(() => {
    if (!activityOpen || message.runTrace || !message.runEnvelopeId) return;
    if (remoteTraceLoading) return;
    if (remoteTraceEvents === undefined && !remoteTraceFailed) return;
    const envelopeId = message.runEnvelopeId;
    let cancelled = false;
    const loadEventRecords = async (): Promise<RunTraceEventRecord[]> => {
      if (remoteTraceEvents?.length) {
        return lifecycleEventRecordsFromExecutionTraceEnvelopes(
          remoteTraceEvents.map((event) => ({
            executionRunId: event.run_id,
            taskId: null,
            routineStep: null,
            event: event.event,
            createdAt: event.created_at,
            sequence: event.sequence,
          })),
        );
      }
      return (await loadEnvelopeEvents(envelopeId)).map((event) => ({ event }));
    };
    void loadEventRecords()
      .then((records) => {
        if (cancelled) return;
        const trace = reduceRunTraceEventRecords(undefined, records);
        setLoadedEnvelope({
          envelopeId,
          trace,
          failed: records.length === 0 || !trace,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedEnvelope({ envelopeId, failed: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activityOpen,
    message.runEnvelopeId,
    message.runTrace,
    remoteTraceEvents,
    remoteTraceFailed,
    remoteTraceLoading,
  ]);

  // Expansion happens beside a docked composer. Once the short reveal finishes,
  // keep the complete trace in view instead of allowing its last rows to sit
  // beneath the composer.
  useEffect(() => {
    if (!activityOpen) return;
    const timer = window.setTimeout(() => {
      activityPanelRef.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }, 210);
    return () => window.clearTimeout(timer);
  }, [activityOpen]);

  if (!hasActivity) return null;

  return (
    <div className={cn("not-prose w-full", responseContentVisible && "pt-1")}>
      <button
        type="button"
        onClick={() => {
          if (!activityOpen) setHasOpened(true);
          setActivityOpen((open) => !open);
        }}
        className="flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-full border border-black/[0.06] bg-gray-50/80 px-2.5 py-1 text-left text-[11px] font-medium text-gray-600 shadow-sm transition-[background-color,border-color,color] hover:border-black/10 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-space-blue-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-white/15 dark:hover:bg-white/[0.07] dark:hover:text-gray-100"
        aria-expanded={activityOpen}
        aria-controls={activityPanelId}
        aria-label={`${activityOpen ? "Hide" : "Show"} ${summary.ariaLabel}`}
      >
        {activityOpen ? (
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-gray-400"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-gray-400"
            aria-hidden="true"
          />
        )}
        {activityFailed ? (
          <CircleAlert
            className="h-3 w-3 shrink-0 text-rose-500"
            aria-hidden="true"
          />
        ) : activityCompleted ? (
          <Check
            className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-300"
            aria-hidden="true"
          />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-deep-space-blue-500 motion-safe:animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <span className="shrink-0 font-semibold">Activity</span>
        <span className="min-w-0 truncate font-normal text-gray-400 dark:text-gray-500">
          · {summary.status}
          {summary.detail ? ` · ${summary.detail}` : ""}
        </span>
        {summary.duration ? (
          <span className="shrink-0 text-[11px] font-normal tabular-nums text-gray-400 dark:text-gray-500">
            {summary.duration}
          </span>
        ) : null}
        <span className="sr-only">{activityOpen ? "Hide" : "Show"}</span>
      </button>
      {hasOpened ? (
        <div
          ref={activityPanelRef}
          id={activityPanelId}
          role="region"
          aria-label="Agent activity"
          aria-hidden={!activityOpen}
          inert={activityOpen ? undefined : true}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            activityOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-2 overflow-hidden rounded-xl border border-black/[0.06] bg-gray-50/65 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
              {activityTrace ? (
                <>
                  {traceTruncated ? (
                    <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      This activity trace is incomplete because an event exceeded
                      the archive safety limit.
                    </p>
                  ) : null}
                  <AgentRunTrace
                    trace={activityTrace}
                    mode={isLive ? "live" : "history"}
                    density={compact ? "compact" : "regular"}
                    embedded
                  />
                </>
              ) : activityLoadFailed ? (
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Activity couldn&apos;t be loaded.</span>
                  {remoteRunId ? (
                    <button
                      type="button"
                      className="font-semibold text-deep-space-blue-600 hover:underline dark:text-deep-space-blue-300"
                      onClick={() => void retryRemoteTrace().catch(() => undefined)}
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                  Loading activity…
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
