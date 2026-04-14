import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "theme-surface theme-text flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400 focus:border-deep-space-blue-400",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:[background:var(--app-surface-muted)]",
        error
          ? "border-flag-red-400 focus:ring-flag-red-400 focus:border-flag-red-400"
          : "theme-border",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
