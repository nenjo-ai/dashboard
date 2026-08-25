import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes } from "react";


// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: "default" | "compact";
  /** When true, disables the subtle interactive shadow. */
  static?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = "default", static: isStatic, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "theme-surface theme-border rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        isStatic ? "" : "transition-[border-color,box-shadow] duration-200 hover:[border-color:var(--app-border-strong)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.07)]",
        size === "compact" && "[&>div]:p-5 [&>div]:pt-0 [&>div:first-child]:pt-5",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// ---------------------------------------------------------------------------
// Card Header
// ---------------------------------------------------------------------------

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

// ---------------------------------------------------------------------------
// Card Title
// ---------------------------------------------------------------------------

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

// ---------------------------------------------------------------------------
// Card Description
// ---------------------------------------------------------------------------

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-gray-500 dark:text-gray-400", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

// ---------------------------------------------------------------------------
// Card Content
// ---------------------------------------------------------------------------

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

// ---------------------------------------------------------------------------
// Card Footer
// ---------------------------------------------------------------------------

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
