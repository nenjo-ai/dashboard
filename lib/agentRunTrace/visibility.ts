import type {
  AsyncOperationSpan,
  AsyncOperationTranscriptEntry,
  ModelSpan,
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

function isEmptyCompletedModelSpan(span: TraceSpan): span is ModelSpan {
  return (
    span.kind === "model" &&
    span.status === "completed" &&
    !span.text?.trim() &&
    spanChildren(span).length === 0
  );
}

function modelSpanHasDisplayContent(span: TraceSpan): boolean {
  return span.kind === "model" && (Boolean(span.text?.trim()) || spanChildren(span).length > 0);
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

function comparableText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

function modelTexts(spans: TraceSpan[]): string[] {
  return spans.flatMap((span) => {
    const nested = spanChildren(span);
    const current =
      span.kind === "model" && span.text?.trim() ? [span.text] : [];
    return nested.length > 0 ? [...current, ...modelTexts(nested)] : current;
  });
}

export function visibleHistoryTranscriptEntries(
  span: AsyncOperationSpan,
): AsyncOperationTranscriptEntry[] {
  if (span.children.length === 0) return span.transcript;
  return span.transcript.filter((entry) => !isToolTranscriptEntry(entry));
}

export function visibleAsyncOperationResultPreview(
  span: AsyncOperationSpan,
): string | undefined {
  const resultPreview = span.resultPreview?.trim();
  if (!resultPreview) return undefined;
  const resultText = comparableText(resultPreview);
  const isAlreadyShownByChildModel = modelTexts(span.children).some(
    (text) => comparableText(text) === resultText,
  );
  return isAlreadyShownByChildModel ? undefined : span.resultPreview;
}

function isHiddenChatToolSpan(span: TraceSpan): boolean {
  return span.kind === "tool" && span.name === "respond_to_user";
}

function filterChatSpan(span: TraceSpan): TraceSpan | undefined {
  if (isHiddenChatToolSpan(span)) return undefined;
  if (!("children" in span) || !span.children) return span;
  return {
    ...span,
    children: chatDisplaySpans(span.children),
  } as TraceSpan;
}

export function chatDisplaySpans(spans: TraceSpan[]): TraceSpan[] {
  const displaySpans: TraceSpan[] = [];
  let latestModelIndex = -1;

  for (const originalSpan of spans) {
    const span = filterChatSpan(originalSpan);
    if (!span) continue;

    if (span.kind === "model") {
      latestModelIndex = displaySpans.length;
      displaySpans.push(span);
      continue;
    }

    if (span.kind === "tool" && latestModelIndex !== -1) {
      const latestModel = displaySpans[latestModelIndex];
      if (latestModel.kind === "model") {
        displaySpans[latestModelIndex] = {
          ...latestModel,
          children: [...spanChildren(latestModel), span],
        } as ModelSpan;
        continue;
      }
    }

    displaySpans.push(span);
  }

  return displaySpans;
}

export function filterHistorySpans(spans: TraceSpan[]): TraceSpan[] {
  const hasNamedToolSibling = spans.some(
    (span) => span.kind === "tool" && !isRawProviderEchoToolSpan(span),
  );
  return spans.flatMap((span) => {
    if (isEmptyCompletedModelSpan(span)) return [];
    if (
      isRawTranscriptMessageSpan(span) ||
      (hasNamedToolSibling && isRawProviderEchoToolSpan(span))
    ) {
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
    const activeIds = new Set(
      activeActionsBeforeLatestModel.map((span) => span.id),
    );
    return [
      ...activeActionsBeforeLatestModel,
      ...(modelSpanHasDisplayContent(latestModel) ? [latestModel] : []),
      ...currentActionBatch.filter((span) => !activeIds.has(span.id)),
    ];
  }

  return activeActionsBeforeLatestModel.length > 0
    ? [...activeActionsBeforeLatestModel, latestModel]
    : [latestModel];
}
