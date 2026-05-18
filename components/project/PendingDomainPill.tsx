"use client";

import { X } from "lucide-react";
import type { Domain } from "@/lib/types";
import { cn } from "@/lib/cn";

interface PendingDomainPillProps {
  domain: Domain;
  onClear: () => void;
  accentColor?: string;
  className?: string;
}

export function PendingDomainPill({ domain, onClear, accentColor, className }: PendingDomainPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200",
        className,
      )}
      style={
        accentColor
          ? {
              borderColor: `${accentColor}55`,
              backgroundColor: `${accentColor}14`,
              color: accentColor,
            }
          : undefined
      }
    >
      <span className="truncate">{domain.command}</span>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-75 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        aria-label={`Remove ${domain.command}`}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
