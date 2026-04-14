import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";


// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-deep-space-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-[#05070b]";

const variantStyles: Record<string, string> = {
  primary:
    "[background:var(--app-accent)] [color:var(--app-accent-foreground)] hover:[background:var(--app-accent-hover)] active:[background:var(--app-accent-active)]",
  secondary:
    "theme-surface theme-border border [color:var(--app-text)] hover:[background:var(--app-hover)] active:[background:var(--app-hover-strong)]",
  ghost: "[color:var(--app-text)] hover:[background:var(--app-hover)] active:[background:var(--app-hover-strong)]",
  danger:
    "[background:var(--app-danger)] [color:var(--app-danger-foreground)] hover:[background:var(--app-danger-hover)] active:[background:var(--app-danger-active)]",
};

const sizeStyles: Record<string, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4",
  lg: "h-12 px-6 text-base",
};

// ---------------------------------------------------------------------------
// Button component
// ---------------------------------------------------------------------------

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        base,
        variantStyles[variant],
        sizeStyles[size],
        "active:scale-[0.98]",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
