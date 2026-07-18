import assert from "node:assert/strict";
import test from "node:test";

import {
  describeTaskRecurrence,
  scheduleDateTimeParts,
  weekdayForDate,
} from "../lib/taskRecurrence.ts";

test("schedule form fields are rendered in the schedule timezone", () => {
  assert.deepEqual(scheduleDateTimeParts("2026-03-09T14:00:00Z", "America/Chicago"), {
    date: "2026-03-09",
    time: "09:00",
  });
});

test("weekly recurrence descriptions read like calendar events", () => {
  assert.equal(
    describeTaskRecurrence({
      frequency: "weekly",
      interval: 2,
      weekdays: ["monday", "thursday"],
    }),
    "Every 2 weeks on Monday, Thursday",
  );
  assert.equal(weekdayForDate("2026-03-09"), "monday");
});
