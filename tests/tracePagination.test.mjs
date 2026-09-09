import assert from "node:assert/strict";
import test from "node:test";

import { collectTraceEventPages } from "../lib/tracePagination.ts";

test("trace pagination follows every cursor and carries truncation state", async () => {
  const cursors = [];
  const result = await collectTraceEventPages(async (after, limit) => {
    cursors.push([after, limit]);
    if (after === 0) {
      return {
        events: [{ sequence: 1 }, { sequence: 2 }],
        truncated: false,
        has_more: true,
        next_after: 2,
      };
    }
    return {
      events: [{ sequence: 3 }],
      truncated: true,
      has_more: false,
      next_after: null,
    };
  });

  assert.deepEqual(cursors, [
    [0, 500],
    [2, 500],
  ]);
  assert.deepEqual(
    result.events.map((event) => event.sequence),
    [1, 2, 3],
  );
  assert.equal(result.truncated, true);
  assert.equal(result.has_more, false);
});

test("trace pagination rejects a non-advancing server cursor", async () => {
  await assert.rejects(
    collectTraceEventPages(async () => ({
      events: [],
      truncated: false,
      has_more: true,
      next_after: 0,
    })),
    /did not advance/,
  );
});
