import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { reduceChatSessionIndicators } from "../lib/chat/sessionIndicators.ts";

function activeSnapshot(overrides = {}) {
  return {
    sessionId: "session-1",
    requestId: "request-1",
    responseId: "response-1",
    content: "",
    status: "connecting",
    updatedAt: 10,
    ...overrides,
  };
}

test("an active stream marks its session as running", () => {
  const state = reduceChatSessionIndicators({}, activeSnapshot());

  assert.deepEqual(state["session-1"], {
    status: "running",
    responseId: "response-1",
    updatedAt: 10,
  });
});

test("terminal cleanup marks a running session complete", () => {
  const running = reduceChatSessionIndicators({}, activeSnapshot());
  const completed = reduceChatSessionIndicators(running, {
    sessionId: "session-1",
    clear: true,
    responseId: "response-1",
    terminalStatus: "completed",
    updatedAt: 20,
  });

  assert.equal(completed["session-1"].status, "completed");
});

test("late active frames cannot revive a completed response", () => {
  const completed = reduceChatSessionIndicators(
    {},
    {
      sessionId: "session-1",
      clear: true,
      responseId: "response-1",
      terminalStatus: "completed",
      updatedAt: 20,
    },
  );
  const late = reduceChatSessionIndicators(
    completed,
    activeSnapshot({ status: "generating", updatedAt: 30 }),
  );

  assert.strictEqual(late, completed);
});

test("a new response can restart a completed session", () => {
  const completed = reduceChatSessionIndicators(
    {},
    {
      sessionId: "session-1",
      clear: true,
      responseId: "response-1",
      terminalStatus: "completed",
      updatedAt: 20,
    },
  );
  const restarted = reduceChatSessionIndicators(
    completed,
    activeSnapshot({
      requestId: "request-2",
      responseId: "response-2",
      updatedAt: 30,
    }),
  );

  assert.equal(restarted["session-1"].status, "running");
  assert.equal(restarted["session-1"].responseId, "response-2");
});

test("stale terminal events from an older response do not replace a new run", () => {
  const running = reduceChatSessionIndicators(
    {},
    activeSnapshot({
      requestId: "request-2",
      responseId: "response-2",
      updatedAt: 30,
    }),
  );
  const stale = reduceChatSessionIndicators(running, {
    sessionId: "session-1",
    clear: true,
    responseId: "response-1",
    terminalStatus: "completed",
    updatedAt: 20,
  });

  assert.strictEqual(stale, running);
});

test("neutral cleanup only removes the response it owns", () => {
  const running = reduceChatSessionIndicators({}, activeSnapshot());
  const unrelated = reduceChatSessionIndicators(running, {
    sessionId: "session-1",
    clear: true,
    responseId: "response-2",
    updatedAt: 20,
  });
  const cleared = reduceChatSessionIndicators(unrelated, {
    sessionId: "session-1",
    clear: true,
    responseId: "response-1",
    updatedAt: 30,
  });

  assert.strictEqual(unrelated, running);
  assert.equal(cleared["session-1"], undefined);
});

test("sidebar indicators are accessible and respect reduced motion", () => {
  const source = readFileSync(
    new URL("../components/chat/SessionStatusIndicator.tsx", import.meta.url),
    "utf8",
  );
  const listSource = readFileSync(
    new URL("../components/chat/GlobalSessionList.tsx", import.meta.url),
    "utf8",
  );
  const durabilitySource = readFileSync(
    new URL("../lib/chatStreamDurability.ts", import.meta.url),
    "utf8",
  );
  const hookSource = readFileSync(
    new URL("../lib/useChatSessionIndicators.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /aria-label="Session running"/);
  assert.match(source, /motion-safe:animate-pulse/);
  assert.match(source, /motion-reduce:animate-none/);
  assert.match(source, /Session complete/);
  assert.match(listSource, /SessionStatusIndicator/);
  assert.match(listSource, /sessionIndicators\[session\.id\]/);
  assert.match(durabilitySource, /window\.dispatchEvent/);
  assert.match(hookSource, /CHAT_STREAM_SNAPSHOT_EVENT/);
});

test("terminal markers survive a session-list remount without becoming resumable streams", () => {
  const source = readFileSync(
    new URL("../lib/chatStreamDurability.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /store\.put\(terminalSnapshot\)/);
  assert.match(
    source,
    /if \(!stored \|\| "clear" in stored\) return undefined/,
  );
  assert.match(source, /ChatStreamStoredSnapshot\[\]/);
});
