import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "./Label";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  help,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-flag-red-500">{error}</p>
      )}
      {!error && help && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{help}</p>
      )}
    </div>
  );
}
