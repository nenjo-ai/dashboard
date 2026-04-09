import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium text-gray-700 dark:text-gray-300",
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="ml-0.5 text-flag-red-500">*</span>}
    </label>
  ),
);
Label.displayName = "Label";
