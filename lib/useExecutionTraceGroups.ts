"use client";

import { useEffect, useMemo, useState } from "react";

import { useExecutionTraceEvents } from "@/lib/hooks";
import {
  buildExecutionTraceGroups,
  traceEnvelopeFromPersistedEvent,
  type ExecutionTraceEnvelope,
  type ExecutionTraceGroup,
} from "@/lib/executionTraceEvents";

const EMPTY_TRACE_ENVELOPES: ExecutionTraceEnvelope[] = [];
const EMPTY_TRACE_GROUPS = new Map<string, ExecutionTraceGroup>();

/**
 * Reduce persisted and live execution events into the run-trace model shared
 * by project executions and task-scoped executions.
 */
export function useExecutionTraceGroups(
  executionId: string | undefined,
  liveEnvelopes: ExecutionTraceEnvelope[] = EMPTY_TRACE_ENVELOPES,
) {
  const traceQuery = useExecutionTraceEvents(executionId);
  const envelopes = useMemo(
    () => [
      ...(traceQuery.traceEvents ?? []).map(traceEnvelopeFromPersistedEvent),
      ...liveEnvelopes,
    ],
    [liveEnvelopes, traceQuery.traceEvents],
  );
  const [traceGroupState, setTraceGroupState] = useState<{
    executionId: string | undefined;
    groups: Map<string, ExecutionTraceGroup>;
  }>({ executionId: undefined, groups: EMPTY_TRACE_GROUPS });

  useEffect(() => {
    if (!executionId || envelopes.length === 0) return;
    let cancelled = false;

    void buildExecutionTraceGroups(envelopes)
      .then((groups) => {
        if (!cancelled) setTraceGroupState({ executionId, groups });
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Failed to build execution trace groups", error);
          setTraceGroupState({ executionId, groups: EMPTY_TRACE_GROUPS });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [envelopes, executionId]);

  const groups =
    executionId &&
    envelopes.length > 0 &&
    traceGroupState.executionId === executionId
      ? traceGroupState.groups
      : EMPTY_TRACE_GROUPS;

  return { ...traceQuery, groups };
}
