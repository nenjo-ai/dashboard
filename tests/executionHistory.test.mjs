import assert from "node:assert/strict";
import test from "node:test";

import {
  executionHistoryLabel,
  formatExecutionRelativeTime,
} from "../lib/executionHistory.ts";

function execution(overrides = {}) {
  return {
    id: "12345678-1234-1234-1234-123456789abc",
    task_title: null,
    routine_name: null,
    ...overrides,
  };
}

test("task activity labels prefer the dispatched task over its routine", () => {
  assert.equal(
    executionHistoryLabel(execution({ task_title: "Publish release notes", routine_name: "Release" })),
    "Publish release notes",
  );
});

test("task activity labels retain useful fallbacks for historical runs", () => {
  assert.equal(executionHistoryLabel(execution({ routine_name: "Release" })), "Release");
  assert.equal(executionHistoryLabel(execution()), "Run 12345678");
});

test("execution timestamps are compact and deterministic against a supplied clock", () => {
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  assert.equal(formatExecutionRelativeTime(new Date(now - 30_000).toISOString(), now), "just now");
  assert.equal(formatExecutionRelativeTime(new Date(now - 10 * 60_000).toISOString(), now), "10m ago");
  assert.equal(formatExecutionRelativeTime(new Date(now - 3 * 60 * 60_000).toISOString(), now), "3h ago");
  assert.equal(formatExecutionRelativeTime(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now), "2d ago");
});
