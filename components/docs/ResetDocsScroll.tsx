"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ResetDocsScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;

    requestAnimationFrame(() => {
      document.getElementById("nd-page")?.scrollTo({ top: 0, left: 0 });
    });
  }, [pathname]);

  return null;
}
