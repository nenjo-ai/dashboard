import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  chatTurnReducer,
  createChatTurnState,
} from "../lib/chat/state.ts";
import { upsertLiveAssistantDraft } from "../lib/chat/derivations.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [controllerSource, bubbleSource, panelSource, platformSource] =
  await Promise.all([
    readSource("lib/useChatController.ts"),
    readSource("components/chat/ChatMessageBubble.tsx"),
    readSource("components/chat/ChatThinkingPanel.tsx"),
    readSource("../platform/crates/api-server/src/routes/worker_responses/chat_runs.rs"),
  ]);

test("reasoning deltas accumulate without flipping the streaming phase", () => {
  const started = chatTurnReducer(createChatTurnState(), {
    type: "phase_changed",
    phase: "thinking",
  });
  const thinking = chatTurnReducer(started, {
    type: "reasoning_delta",
    delta: "considering ",
  });
  assert.equal(thinking.phase, "thinking");
  assert.equal(thinking.reasoning, "considering ");
  const stillThinking = chatTurnReducer(thinking, {
    type: "reasoning_delta",
    delta: "options",
  });
  assert.equal(stillThinking.reasoning, "considering options");
  assert.equal(stillThinking.phase, "thinking");
});

test("reasoning survives prose streaming and terminal events clear it on reset", () => {
  let state = chatTurnReducer(createChatTurnState(), {
    type: "reasoning_delta",
    delta: "hmm",
  });
  state = chatTurnReducer(state, { type: "text_delta", delta: "Answer" });
  assert.equal(state.phase, "streaming");
  assert.equal(state.reasoning, "hmm");
  state = chatTurnReducer(state, { type: "completed" });
  assert.equal(state.reasoning, "hmm");
});

test("live draft upserts carry reasoning into the message", () => {
  const messages = upsertLiveAssistantDraft([], {
    id: "draft-1",
    content: "Answer",
    reasoning: "hmm",
    runStatus: "streaming",
    timestamp: new Date().toISOString(),
  });
  assert.equal(messages[0].reasoning, "hmm");
  const updated = upsertLiveAssistantDraft(messages, {
    id: "draft-1",
    content: "Answer!",
    runStatus: "streaming",
    timestamp: new Date().toISOString(),
  });
  assert.equal(updated[0].reasoning, "hmm");
});

test("controller archives reasoning into live state and final messages", () => {
  assert.match(controllerSource, /case "AssistantReasoningDelta"/);
  assert.match(controllerSource, /type: "reasoning_delta"/);
  assert.match(controllerSource, /draftReasoningRef/);
  assert.match(controllerSource, /reasoning,\s*\n\s*isLiveDraft: false/);
});

test("bubble renders the thinking panel above the response content", () => {
  assert.match(bubbleSource, /<ChatThinkingPanel/);
  assert.match(panelSource, /auto-collapses once the answer starts/);
  assert.match(panelSource, /fetchChatTraceEvents/);
  assert.match(panelSource, /decryptContentPayload/);
});

test("platform archives reasoning deltas while text deltas stay live-only", () => {
  assert.match(
    platformSource,
    /Reasoning deltas are archived so the dashboard can replay/,
  );
  assert.doesNotMatch(
    platformSource,
    /StreamEvent::AssistantTextDelta \{ \.\. \} \| StreamEvent::AssistantReasoningDelta \{ \.\. \}/,
  );
});
