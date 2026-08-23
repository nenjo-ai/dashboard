import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hookSource = await readFile(
  new URL("../lib/usePlannerChat.ts", import.meta.url),
  "utf8",
);
const areaSource = await readFile(
  new URL("../components/chat/ChatArea.tsx", import.meta.url),
  "utf8",
);
const plannerSource = await readFile(
  new URL("../components/project/PlannerChat.tsx", import.meta.url),
  "utf8",
);
const traceSource = await readFile(
  new URL("../components/agent-run-trace/AgentRunTrace.tsx", import.meta.url),
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
  assert.match(hookSource, /event\.event === "chat_stream_frame"/);
  assert.match(hookSource, /after_sequence: lastSequenceRef\.current/);
  assert.match(hookSource, /case "ChatRunSnapshot"/);
  assert.match(hookSource, /case "AssistantMessageFinalized"/);
});

test("live deltas are coalesced to animation frames without fake typing", () => {
  assert.match(hookSource, /window\.requestAnimationFrame/);
  assert.match(hookSource, /case "AssistantTextDelta"/);
  assert.doesNotMatch(
    areaSource,
    /useAnimatedStreamText|getNextStreamSliceLength/,
  );
  assert.match(areaSource, /message\.isLiveDraft/);
});

test("live assistant content renders markdown as stream frames arrive", () => {
  assert.match(
    areaSource,
    /message\.isLiveDraft[\s\S]*?<AssistantMarkdown content=\{assistantDisplayContent\}/,
  );
  assert.match(
    areaSource,
    /const AssistantMarkdown = memo[\s\S]*?<ReactMarkdown[\s\S]*?remarkPlugins=\{\[remarkGfm\]\}/,
  );
  assert.doesNotMatch(
    areaSource,
    /<p className="whitespace-pre-wrap">\{assistantDisplayContent\}<\/p>/,
  );
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
    "upsertLiveAssistantDraft([...previous, userMsg]",
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
    /upsertLiveAssistantDraft\(\[\.\.\.previous, userMsg\]/,
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
    /shouldShowChatHistoryLoader\(isLoadingHistory, messages\.length\)/,
  );
  assert.match(
    plannerSource,
    /shouldShowChatHistoryLoader\(isLoadingHistory, messages\.length\)/,
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
    /serializeMutation\(\(\) => deleteSnapshotIfOwned/,
  );
  assert.match(serviceWorkerSource, /let streamDbPromise/);
  assert.match(serviceWorkerSource, /serializeStreamMutation/);
});

test("durable activity persistence does not block visible stream work", () => {
  assert.match(
    hookSource,
    /shouldPersistChatActivityEvent\(lifecycleEvent\)[\s\S]*?envelopeWorkQueueRef\.current\.enqueue\(async \(\) => \{[\s\S]*?await appendEnvelopeEvent/,
  );
  assert.match(
    hookSource,
    /const lifecycleEventPromise = resolveLifecycleEventPayload/,
  );
  assert.match(hookSource, /await lifecycleEventPromise/);
});

test("one live assistant card owns response text and activity", () => {
  assert.match(hookSource, /upsertLiveAssistantDraft\(previous/);
  assert.match(
    hookSource,
    /const renderedMessages = useMemo\([\s\S]*?compactDuplicateChatMessages\(messages\)/,
  );
  assert.match(hookSource, /messages: renderedMessages/);
  assert.match(hookSource, /runTrace: activeRunTraceRef\.current/);
  assert.match(areaSource, /<AssistantActivity\s+message=\{message\}/);
  assert.match(plannerSource, /<AssistantActivity\s+message=\{message\}/);
  assert.doesNotMatch(areaSource, /ChatLiveToolPreview/);
  assert.doesNotMatch(
    plannerSource,
    /<AgentRunTrace trace=\{visibleRunTrace\}/,
  );
});

test("assistant activity has stable width and compact live spacing", () => {
  assert.match(areaSource, /w-full max-w-full md:w-\[75%\] md:max-w-\[75%\]/);
  assert.match(plannerSource, /w-\[75%\] max-w-\[75%\]/);
  assert.match(
    areaSource,
    /visibleLiveAssistantContent\(displayContent, message\.runTrace\)/,
  );
  assert.match(
    areaSource,
    /shouldShowChatRunStatusNotice\(message\.runStatus\)/,
  );
  assert.doesNotMatch(
    areaSource,
    /message\.runStatus && message\.runStatus !== "completed"/,
  );
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

test("final assistant usage is visible in the message footer", () => {
  assert.match(hookSource, /inputTokens: data\.total_input_tokens/);
  assert.match(hookSource, /outputTokens: data\.total_output_tokens/);
  assert.match(areaSource, /message\.inputTokens/);
  assert.match(areaSource, /message\.outputTokens/);
});

test("retry and terminal run states are visible inline", () => {
  assert.match(hookSource, /case "ProviderRetryScheduled"/);
  assert.match(hookSource, /case "RunFailed"/);
  assert.match(areaSource, /message\.errorMessage/);
  assert.match(areaSource, />\s*Retry\s*</);
});
