"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { mobileTabNavItems } from "./mobileNav";

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
}

function Section({
  title,
  items,
  pathname,
  onClose,
}: {
  title: string;
  items: typeof mobileTabNavItems;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <section>
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((item) => {
          const isActive = item.match ? item.match(pathname) : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-[1.35rem] border px-4 py-3.5 transition-colors",
                isActive
                  ? "border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950"
                  : "border-black/5 bg-white/60 text-gray-800 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100",
              )}
            >
              <span className={cn("shrink-0", isActive ? "text-current" : "text-gray-500 dark:text-gray-400")}>
                {item.icon}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function MobileNavSheet({ open, onClose }: MobileNavSheetProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm md:hidden"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", bounce: 0, duration: 0.28 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-[#f5f7fb] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] dark:bg-[#05070b] md:hidden"
          >
            <div className="mx-auto max-w-md">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Navigation
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-gray-950 dark:text-white">
                    Open Nenjo
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-black/5 bg-white/70 p-3 text-gray-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-7">
                <Section title="Navigation" items={mobileTabNavItems} pathname={pathname} onClose={onClose} />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
