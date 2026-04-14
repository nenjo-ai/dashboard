import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "theme-surface theme-text flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm transition-colors",
        "placeholder:text-[var(--app-text-muted)]",
        "focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400 focus:border-deep-space-blue-400",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:[background:var(--app-surface-muted)]",
        error
          ? "border-flag-red-400 focus:ring-flag-red-400 focus:border-flag-red-400"
          : "theme-border",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
