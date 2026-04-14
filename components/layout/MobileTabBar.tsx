"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { mobileTabNavItems } from "./mobileNav";

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-[#f5f7fb]/88 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070b]/88 md:hidden"
      style={{ WebkitBackdropFilter: "blur(24px)" }}
    >
      <nav className="flex gap-1 overflow-x-auto px-2 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {mobileTabNavItems.map((item) => {
          const isActive = item.match ? item.match(pathname) : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[4.6rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                  : "text-gray-500 dark:text-gray-400",
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
