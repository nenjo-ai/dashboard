"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { cn } from "@/lib/cn";
import { loadEnvelopeEvents } from "@/lib/agentRunTrace/envelopeStore";
import { reduceRunTraceEvents } from "@/lib/agentRunTrace/reducer";
import { settledAssistantActivityTrace } from "@/lib/chatInterfaceState";
import type { RunTrace } from "@/lib/agentRunTrace/types";
import type { ChatMessage } from "@/lib/types";

/**
 * Activity for one assistant message.
 *
 * A live turn starts expanded inside its assistant card and collapses when the
 * same card becomes the finalized message. Historical activity is hydrated
 * from this browser's encrypted envelope store only when the user opens it.
 */
export function AssistantActivity({
  message,
  compact = false,
  hasResponseContent,
}: {
  message: ChatMessage;
  compact?: boolean;
  hasResponseContent?: boolean;
}) {
  const isLive = message.isLiveDraft === true;
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
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
  const activityTrace = useMemo(
    () => settledAssistantActivityTrace(message, sourceActivityTrace),
    [message, sourceActivityTrace],
  );
  const activityOpen =
    manualOpen ?? (isLive || activityTrace?.phase === "failed");
  const hasActivity = Boolean(message.runTrace ?? message.runEnvelopeId);
  const responseContentVisible =
    hasResponseContent ?? Boolean(message.content.trim());

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
          setManualOpen(!activityOpen);
        }}
        className="flex min-h-8 w-full items-center gap-2 text-left text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        aria-expanded={activityOpen}
      >
        {activityOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span className="min-w-0 flex-1">Activity</span>
        <span className="shrink-0 text-[10px] uppercase tracking-normal text-gray-400">
          {activityOpen ? "Hide" : "Show"}
        </span>
      </button>
      {activityOpen && activityTrace ? (
        <AgentRunTrace
          trace={activityTrace}
          mode={isLive ? "live" : "history"}
          density={compact ? "compact" : "regular"}
          embedded
        />
      ) : null}
      {activityOpen && !activityTrace && activityLoadFailed ? (
        <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
          Activity unavailable on this device.
        </p>
      ) : null}
    </div>
  );
}
