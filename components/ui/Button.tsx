import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";


// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-deep-space-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-[#05070b]";

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
        <span className="flex items-center gap-0.5" role="status" aria-label="Loading">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              aria-hidden="true"
              className="animate-loading-dot h-1 w-1 rounded-full bg-current"
              style={{ animationDelay: `${dot * 120}ms` }}
            />
          ))}
        </span>
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
