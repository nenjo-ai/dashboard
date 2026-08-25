"use client";

import { createElement } from "react";

export function ChatCancelControl({
  visible,
  holdProgress,
  onCancel,
  onHoldStart,
  onHoldEnd,
}: {
  visible: boolean;
  holdProgress: boolean;
  onCancel: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  if (!visible) return null;

  return createElement(
    "button",
    {
      type: "button",
      onClick: onCancel,
      onMouseDown: onHoldStart,
      onMouseUp: onHoldEnd,
      onMouseLeave: onHoldEnd,
      onTouchStart: onHoldStart,
      onTouchEnd: onHoldEnd,
      className:
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-flag-red-200/70 bg-flag-red-50 text-flag-red-600 transition-colors hover:border-flag-red-300 hover:bg-flag-red-100 dark:border-flag-red-700/35 dark:bg-flag-red-900/25 dark:text-flag-red-300 dark:hover:bg-flag-red-900/40",
      title: "Stop response",
      "aria-label": "Stop response",
    },
    createElement(
      "svg",
      {
        className: "h-3.5 w-3.5",
        viewBox: "0 0 24 24",
        fill: "currentColor",
        "aria-hidden": "true",
      },
      createElement("rect", {
        x: "6",
        y: "6",
        width: "12",
        height: "12",
        rx: "2",
      }),
    ),
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
