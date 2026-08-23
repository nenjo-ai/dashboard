"use client";

import { Circle, CircleCheck, CircleX } from "lucide-react";
import type { TraceStatus } from "@/lib/agentRunTrace/types";

export function TraceStatusIndicator({ status }: { status: TraceStatus }) {
  switch (status) {
    case "running":
      return (
        <span
          className="relative flex h-3.5 w-3.5 items-center justify-center"
          aria-hidden="true"
        >
          <span className="absolute h-3.5 w-3.5 rounded-full border border-amber-400/50 motion-safe:animate-pulse motion-reduce:animate-none" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      );
    case "completed":
      return (
        <CircleCheck
          aria-hidden="true"
          className="h-3.5 w-3.5 text-emerald-500"
        />
      );
    case "failed":
      return (
        <CircleX
          aria-hidden="true"
          className="h-3.5 w-3.5 text-red-500"
        />
      );
    case "cancelled":
      return (
        <CircleX
          aria-hidden="true"
          className="h-3.5 w-3.5 text-gray-400"
        />
      );
    case "queued":
      return (
        <Circle
          aria-hidden="true"
          className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600"
        />
      );
  }
}
