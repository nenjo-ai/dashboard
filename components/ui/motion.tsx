"use client";

import { motion, AnimatePresence } from "motion/react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Staggered list — wraps children in a stagger container
// ---------------------------------------------------------------------------

interface MotionListProps {
  children: ReactNode;
  className?: string;
  /** Delay between each child (seconds). Default 0.04 */
  stagger?: number;
}

const listVariants = {
  hidden: {},
  show: (stagger: number) => ({
    transition: { staggerChildren: stagger },
  }),
};

export function MotionList({ children, className, stagger = 0.04 }: MotionListProps) {
  return (
    <motion.div
      className={className}
      variants={listVariants}
      initial="hidden"
      animate="show"
      custom={stagger}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Staggered list item — fade + slide up
// ---------------------------------------------------------------------------

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

interface MotionItemProps {
  children: ReactNode;
  className?: string;
}

export function MotionItem({ children, className }: MotionItemProps) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page transition wrapper
// ---------------------------------------------------------------------------

interface PageTransitionProps {
  children: ReactNode;
  /** Should be the pathname or a unique key for the current page */
  pageKey: string;
}

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Re-export for convenience
export { motion, AnimatePresence };
