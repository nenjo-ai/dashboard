"use client";

import { Check, CircleAlert, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChatSessionIndicatorStatus } from "@/lib/chat/sessionIndicators";

export function SessionStatusIndicator({
  status,
  selected = false,
}: {
  status?: ChatSessionIndicatorStatus;
  selected?: boolean;
}) {
  if (!status) return null;

  if (status === "running") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] font-semibold",
          selected
            ? "text-white"
            : "text-deep-space-blue-600 dark:text-deep-space-blue-300",
        )}
        role="status"
        aria-label="Session running"
        title="Session running"
      >
        <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden="true">
          <span className="absolute h-2 w-2 rounded-full bg-current opacity-30 motion-safe:animate-pulse motion-reduce:animate-none" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-current" />
        </span>
        Running
      </span>
    );
  }

  const label =
    status === "completed"
      ? "Session complete"
      : status === "failed"
        ? "Session needs attention"
        : "Session stopped";

  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full",
        selected
          ? "bg-white/15 text-white"
          : status === "completed"
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : status === "failed"
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
              : "bg-gray-500/10 text-gray-500 dark:text-gray-300",
      )}
      aria-label={label}
      title={label}
    >
      {status === "completed" ? (
        <Check className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
      ) : status === "failed" ? (
        <CircleAlert className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
      ) : (
        <Square className="h-2 w-2" strokeWidth={2} aria-hidden="true" />
      )}
    </span>
  );
}
