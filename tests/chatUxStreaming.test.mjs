import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  projectFailedChatRunMessage,
  projectTerminalChatTraceRun,
  upsertFailedChatRunMessage,
} from "../lib/chat/runFailure.ts";

const hookSource = await readFile(
  new URL("../lib/useChatController.ts", import.meta.url),
  "utf8",
);
const areaSource = await readFile(
  new URL("../components/chat/ChatArea.tsx", import.meta.url),
  "utf8",
);
const bubbleSource = await readFile(
  new URL("../components/chat/ChatMessageBubble.tsx", import.meta.url),
  "utf8",
);
const responseSource = await readFile(
  new URL("../components/chat/AssistantResponseContent.tsx", import.meta.url),
  "utf8",
);
const activitySource = await readFile(
  new URL("../components/chat/ChatActivityTimeline.tsx", import.meta.url),
  "utf8",
);
const assistantActivitySource = await readFile(
  new URL("../components/chat/AssistantActivity.tsx", import.meta.url),
  "utf8",
);
const errorSource = await readFile(
  new URL("../components/chat/ChatErrorState.tsx", import.meta.url),
  "utf8",
);
const progressSource = await readFile(
  new URL("../components/chat/ChatProgressIndicator.tsx", import.meta.url),
  "utf8",
);
const mobileComposerSource = await readFile(
  new URL("../components/chat/MobileInputBar.tsx", import.meta.url),
  "utf8",
);
const streamingSource = await readFile(
  new URL("../lib/chat/streaming.ts", import.meta.url),
  "utf8",
);
const traceSource = await readFile(
  new URL("../components/agent-run-trace/AgentRunTrace.tsx", import.meta.url),
  "utf8",
);
const traceStatusSource = await readFile(
  new URL(
    "../components/agent-run-trace/TraceStatusIndicator.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serviceWorkerSource = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const durabilitySource = await readFile(
  new URL("../lib/chatStreamDurability.ts", import.meta.url),
  "utf8",
);

test("chat consumes versioned frames and resumes by sequence", () => {
  assert.match(streamingSource, /event\.event === "chat_stream_frame"/);
  assert.match(hookSource, /getAfterSequence: \(\) => lastSequenceRef\.current/);
  assert.match(hookSource, /case "ChatRunSnapshot"/);
  assert.match(hookSource, /case "AssistantMessageFinalized"/);
});

test("an empty failed snapshot retains its retry identity without duplicating the user turn", () => {
  const inputMessage = {
    id: "input-1",
    role: "user",
    content: "try this",
    timestamp: "2026-08-31T12:00:00.000Z",
  };
  const failed = projectFailedChatRunMessage({
    runId: "run-1",
    fallbackResponseId: "fallback-response",
    inputMessageId: inputMessage.id,
    content: "",
    errorCode: "provider_timeout",
    errorMessage: "The provider timed out.",
    retryable: true,
    timestamp: "2026-08-31T12:00:01.000Z",
  });

  assert.equal(failed.id, "run-1");
  assert.equal(failed.runEnvelopeId, "run-1");
  assert.equal(failed.replyToMessageId, inputMessage.id);
  assert.equal(failed.runStatus, "failed");
  assert.equal(failed.retryable, true);
  assert.equal(failed.content, "");

  const inserted = upsertFailedChatRunMessage([inputMessage], failed);
  assert.equal(inserted.length, 2);
  assert.equal(inserted.filter((message) => message.role === "user").length, 1);

  const updated = upsertFailedChatRunMessage(inserted, {
    ...failed,
    errorMessage: "The provider is still unavailable.",
  });
  assert.equal(updated.length, 2);
  assert.equal(updated.filter((message) => message.id === failed.id).length, 1);
  assert.equal(
    updated.find((message) => message.id === failed.id)?.errorMessage,
    "The provider is still unavailable.",
  );
});

test("terminal trace summaries restore failed and cancelled activity across devices", () => {
  const failed = projectTerminalChatTraceRun({
    run_id: "failed-run",
    input_message_id: "input-1",
    status: "failed",
    error_code: "provider_timeout",
    error_message: "The provider timed out.",
    error_retryable: true,
    updated_at: "2026-09-08T12:00:00.000Z",
  });
  assert.equal(failed.id, "failed-run");
  assert.equal(failed.runEnvelopeId, "failed-run");
  assert.equal(failed.replyToMessageId, "input-1");
  assert.equal(failed.runStatus, "failed");
  assert.equal(failed.retryable, true);

  const cancelled = projectTerminalChatTraceRun({
    run_id: "cancelled-run",
    input_message_id: "input-2",
    status: "cancelled",
    error_code: null,
    error_message: null,
    error_retryable: false,
    updated_at: "2026-09-08T12:01:00.000Z",
  });
  assert.equal(cancelled.runEnvelopeId, "cancelled-run");
  assert.equal(cancelled.replyToMessageId, "input-2");
  assert.equal(cancelled.runStatus, "cancelled");
  assert.match(hookSource, /const terminalTraceRun = page\.trace_runs\?\.find/);
  assert.match(
    hookSource,
    /terminalStatus: terminalTraceRun\?\.status \?\? "completed"/,
  );
});

test("live deltas are coalesced to animation frames without fake typing", () => {
  assert.match(hookSource, /window\.requestAnimationFrame/);
  assert.match(hookSource, /case "AssistantTextDelta"/);
  assert.doesNotMatch(
    areaSource,
    /useAnimatedStreamText|getNextStreamSliceLength/,
  );
  assert.match(bubbleSource, /message\.isLiveDraft/);
});

test("live assistant content renders markdown as stream frames arrive", () => {
  assert.match(
    bubbleSource,
    /message\.isLiveDraft[\s\S]*?<AssistantResponseContent[\s\S]*?content=\{assistantContent\}/,
  );
  assert.match(
    responseSource,
    /AssistantResponseContent[\s\S]*?<ReactMarkdown[\s\S]*?remarkPlugins=\{\[remarkGfm\]\}/,
  );
  assert.doesNotMatch(
    bubbleSource,
    /<p className="whitespace-pre-wrap">\{assistantContent\}<\/p>/,
  );
  assert.match(bubbleSource, /streaming=\{isStreamingResponse\}/);
  assert.match(responseSource, /motion-reduce:animate-none/);
});

test("late animation frames cannot create an orphan assistant card", () => {
  const schedulerStart = hookSource.indexOf("const scheduleDraftRender");
  const schedulerEnd = hookSource.indexOf("useEffect", schedulerStart);
  const schedulerSource = hookSource.slice(schedulerStart, schedulerEnd);

  assert.ok(schedulerStart >= 0);
  assert.ok(schedulerEnd > schedulerStart);
  assert.match(schedulerSource, /scheduledResponseId = responseIdRef\.current/);
  assert.match(schedulerSource, /scheduledDraftBelongsToResponse/);
  assert.doesNotMatch(schedulerSource, /activeRunIdRef|generateId/);
  assert.match(
    hookSource,
    /const finishLiveTurn[\s\S]*?cancelDraftRender\(\)[\s\S]*?responseIdRef\.current = null/,
  );
});

test("chat shows optimistic progress before local preparation completes", () => {
  const optimisticTrace = hookSource.indexOf("const optimisticTrace: RunTrace");
  const optimisticCard = hookSource.indexOf(
    "upsertLiveAssistantDraft(",
    optimisticTrace,
  );
  const keyLoad = hookSource.indexOf(
    "await loadStoredAccountContentKey()",
    optimisticTrace,
  );
  assert.ok(optimisticTrace >= 0);
  assert.ok(optimisticCard > optimisticTrace);
  assert.ok(optimisticCard < keyLoad);
  assert.ok(keyLoad > optimisticTrace);
  assert.match(hookSource, /phase: "queued"/);
  assert.match(hookSource, /setActiveRunTrace\(optimisticTrace\)/);
  assert.match(
    hookSource,
    /upsertLiveAssistantDraft\([\s\S]*?: \[\.\.\.previous, userMsg\]/,
  );
});

test("a late history fetch preserves an optimistic first turn", () => {
  const historyStart = hookSource.indexOf(
    "const fetchId = ++historyFetchIdRef.current",
  );
  const historyEnd = hookSource.indexOf(
    "if (!activeSessionId || isLoadingHistory) return;",
    historyStart,
  );
  const historySource = hookSource.slice(historyStart, historyEnd);

  assert.ok(historyStart >= 0);
  assert.ok(historyEnd > historyStart);
  assert.match(
    historySource,
    /setMessages\(\(current\) =>\s*mergeLoadedMessages\(loadedWithEnvelopes, current\)/,
  );
  assert.doesNotMatch(historySource, /setMessages\(\[\]\)/);
  assert.match(
    areaSource,
    /shouldShowChatHistoryLoader\(isLoadingHistory, displayMessages\.length\)/,
  );
});

test("snapshot clears are scoped to the response that created them", () => {
  assert.match(
    hookSource,
    /clearSnapshotAppliesToResponse\(\s*snapshot\.responseId,\s*responseIdRef\.current/,
  );
  assert.match(hookSource, /clear: true,\s*responseId:/);
  assert.match(
    serviceWorkerSource,
    /existing\.responseId !== snapshot\.responseId/,
  );
});

test("snapshot persistence reuses IndexedDB and orders terminal clears", () => {
  assert.match(durabilitySource, /let databasePromise:/);
  assert.match(durabilitySource, /let mutationTail = Promise\.resolve\(\)/);
  assert.match(
    durabilitySource,
    /serializeMutation\(\(\) =>\s*clearSnapshotIfOwned/,
  );
  assert.match(durabilitySource, /store\.put\(terminalSnapshot\)/);
  assert.match(serviceWorkerSource, /let streamDbPromise/);
  assert.match(serviceWorkerSource, /serializeStreamMutation/);
});

test("shared trace archiving does not block visible stream work", () => {
  assert.doesNotMatch(hookSource, /appendEnvelopeEvent/);
  assert.match(assistantActivitySource, /useChatTraceEvents\(remoteRunId\)/);
  assert.match(
    hookSource,
    /const lifecycleEventPromise = resolveLifecycleEventPayload/,
  );
  assert.match(hookSource, /await lifecycleEventPromise/);
});

test("historical activity can recover from a transient remote trace failure", () => {
  assert.doesNotMatch(
    assistantActivitySource,
    /loadedEnvelope\?\.envelopeId === message\.runEnvelopeId\) return/,
  );
  assert.match(assistantActivitySource, /retryRemoteTrace\(\)\.catch/);
  assert.match(assistantActivitySource, /traceTruncated/);
});

test("one live assistant card owns response text and activity", () => {
  assert.match(hookSource, /upsertLiveAssistantDraft\(previous/);
  assert.match(
    hookSource,
    /const renderedMessages = useMemo\([\s\S]*?compactDuplicateChatMessages\(messages\)/,
  );
  assert.match(hookSource, /messages: renderedMessages/);
  assert.match(hookSource, /runTrace: activeRunTraceRef\.current/);
  assert.match(activitySource, /<AssistantActivity[\s\S]*?message=\{message\}/);
  assert.doesNotMatch(areaSource, /ChatLiveToolPreview/);
});

test("only the reducer-owned response can render a thinking animation", () => {
  assert.match(areaSource, /livePhaseForChatMessage\(msg, lifecycle\)/);
  assert.match(bubbleSource, /isLiveResponse && !isStreamingResponse/);
  assert.doesNotMatch(
    areaSource,
    /livePhase=\{msg\.isLiveDraft \? lifecycle\.phase : undefined\}/,
  );
});

test("every model invocation restores the animated thinking state", () => {
  assert.match(
    hookSource,
    /case "ModelRequestStarted":[\s\S]*?dispatchLiveTurn\(\{ type: "model_invoked" \}\)/,
  );
  assert.match(
    bubbleSource,
    /isLiveResponse && livePhase === "streaming" && hasAssistantContent/,
  );
  assert.match(
    bubbleSource,
    /<AssistantResponseContent[\s\S]*?\{isLiveResponse && !isStreamingResponse \? \([\s\S]*?<ChatProgressIndicator/,
  );
  assert.match(progressSource, /thinking: "Thinking"/);
  assert.match(progressSource, /return <AnimatedDots \/>/);
});

test("assistant activity has stable width and compact live spacing", () => {
  assert.match(bubbleSource, /md:max-w-\[44rem\]/);
  assert.match(
    bubbleSource,
    /visibleLiveAssistantContent\(displayContent, message\.runTrace\)/,
  );
  assert.doesNotMatch(
    bubbleSource,
    /message\.runStatus && message\.runStatus !== "completed"/,
  );
});

test("assistant activity is collapsed by default and remains user-toggleable", () => {
  assert.match(
    assistantActivitySource,
    /const \[activityOpen, setActivityOpen\] = useState\(false\)/,
  );
  assert.match(assistantActivitySource, /setActivityOpen\(\(open\) => !open\)/);
  assert.match(assistantActivitySource, /aria-expanded=\{activityOpen\}/);
  assert.match(assistantActivitySource, /aria-controls=\{activityPanelId\}/);
  assert.match(assistantActivitySource, /traceActivitySummary/);
  assert.match(assistantActivitySource, /storedTraceActivitySummary/);
  assert.match(assistantActivitySource, /hasMeaningfulChatActivity/);
  assert.match(assistantActivitySource, /scrollIntoView/);
  assert.match(assistantActivitySource, /prefers-reduced-motion: reduce/);
});

test("completed tool batches collapse into readable progressive disclosure", () => {
  assert.match(traceSource, /function ToolBatchTraceBlock/);
  assert.match(traceSource, /toolBatchLabel\(tools\)/);
  assert.match(
    traceSource,
    /defaultExpanded = status === "running" \|\| status === "queued"/,
  );
  assert.match(traceSource, /technical details for \$\{span\.name\}/);
  assert.doesNotMatch(
    traceSource,
    />\{detailsOpen \? "Hide" : "Details"\}<\/button>/,
  );
});

test("history appears immediately while new turns keep restrained entry motion", () => {
  assert.match(
    areaSource,
    /const shouldAnimateEntry = !reduceMotion && !isBulkLoad/,
  );
  assert.match(
    areaSource,
    /shouldAnimateEntry \? \{ opacity: 0, y: 8 \} : false/,
  );
  assert.doesNotMatch(areaSource, /staggerDelay/);
});

test("jump to latest is available on desktop and mobile", () => {
  assert.match(areaSource, /\{showScrollToLatest \? \(/);
  assert.match(areaSource, /aria-label="Jump to latest message"/);
  assert.doesNotMatch(areaSource, /isMobile && showScrollToLatest/);
});

test("tool narration is owned by activity above its tool batch", () => {
  assert.match(
    hookSource,
    /withLiveChatActivityPreview\(\s*lifecycleEvent,\s*draftContentRef\.current,\s*activeRunTraceRef\.current/,
  );
  assert.match(
    traceSource,
    /const toolTextPreviews = toolBatchTextPreviews\(children\)/,
  );
  assert.ok(
    traceSource.indexOf("toolTextPreviews.map") <
      traceSource.indexOf(
        "children.length > 0",
        traceSource.indexOf("function ModelTraceBlock"),
      ),
  );
});

test("terminal lifecycle state replaces stale running activity", () => {
  assert.match(
    hookSource,
    /runTrace: preferredChatRunTrace\(\s*previous\[index\]\?\.runTrace,\s*trace/,
  );
  assert.match(hookSource, /pendingTarget && isTerminalChatRunTrace\(next\)/);
});

test("local cancellation settles the rendered assistant draft and trace", () => {
  assert.match(
    hookSource,
    /const finishLocalCancel[\s\S]*?RunCancelled[\s\S]*?runStatus: "cancelled"[\s\S]*?isLiveDraft: false[\s\S]*?suppressActiveRunTraceRef\.current = true/,
  );
});

test("final assistant usage is visible in the message footer", () => {
  assert.match(hookSource, /inputTokens: data\.total_input_tokens/);
  assert.match(hookSource, /outputTokens: data\.total_output_tokens/);
  assert.match(bubbleSource, /message\.inputTokens/);
  assert.match(bubbleSource, /message\.outputTokens/);
});

test("retry and terminal run states are visible inline", () => {
  assert.match(hookSource, /case "ProviderRetryScheduled"/);
  assert.match(hookSource, /case "ProgressUpdate"/);
  assert.match(hookSource, /waiting_for_model_capacity/);
  assert.match(hookSource, /case "RunFailed"/);
  assert.match(errorSource, /message\.errorMessage/);
  assert.match(errorSource, /retrying \? "Retrying…" : "Retry"/);
  assert.match(errorSource, /"Action required"/);
});

test("chat progress uses calm reduced-motion indicators without legacy spinners", () => {
  assert.match(progressSource, /motion-reduce:animate-none/);
  assert.match(progressSource, /aria-live="polite"/);
  for (const source of [
    areaSource,
    bubbleSource,
    progressSource,
    mobileComposerSource,
    traceSource,
    traceStatusSource,
  ]) {
    assert.doesNotMatch(source, /animate-spin|Loader2/);
  }
});
