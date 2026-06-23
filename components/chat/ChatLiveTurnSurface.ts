"use client";

import { createElement, type ReactElement } from "react";
import type { RunTrace } from "@/lib/agentRunTrace/types";
import type { AgentDefinition } from "@/lib/types";

export function ChatLiveToolPreview({
  trace,
  TraceComponent,
  activeAgent,
  mobile,
}: {
  trace?: RunTrace;
  TraceComponent: (props: {
    trace: RunTrace;
    activeAgent?: AgentDefinition;
    mobile?: boolean;
  }) => ReactElement | null;
  activeAgent?: AgentDefinition;
  mobile?: boolean;
}) {
  if (!trace) return null;

  return createElement(TraceComponent, {
    trace,
    activeAgent,
    mobile,
  });
}

export function ChatCancelControl({
  visible,
  holdProgress,
  onHoldStart,
  onHoldEnd,
}: {
  visible: boolean;
  holdProgress: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  if (!visible) return null;

  return createElement(
    "button",
    {
      type: "button",
      onMouseDown: onHoldStart,
      onMouseUp: onHoldEnd,
      onMouseLeave: onHoldEnd,
      onTouchStart: onHoldStart,
      onTouchEnd: onHoldEnd,
      className:
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flag-red-100 hover:bg-flag-red-200 text-flag-red-600 dark:bg-flag-red-900/40 dark:hover:bg-flag-red-800/50 dark:text-flag-red-400 transition-colors",
      title: "Hold for 1 second to cancel",
      "aria-label": "Cancel response",
    },
    createElement(
      "svg",
      {
        className: "h-4 w-4",
        viewBox: "0 0 24 24",
        fill: "currentColor",
        "aria-hidden": "true",
      },
      createElement("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }),
    ),
    !holdProgress
      ? createElement("span", {
          className:
            "absolute inset-0 rounded-lg border-2 border-flag-red-400 dark:border-flag-red-500 animate-cancel-pulse",
        })
      : null,
    holdProgress
      ? createElement(
          "svg",
          {
            className: "absolute inset-0 -rotate-90",
            viewBox: "0 0 40 40",
            "aria-hidden": "true",
          },
          createElement("circle", {
            cx: "20",
            cy: "20",
            r: "16",
            fill: "none",
            className: "stroke-flag-red-500 dark:stroke-flag-red-400",
            strokeWidth: "3",
            strokeDasharray: "100",
            strokeDashoffset: "100",
            strokeLinecap: "round",
            style: { animation: "hold-arc 1s linear forwards" },
          }),
        )
      : null,
  );
}

export function chatLiveTurnSpacerClass(hasActiveRunTrace: boolean, mobile: boolean): string {
  return `shrink-0 ${hasActiveRunTrace ? (mobile ? "h-20" : "h-16") : "h-1"}`;
}
