import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export const PAGE_CONTENT_FRAME_CLASS =
  "mx-auto w-full max-w-[96rem] px-4 md:px-6 lg:px-8";

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div
      className={cn(
        PAGE_CONTENT_FRAME_CLASS,
        "py-5 md:py-7 lg:py-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
