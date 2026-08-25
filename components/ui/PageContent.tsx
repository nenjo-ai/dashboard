import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[96rem] px-4 py-5 md:px-6 md:py-7 lg:px-8 lg:py-8", className)}>
      {children}
    </div>
  );
}
