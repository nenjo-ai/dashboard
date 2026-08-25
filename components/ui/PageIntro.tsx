import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageIntroProps {
  title?: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

/** Consistent page-level context and primary actions beneath the app top bar. */
export function PageIntro({ title, description, eyebrow, actions, className }: PageIntroProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className="theme-text-muted mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">{eyebrow}</p>
        ) : null}
        {title ? <h1 className="theme-text text-2xl font-semibold tracking-[-0.025em]">{title}</h1> : null}
        <p className={cn("theme-text-muted text-sm leading-6", title && "mt-1.5")}>{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
