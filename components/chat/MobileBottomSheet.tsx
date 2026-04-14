"use client";

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function MobileBottomSheet({ open, onClose, title, children }: MobileBottomSheetProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet-content"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 w-screen max-w-full overflow-x-hidden rounded-t-2xl border-t border-black/10 bg-[#f5f7fb] pb-safe dark:border-white/10 dark:bg-[#05070b]"
            style={{ maxHeight: "70vh" }}
          >
            {/* Handle + title */}
            <div className="flex items-center justify-between border-b border-black/5 px-4 pb-3 pt-3 dark:border-white/10">
              <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-black/15 dark:bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2 pt-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <MobileTouchButton
                onPress={onClose}
                className="rounded-full border border-black/10 bg-transparent p-1.5 text-gray-400 transition-colors hover:bg-black/[0.03] hover:text-gray-600 dark:border-white/10 dark:hover:bg-white/[0.04] dark:hover:text-gray-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </MobileTouchButton>
            </div>

            {/* Content */}
            <div className="min-w-0 max-w-full overflow-x-hidden overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(70vh - 80px)" }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
