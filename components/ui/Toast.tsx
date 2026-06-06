"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { toast as toastApi, type ToastItem } from "@/lib/toast";
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";

const icons: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const variantStyles: Record<string, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200",
  error: "bg-flag-red-50 border-flag-red-200 text-flag-red-800 dark:bg-flag-red-900/40 dark:border-flag-red-800 dark:text-flag-red-200",
  info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-200",
  warning: "bg-vivid-tangerine-50 border-vivid-tangerine-200 text-vivid-tangerine-800 dark:bg-vivid-tangerine-900/40 dark:border-vivid-tangerine-800 dark:text-vivid-tangerine-200",
};

const iconStyles: Record<string, string> = {
  success: "text-emerald-500 dark:text-emerald-400",
  error: "text-flag-red-500 dark:text-flag-red-400",
  info: "text-blue-500 dark:text-blue-400",
  warning: "text-vivid-tangerine-500 dark:text-vivid-tangerine-400",
};

function ToastItem({ item }: { item: ToastItem }) {
  const Icon = icons[item.variant];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 shadow-lg text-sm",
        variantStyles[item.variant],
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconStyles[item.variant])} />
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => toastApi.dismiss(item.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>(() =>
    toastApi.getToasts(),
  );

  useEffect(() => {
    return toastApi.subscribe(setToasts);
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
