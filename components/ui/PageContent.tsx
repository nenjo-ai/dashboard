import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("px-4 py-4 md:px-6 md:py-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
