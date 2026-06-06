"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type PendingCommandPillCommand = {
  command: string;
  description?: string;
};

interface PendingCommandPillProps {
  command: PendingCommandPillCommand;
  onClear: () => void;
  accentColor?: string;
  className?: string;
}

export function PendingCommandPill({
  command,
  onClear,
  accentColor,
  className,
}: PendingCommandPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200",
        className,
      )}
      title={command.description}
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
      <span className="truncate">{command.command}</span>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-75 transition-colors hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        aria-label={`Remove ${command.command}`}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
