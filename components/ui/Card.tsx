import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes } from "react";


// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: "default" | "compact";
  /** When true, disables the hover scale / shadow animation. */
  static?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, size = "default", static: isStatic, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800",
        isStatic ? "" : "transition-all hover:shadow-md hover:scale-[1.01]",
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
