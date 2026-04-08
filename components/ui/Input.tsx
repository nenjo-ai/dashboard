import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 transition-colors",
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
Input.displayName = "Input";
