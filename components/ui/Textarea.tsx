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
        "flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 transition-colors",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400 focus:border-deep-space-blue-400",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50",
        "dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500",
        error
          ? "border-flag-red-400 focus:ring-flag-red-400 focus:border-flag-red-400"
          : "border-gray-300 dark:border-gray-600",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
