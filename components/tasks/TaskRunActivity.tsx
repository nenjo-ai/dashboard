"use client";

import { useEffect, useState } from "react";

import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  executionRealtimeEventIsTerminal,
  EXECUTION_EVENT_TYPE,
  ExecutionEventKind,
} from "@/lib/executionEvents";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import {
  traceEnvelopeFromRealtimeEvent,
  type ExecutionTraceEnvelope,
} from "@/lib/executionTraceEvents";
import { taskExecutionIsActive } from "@/lib/taskLifecycle";
import type { ExecutionStatus } from "@/lib/types";
import { useExecutionTraceGroups } from "@/lib/useExecutionTraceGroups";

interface TaskRunActivityProps {
  executionId: string;
  status: ExecutionStatus;
  onTerminal?: () => void;
}

/**
 * Shows persisted and live agent activity for a task execution using the same
 * run-trace model and execution SSE endpoint as project executions.
 */
export function TaskRunActivity({
  executionId,
  status,
  onTerminal,
}: TaskRunActivityProps) {
  const [liveEnvelopes, setLiveEnvelopes] = useState<ExecutionTraceEnvelope[]>([]);
  const { groups, traceTruncated, isLoading, isError, mutate } = useExecutionTraceGroups(
    executionId,
    liveEnvelopes,
  );
  const isActive = taskExecutionIsActive(status);

  useEffect(() => {
    const controller = new AbortController();
    let terminalRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    void subscribeExecutionRealtime(
      (event) => {
        if (event.data.type === EXECUTION_EVENT_TYPE) {
          const executionEvent =
            typeof event.data.event === "object" &&
            event.data.event !== null &&
            !Array.isArray(event.data.event)
              ? (event.data.event as Record<string, unknown>)
              : null;
          if (executionEvent?.kind === ExecutionEventKind.AgentTrace) {
            const envelope = traceEnvelopeFromRealtimeEvent(event.data);
            if (envelope) {
              setLiveEnvelopes((current) => [...current, envelope]);
            }
          }
        }

        if (executionRealtimeEventIsTerminal(event.data)) {
          // The scoped SSE hub and durable processor consume the same NATS
          // publication independently. Give persistence a brief head start
          // before refreshing REST projections, matching project executions.
          terminalRefreshTimer ??= setTimeout(() => {
            terminalRefreshTimer = null;
            void mutate();
            onTerminal?.();
          }, 350);
        }
      },
      executionId,
      controller.signal,
    ).catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Task execution realtime stream failed:", error);
      }
    });

    return () => {
      controller.abort();
      if (terminalRefreshTimer) clearTimeout(terminalRefreshTimer);
    };
  }, [executionId, mutate, onTerminal]);

  if (isLoading && groups.size === 0) return <Skeleton className="h-48 w-full" />;
  if (isError && groups.size === 0) {
    return <p className="theme-text-muted text-sm">Run activity is unavailable.</p>;
  }
  if (groups.size === 0) {
    return (
      <div className="theme-surface-muted rounded-lg px-3 py-4">
        <p className="theme-text-muted text-sm">
          {isActive ? "Waiting for live agent activity…" : "No trace activity was recorded."}
        </p>
      </div>
    );
  }

  return (
    <div className="theme-border max-h-[36rem] space-y-3 overflow-y-auto rounded-lg border p-3">
      {traceTruncated ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          This activity trace is incomplete because an event exceeded the archive
          safety limit.
        </p>
      ) : null}
      {Array.from(groups.entries()).map(([runId, group], index) => (
        <section className="theme-surface-muted rounded-lg p-3" key={runId}>
          {groups.size > 1 || group.routineStep ? (
            <p className="theme-text-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
              {group.routineStep?.step_name ??
                group.routineStep?.step_slug ??
                `Agent run ${index + 1}`}
            </p>
          ) : null}
          <AgentRunTrace
            density="regular"
            embedded
            mode={isActive ? "live" : "history"}
            trace={group.trace}
          />
        </section>
      ))}
    </div>
  );
}
