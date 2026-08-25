import { cn } from "@/lib/cn";

interface LoadingStatusProps {
  label: string;
  description?: string;
  className?: string;
}

/** Calm, accessible loading feedback that avoids perpetual rotation. */
export function LoadingStatus({ label, description, className }: LoadingStatusProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)} role="status" aria-live="polite">
      <div className="theme-text-muted flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="animate-loading-dot h-1.5 w-1.5 rounded-full bg-current"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
      </div>
      <p className="theme-text text-sm font-medium">{label}</p>
      {description ? <p className="theme-text-muted max-w-md text-sm leading-6">{description}</p> : null}
    </div>
  );
}
