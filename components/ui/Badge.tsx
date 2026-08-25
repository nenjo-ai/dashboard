import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";


// ---------------------------------------------------------------------------
// Variant styles — covers execution status, task status, and priority
// ---------------------------------------------------------------------------

const variants: Record<string, string> = {
  // default
  default: "bg-gray-100 text-gray-700 border-gray-200",

  // execution statuses
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  running: "bg-blue-100 text-blue-700 border-blue-200",
  paused: "bg-yellow-100 text-yellow-700 border-yellow-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-orange-100 text-orange-700 border-orange-200",

  // task statuses
  open: "bg-blue-50 text-blue-600 border-blue-200",
  ready: "bg-indigo-100 text-indigo-700 border-indigo-200",
  backlog: "bg-gray-100 text-gray-500 border-gray-200",
  assigned: "bg-purple-100 text-purple-700 border-purple-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed: "bg-gray-200 text-gray-600 border-gray-300",

  // priorities
  low: "bg-gray-100 text-gray-600 border-gray-200",
  medium: "bg-blue-50 text-blue-600 border-blue-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",

  // task types
  bug: "bg-red-50 text-red-600 border-red-200",
  feature: "bg-violet-100 text-violet-700 border-violet-200",
  task: "bg-gray-100 text-gray-600 border-gray-200",
  improvement: "bg-cyan-100 text-cyan-700 border-cyan-200",

  // agent roles
  coder: "bg-sky-100 text-sky-700 border-sky-200",
  reviewer: "bg-amber-100 text-amber-700 border-amber-200",
  tester: "bg-teal-100 text-teal-700 border-teal-200",
  auditor: "bg-rose-100 text-rose-700 border-rose-200",
  architect: "bg-violet-100 text-violet-700 border-violet-200",
  planner: "bg-lime-100 text-lime-700 border-lime-200",
  researcher: "bg-indigo-100 text-indigo-700 border-indigo-200",

  // agent activity
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
};

// ---------------------------------------------------------------------------
// Dot colors for the animated indicator
// ---------------------------------------------------------------------------

const dotColors: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-blue-500",
  paused: "bg-yellow-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-orange-500",
  open: "bg-blue-500",
  ready: "bg-indigo-500",
  backlog: "bg-gray-400",
  assigned: "bg-purple-500",
  in_progress: "bg-blue-500",
  resolved: "bg-emerald-500",
  closed: "bg-gray-500",
};

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: string;
  showDot?: boolean;
}

export function Badge({
  variant = "default",
  showDot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const variantClass = variants[variant] ?? variants.default;
  const isAnimated = variant === "running" || variant === "in_progress";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        variantClass,
        className,
      )}
      {...props}
    >
      {showDot && (
        <span className="relative flex h-2 w-2">
          {isAnimated && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
                dotColors[variant],
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              dotColors[variant] ?? "bg-gray-400",
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}
