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
        "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400 focus:border-deep-space-blue-400",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50",
        "dark:bg-gray-800 dark:text-gray-100",
        error
          ? "border-flag-red-400 focus:ring-flag-red-400 focus:border-flag-red-400"
          : "border-gray-300 dark:border-gray-600",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
