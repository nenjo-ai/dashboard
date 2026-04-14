"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

interface NenjoLogoMarkProps {
  className?: string;
}

export function NenjoLogoMark({ className }: NenjoLogoMarkProps) {
  return (
    <span className={cn("relative inline-flex h-10 w-10 shrink-0 items-center justify-center", className)}>
      <Image
        src="/nenjo-logo-dark.png"
        alt="nenjo"
        width={34}
        height={34}
        priority
        className="h-8.5 w-8.5 object-contain dark:hidden"
      />
      <Image
        src="/nenjo-logo-white.png"
        alt="nenjo"
        width={34}
        height={34}
        priority
        className="hidden h-8.5 w-8.5 object-contain dark:block"
      />
    </span>
  );
}
