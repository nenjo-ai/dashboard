"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

export function ChatErrorState({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: (messageId: string) => void | Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  if (message.runStatus !== "failed" && message.runStatus !== "cancelled") {
    return null;
  }
  return (
    <div
      className={cn(
        "not-prose rounded-lg px-3 py-2 text-xs",
        message.runStatus === "failed"
          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      )}
      role={message.runStatus === "failed" ? "alert" : "status"}
    >
      <span className="font-medium">
        {message.runStatus === "cancelled"
          ? "Cancelled"
          : message.retryable
            ? "Temporary failure"
            : "Action required"}
      </span>
      {message.errorMessage ? ` — ${message.errorMessage}` : null}
      {message.retryable && onRetry ? (
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            if (retrying) return;
            setRetrying(true);
            void Promise.resolve(onRetry(message.id)).finally(() =>
              setRetrying(false),
            );
          }}
          className="ml-2 rounded border border-current px-2 py-1 font-semibold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-white/5"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
