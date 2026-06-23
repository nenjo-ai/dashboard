import type {
  AsyncOperationSpan,
  AsyncOperationTranscriptEntry,
  ModelSpan,
  ToolSpan,
  TraceSpan,
} from "./types";

export function spanChildren(span: TraceSpan): TraceSpan[] {
  return "children" in span ? span.children ?? [] : [];
}

export function chronologicalSpans(spans: TraceSpan[]): TraceSpan[] {
  return spans
    .map((span, index) => ({ span, index }))
    .sort((left, right) => {
      const leftTime = new Date(left.span.startedAt).getTime();
      const rightTime = new Date(right.span.startedAt).getTime();
      if (leftTime === rightTime) return left.index - right.index;
      return leftTime - rightTime;
    })
    .map(({ span }) => {
      if (!("children" in span) || !span.children) return span;
      return {
        ...span,
        children: chronologicalSpans(span.children),
      } as TraceSpan;
    });
}

function isCompletedModelSpan(span: TraceSpan): span is ModelSpan {
  return span.kind === "model" && span.status === "completed";
}

function isRawTranscriptMessageSpan(span: TraceSpan): boolean {
  return (
    span.kind === "message" &&
    ["assistant_message", "tool_call", "tool_result"].some((kind) =>
      span.text.startsWith(kind),
    )
  );
}

function isRawProviderEchoToolSpan(span: TraceSpan): boolean {
  return (
    span.kind === "tool" &&
    span.providerNative === true &&
    (span.name === "tool" || span.name === "assistant_message")
  );
}

function isToolTranscriptEntry(entry: AsyncOperationTranscriptEntry): boolean {
  return ["assistant_message", "tool_call", "tool_result"].includes(entry.kind);
}

export function visibleHistoryTranscriptEntries(
  span: AsyncOperationSpan,
): AsyncOperationTranscriptEntry[] {
  if (span.children.length === 0) return span.transcript;
  return span.transcript.filter((entry) => !isToolTranscriptEntry(entry));
}

export function filterHistorySpans(spans: TraceSpan[]): TraceSpan[] {
  return spans.flatMap((span) => {
    if (isCompletedModelSpan(span)) return [];
    if (isRawTranscriptMessageSpan(span) || isRawProviderEchoToolSpan(span)) {
      return [];
    }
    if (!("children" in span) || !span.children) return [span];
    return [
      {
        ...span,
        children: filterHistorySpans(span.children),
      } as TraceSpan,
    ];
  });
}

export function hasRunningSpan(span: TraceSpan): boolean {
  return span.status === "running" || spanChildren(span).some(hasRunningSpan);
}

function activeActionSpansBefore(
  spans: TraceSpan[],
  beforeIndex: number,
): TraceSpan[] {
  const activeActions: TraceSpan[] = [];
  for (let index = 0; index < beforeIndex; index += 1) {
    const span = spans[index];
    if (span.kind !== "model" && hasRunningSpan(span)) {
      activeActions.push(span);
    }
  }
  return activeActions;
}

export function currentCycleSpans(spans: TraceSpan[]): TraceSpan[] {
  let lastModelIndex = -1;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    if (spans[index].kind === "model") {
      lastModelIndex = index;
      break;
    }
  }

  if (lastModelIndex === -1) return spans;

  const latestModel = spans[lastModelIndex];
  const activeActionsBeforeLatestModel = activeActionSpansBefore(
    spans,
    lastModelIndex,
  );

  if (latestModel.status === "running") {
    const currentActionBatch = spans
      .slice(lastModelIndex + 1)
      .filter((span) => span.kind !== "model");
    if (currentActionBatch.length > 0) {
      const activeIds = new Set(
        activeActionsBeforeLatestModel.map((span) => span.id),
      );
      return [
        ...activeActionsBeforeLatestModel,
        latestModel,
        ...currentActionBatch.filter((span) => !activeIds.has(span.id)),
      ];
    }
    return activeActionsBeforeLatestModel.length > 0
      ? [...activeActionsBeforeLatestModel, latestModel]
      : [latestModel];
  }

  const currentActionBatch = spans
    .slice(lastModelIndex + 1)
    .filter((span) => span.kind !== "model");
  if (currentActionBatch.length > 0) {
    const latestBatchId = [...currentActionBatch]
      .reverse()
      .find(
        (span): span is ToolSpan =>
          span.kind === "tool" && Boolean(span.batchId),
      )?.batchId;
    const activeIds = new Set(
      activeActionsBeforeLatestModel.map((span) => span.id),
    );
    const visibleBatch = latestBatchId
      ? currentActionBatch.filter(
          (span) =>
            span.kind !== "tool" ||
            !span.batchId ||
            span.batchId === latestBatchId ||
            span.providerNative ||
            span.status === "running",
        )
      : currentActionBatch;
    return [
      ...activeActionsBeforeLatestModel,
      ...visibleBatch.filter((span) => !activeIds.has(span.id)),
    ];
  }

  return activeActionsBeforeLatestModel.length > 0
    ? [...activeActionsBeforeLatestModel, latestModel]
    : [latestModel];
}
