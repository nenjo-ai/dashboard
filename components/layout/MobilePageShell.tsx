"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MobileHeroBar } from "./MobileHeroBar";
import { NenjoLogoMark } from "./NenjoLogoMark";

interface MobilePageShellProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}

export function MobilePageShell({
  title,
  backHref,
  backLabel,
  actionLabel,
  onAction,
  children,
  className,
}: MobilePageShellProps) {
  return (
    <div className={cn("min-h-full bg-[#f5f7fb] dark:bg-[#05070b] md:hidden", className)}>
      <MobileHeroBar
        title={title}
        leading={
          backHref ? (
            <Link
              href={backHref}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/78 text-gray-700 backdrop-blur-xl transition-colors active:scale-[0.98] dark:border-white/10 dark:bg-white/6 dark:text-gray-100"
              aria-label={backLabel ?? "Go back"}
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <NenjoLogoMark />
          )
        }
        trailing={actionLabel && onAction ? (
          <Button
            size="sm"
            onClick={onAction}
            className="h-10 shrink-0 rounded-full border border-black/10 bg-white/78 px-4 text-sm text-gray-900 backdrop-blur-xl hover:bg-white/90 dark:border-white/10 dark:bg-white/6 dark:text-gray-100 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            {actionLabel}
          </Button>
        ) : undefined}
      />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="bg-[#f5f7fb] px-4 pb-6 pt-4 dark:bg-[#05070b]"
      >
        {children}
      </motion.div>
    </div>
  );
}
