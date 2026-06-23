import assert from "node:assert/strict";
import test from "node:test";

import {
  retainedLiveChatRunTrace,
  shouldShowChatCancelControl,
  shouldShowLiveToolPreview,
  visibleLiveChatRunTrace,
} from "../lib/chatInterfaceState.ts";

function runningToolTrace() {
  return {
    id: "run-1",
    sessionId: "session-1",
    source: "chat",
    phase: "executing_tools",
    startedAt: "2026-01-01T00:00:00.000Z",
    spans: [
      {
        kind: "tool",
        id: "tool-1",
        status: "running",
        name: "inspect_operations",
        startedAt: "2026-01-01T00:00:01.000Z",
      },
    ],
  };
}

function completedTrace() {
  return {
    ...runningToolTrace(),
    phase: "completed",
    completedAt: "2026-01-01T00:00:02.000Z",
    spans: [
      {
        ...runningToolTrace().spans[0],
        status: "completed",
        completedAt: "2026-01-01T00:00:02.000Z",
      },
    ],
  };
}

test("chat interface shows live tool preview while a tool trace is active", () => {
  const trace = runningToolTrace();

  assert.equal(visibleLiveChatRunTrace(trace), trace);
  assert.equal(shouldShowLiveToolPreview(trace), true);
  assert.equal(
    shouldShowChatCancelControl({ isTyping: false, activeRunTrace: trace }),
    true,
  );
});

test("chat interface hides live preview and cancel control after terminal completion", () => {
  const trace = completedTrace();

  assert.equal(visibleLiveChatRunTrace(trace), undefined);
  assert.equal(shouldShowLiveToolPreview(trace), false);
  assert.equal(
    shouldShowChatCancelControl({ isTyping: false, activeRunTrace: trace }),
    false,
  );
});

test("terminal run trace suppresses stale typing cancel control", () => {
  assert.equal(
    shouldShowChatCancelControl({
      isTyping: true,
      activeRunTrace: completedTrace(),
    }),
    false,
  );
});

test("chat interface still shows cancel while awaiting first stream event", () => {
  assert.equal(
    shouldShowChatCancelControl({
      isTyping: true,
      activeRunTrace: undefined,
    }),
    true,
  );
});

test("suppressed or finalized traces are not retained as live work", () => {
  const trace = runningToolTrace();

  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: true,
      finalized: false,
    }),
    undefined,
  );
  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: false,
      finalized: true,
    }),
    undefined,
  );
  assert.equal(
    retainedLiveChatRunTrace({
      trace,
      suppressed: false,
      finalized: false,
    }),
    trace,
  );
});
