"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { cn } from "@/lib/cn";
import { loadEnvelopeEvents } from "@/lib/agentRunTrace/envelopeStore";
import { reduceRunTraceEvents } from "@/lib/agentRunTrace/reducer";
import { settledAssistantActivityTrace } from "@/lib/chat/derivations";
import { traceActivitySummary } from "@/lib/agentRunTrace/presentation";
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
 * Activity starts collapsed for both live and historical turns. Historical
 * activity is hydrated from this browser's encrypted envelope store only when
 * the user opens it.
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
  const [loadedEnvelope, setLoadedEnvelope] = useState<{
    envelopeId: string;
    trace?: RunTrace;
    failed: boolean;
  }>();
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
  const activityTrace = useMemo(
    () => settledAssistantActivityTrace(activityMessage, sourceActivityTrace),
    [activityMessage, sourceActivityTrace],
  );
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
  }, [activityTrace, displaySpans, message.runStatus]);

  useEffect(() => {
    if (!activityOpen || message.runTrace || !message.runEnvelopeId) return;
    if (loadedEnvelope?.envelopeId === message.runEnvelopeId) return;
    const envelopeId = message.runEnvelopeId;
    let cancelled = false;
    void loadEnvelopeEvents(envelopeId)
      .then((events) => {
        if (cancelled) return;
        const trace = reduceRunTraceEvents(undefined, events);
        setLoadedEnvelope({
          envelopeId,
          trace,
          failed: events.length === 0 || !trace,
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
    loadedEnvelope?.envelopeId,
    message.runEnvelopeId,
    message.runTrace,
  ]);

  if (!hasActivity) return null;

  return (
    <div
      className={cn(
        "not-prose w-full",
        responseContentVisible &&
          "border-t border-gray-200/70 pt-2 dark:border-gray-700/70",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (!activityOpen) setHasOpened(true);
          setActivityOpen((open) => !open);
        }}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-1 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-black/[0.025] hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-space-blue-500 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
        aria-expanded={activityOpen}
        aria-controls={activityPanelId}
        aria-label={`${activityOpen ? "Hide" : "Show"} ${summary.ariaLabel}`}
      >
        {activityOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span className="shrink-0">Activity</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-gray-400 dark:text-gray-500">
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
            {activityTrace ? (
              <AgentRunTrace
                trace={activityTrace}
                mode={isLive ? "live" : "history"}
                density={compact ? "compact" : "regular"}
                embedded
              />
            ) : activityLoadFailed ? (
              <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                Activity unavailable on this device.
              </p>
            ) : (
              <p className="px-1 py-2 text-xs text-gray-500 dark:text-gray-400">
                Loading activity…
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
