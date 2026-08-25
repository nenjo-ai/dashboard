"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const MOBILE_HERO_BAR_OFFSET =
  "calc(env(safe-area-inset-top, 0px) + 4.75rem)";

interface MobileHeroBarProps {
  title: string;
  leading: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function MobileHeroBar({
  title,
  leading,
  trailing,
  className,
}: MobileHeroBarProps) {
  return (
    <div
      className={cn(
        "theme-border relative z-20 shrink-0 border-b bg-[var(--app-overlay)] px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] backdrop-blur-2xl",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <h1 className="truncate text-[1.3rem] font-semibold tracking-[-0.025em] text-gray-950 dark:text-gray-50">
            {title}
          </h1>
        </div>
        {trailing ?? <div className="h-10 w-10 shrink-0" aria-hidden="true" />}
      </div>
    </div>
  );
}
