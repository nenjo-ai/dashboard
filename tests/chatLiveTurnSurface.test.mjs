import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChatCancelControl,
  ChatLiveToolPreview,
} from "../components/chat/ChatLiveTurnSurface.ts";
import {
  shouldShowChatCancelControl,
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

function TraceStub({ trace }) {
  return createElement(
    "section",
    { "data-testid": "live-tool-preview" },
    trace.spans.map((span) => span.name).join(","),
  );
}

function Noop() {}

test("rendered live chat surface includes tool preview while trace is active", () => {
  const trace = runningToolTrace();
  const markup = renderToStaticMarkup(
    createElement(ChatLiveToolPreview, {
      trace: visibleLiveChatRunTrace(trace),
      TraceComponent: TraceStub,
    }),
  );

  assert.match(markup, /data-testid="live-tool-preview"/);
  assert.match(markup, /inspect_operations/);
});

test("rendered live chat surface removes cancel control after final completion", () => {
  const trace = completedTrace();
  const markup = renderToStaticMarkup(
    createElement(ChatCancelControl, {
      visible: shouldShowChatCancelControl({
        isTyping: true,
        activeRunTrace: trace,
      }),
      holdProgress: false,
      onHoldStart: Noop,
      onHoldEnd: Noop,
    }),
  );

  assert.equal(markup, "");
});
