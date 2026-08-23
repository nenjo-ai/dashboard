"use client";

import { memo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ChatPhase } from "@/lib/chat/types";
import type { ChatMessage } from "@/lib/types";

const DOT_DELAYS = [0, 0.16, 0.32] as const;

function AnimatedDots() {
  const reduceMotion = useReducedMotion();
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {DOT_DELAYS.map((delay) => (
        <motion.span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-deep-space-blue-500 dark:bg-deep-space-blue-400"
          animate={
            reduceMotion
              ? { opacity: 0.7, y: 0 }
              : { opacity: [0.35, 1, 0.35], y: [0, -1, 0] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: 1.2,
                  delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      ))}
    </span>
  );
}

function PhaseMark({ phase }: { phase: ChatPhase }) {
  if (["connecting", "waiting", "thinking"].includes(phase)) {
    return <AnimatedDots />;
  }
  if (phase === "streaming") {
    return (
      <span
        className="h-3.5 w-0.5 rounded-full bg-deep-space-blue-500 motion-safe:animate-pulse motion-reduce:animate-none dark:bg-deep-space-blue-400"
        aria-hidden="true"
      />
    );
  }
  if (phase === "using_tool") {
    return (
      <span
        className="relative flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-deep-space-blue-400/60"
        aria-hidden="true"
      >
        <span className="h-1.5 w-1.5 rounded-[2px] bg-deep-space-blue-500 motion-safe:animate-pulse motion-reduce:animate-none dark:bg-deep-space-blue-400" />
      </span>
    );
  }
  return (
    <span
      className="relative flex h-3.5 w-3.5 items-center justify-center"
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-full border border-deep-space-blue-400/50 motion-safe:animate-pulse motion-reduce:animate-none" />
      <span className="h-1.5 w-1.5 rounded-full bg-deep-space-blue-500 dark:bg-deep-space-blue-400" />
    </span>
  );
}

function CalmStatus({
  label,
  phase,
  compact = false,
}: {
  label: string;
  phase: ChatPhase;
  compact?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      {!compact ? (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
      ) : null}
      <PhaseMark phase={phase} />
    </span>
  );
}

const PHASE_LABEL: Partial<Record<ChatPhase, string>> = {
  connecting: "Connecting",
  waiting: "Waiting for the agent",
  thinking: "Thinking",
  streaming: "Responding",
  using_tool: "Using a tool",
  finalizing: "Finalizing",
};

export function ChatProgressIndicator({
  phase,
  compact = false,
  label: labelOverride,
  agentName,
}: {
  phase?: ChatPhase;
  compact?: boolean;
  label?: string;
  agentName?: string;
}) {
  if (!phase) return null;
  const defaultLabel = PHASE_LABEL[phase];
  const label =
    labelOverride ??
    (agentName && phase === "waiting"
      ? `Waiting for ${agentName}`
      : agentName && phase === "thinking"
        ? `${agentName} is thinking`
        : defaultLabel);
  return label ? (
    <CalmStatus label={label} phase={phase} compact={compact} />
  ) : null;
}

export const MessageDeliveryStatus = memo(function MessageDeliveryStatus({
  status,
}: {
  status?: ChatMessage["status"];
}) {
  if (!status) return null;
  const transition = { duration: 0.2, ease: "easeOut" as const };
  const className =
    status === "failed"
      ? "text-rose-300"
      : status === "cancelled"
        ? "text-amber-300"
        : status === "delivered"
          ? "text-emerald-300"
          : "text-deep-space-blue-200";
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <motion.span
      key={status}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={transition}
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${className}`}
      role={status === "failed" ? "alert" : "status"}
    >
      {status === "delivered" ? (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 20 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 8.5l3 3 5-6M7 8.5l3 3 5-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === "sent" ? (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 20 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 8.5l4 4 7-8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === "sending" || status === "queued" ? (
        <span className="flex gap-0.5" aria-hidden="true">
          {[0, 160, 320].map((delay) => (
            <span
              key={delay}
              className="h-1 w-1 rounded-full bg-current animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      ) : null}
      {label}
    </motion.span>
  );
});
