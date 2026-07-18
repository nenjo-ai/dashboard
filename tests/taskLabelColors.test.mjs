import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TASK_LABEL_COLOR,
  TASK_LABEL_COLORS,
} from "../lib/task-label-colors.ts";

test("task labels use a fixed named palette with unique valid colors", () => {
  assert.equal(DEFAULT_TASK_LABEL_COLOR, TASK_LABEL_COLORS[0].value);
  assert.ok(TASK_LABEL_COLORS.length >= 8);
  assert.equal(
    new Set(TASK_LABEL_COLORS.map(({ name }) => name)).size,
    TASK_LABEL_COLORS.length,
  );
  assert.equal(
    new Set(TASK_LABEL_COLORS.map(({ value }) => value)).size,
    TASK_LABEL_COLORS.length,
  );
  for (const color of TASK_LABEL_COLORS) {
    assert.match(color.value, /^#[0-9A-F]{6}$/);
  }
});
