import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  tone?: "default" | "error";
}

/** A compact, reusable landing surface for empty and recoverable error states. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = "default",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "theme-surface theme-border flex min-h-64 flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        tone === "error" && "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "theme-surface-muted theme-text-muted flex h-11 w-11 items-center justify-center rounded-xl border border-transparent",
            tone === "error" && "bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-300",
          )}
        >
          {icon}
        </div>
      ) : null}
      <h2 className="theme-text mt-4 text-base font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="theme-text-muted mt-1.5 max-w-md text-sm leading-6">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
