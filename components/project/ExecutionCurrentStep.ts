"use client";

import { createElement } from "react";
import type { CurrentExecutionStepDisplay } from "@/lib/routineStepEvents";

export function ExecutionCurrentStepBadge({
  step,
}: {
  step: CurrentExecutionStepDisplay | null;
}) {
  if (!step) return null;

  const label = step.agent_name
    ? `${step.step_name} · ${step.agent_name}`
    : step.step_name;

  return createElement(
    "span",
    {
      className:
        "inline-flex min-w-0 max-w-[20rem] shrink items-center gap-1 rounded-md border border-yellow-500/25 bg-yellow-500/10 px-2 py-1 text-[11px] font-medium text-yellow-700 dark:text-yellow-300",
      title: `Current step: ${label}`,
    },
    createElement(
      "span",
      {
        className: "h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500 animate-pulse",
        "aria-hidden": "true",
      },
    ),
    createElement("span", { className: "shrink-0 opacity-80" }, "Current step"),
    createElement("span", { className: "truncate" }, label),
    step.step_type
      ? createElement(
          "span",
          {
            className:
              "ml-1 shrink-0 rounded-sm bg-yellow-500/15 px-1 py-0.5 text-[10px] uppercase",
          },
          step.step_type,
        )
      : null,
  );
}
