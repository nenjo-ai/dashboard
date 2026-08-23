import assert from "node:assert/strict";
import test from "node:test";

import {
  chatLifecycle,
  chatTurnReducer,
  createChatTurnState,
} from "../lib/chat/state.ts";
import { activeChatPhaseForRunStatus } from "../lib/chat/types.ts";

function reduce(events) {
  return events.reduce(chatTurnReducer, createChatTurnState());
}

test("prompt submission owns one response before the first stream event", () => {
  const state = chatTurnReducer(createChatTurnState(), {
    type: "prompt_submitted",
    requestId: "prompt-1",
    responseId: "response-1",
  });

  assert.equal(state.phase, "connecting");
  assert.equal(state.requestId, "prompt-1");
  assert.equal(state.responseId, "response-1");
  assert.equal(state.content, "");
  assert.equal(chatLifecycle(state).isActive, true);
  assert.equal(chatLifecycle(state).responseId, "response-1");
});

test("generating switches from thinking to streaming once content exists", () => {
  assert.equal(activeChatPhaseForRunStatus("generating", false), "thinking");
  assert.equal(activeChatPhaseForRunStatus("generating", true), "streaming");
  assert.equal(activeChatPhaseForRunStatus("using_tool", true), "using_tool");
});

test("connecting to thinking to streaming to completed is deterministic", () => {
  const state = reduce([
    {
      type: "prompt_submitted",
      requestId: "prompt-1",
      responseId: "response-1",
    },
    { type: "phase_changed", phase: "thinking" },
    { type: "text_delta", delta: "## Live" },
    { type: "text_delta", delta: " markdown" },
    { type: "phase_changed", phase: "finalizing" },
    { type: "completed" },
  ]);

  assert.equal(state.phase, "completed");
  assert.equal(state.content, "## Live markdown");
  assert.deepEqual(chatLifecycle(state), {
    phase: "completed",
    isActive: false,
    isTyping: false,
    statusText: undefined,
  });
});

test("tool calls are upserted without duplicate cards and return to thinking", () => {
  const running = {
    callId: "tool-1",
    name: "web_search",
    args: "query=nenjo",
    status: "running",
    children: [],
  };
  const state = reduce([
    {
      type: "prompt_submitted",
      requestId: "prompt-1",
      responseId: "response-1",
    },
    { type: "tool_upserted", tool: running },
    {
      type: "tool_upserted",
      tool: { ...running, status: "running", textPreview: "Searching" },
    },
    {
      type: "tool_upserted",
      tool: { ...running, status: "completed", outputPreview: "Found it" },
    },
  ]);

  assert.equal(state.phase, "thinking");
  assert.equal(state.activeTools.length, 1);
  assert.equal(state.activeTools[0].status, "completed");
  assert.equal(state.activeTools[0].textPreview, "Searching");
  assert.equal(state.activeTools[0].outputPreview, "Found it");
});

test("cancelled and failed turns clean active indicators immediately", () => {
  for (const terminalEvent of [
    { type: "cancelled" },
    {
      type: "failed",
      error: { code: "offline", message: "Connection lost", retryable: true },
    },
  ]) {
    const state = reduce([
      {
        type: "prompt_submitted",
        requestId: "prompt-1",
        responseId: "response-1",
      },
      {
        type: "tool_upserted",
        tool: {
          callId: "tool-1",
          name: "search",
          args: "",
          status: "running",
          children: [],
        },
      },
      { type: "preview_replaced", preview: "Working" },
      terminalEvent,
    ]);

    assert.equal(chatLifecycle(state).isActive, false);
    assert.deepEqual(state.activeTools, []);
    assert.equal(state.activityPreview, undefined);
  }
});

test("late and duplicated terminal events cannot revive or rewrite a turn", () => {
  const completed = reduce([
    {
      type: "prompt_submitted",
      requestId: "prompt-1",
      responseId: "response-1",
    },
    { type: "text_delta", delta: "Final" },
    { type: "completed" },
  ]);
  const duplicate = chatTurnReducer(completed, { type: "completed" });
  const lateFailure = chatTurnReducer(duplicate, {
    type: "failed",
    error: { message: "late" },
  });
  const lateDelta = chatTurnReducer(lateFailure, {
    type: "text_delta",
    delta: " stale",
  });

  assert.strictEqual(duplicate, completed);
  assert.strictEqual(lateFailure, completed);
  assert.strictEqual(lateDelta, completed);
  assert.equal(lateDelta.content, "Final");
});
