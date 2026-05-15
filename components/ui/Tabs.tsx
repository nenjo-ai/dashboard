"use client";

import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  href?: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  layoutId?: string;
}

export function Tabs({ tabs, activeTab, onChange, className, layoutId = "tab-indicator" }: TabsProps) {
  return (
    <>
      {/* Mobile: select dropdown */}
      <div className={cn("md:hidden relative", className)}>
        <select
          value={activeTab}
          onChange={(e) => onChange(e.target.value)}
          className="theme-border theme-surface w-full appearance-none rounded-lg border py-2.5 pl-3 pr-10 text-sm font-medium text-gray-900 transition-colors focus:border-deep-space-blue-400 focus:outline-none focus:ring-2 focus:ring-deep-space-blue-400 dark:text-gray-100"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>

      {/* Desktop: pill tabs */}
      <div
        className={cn(
          "theme-surface-muted hidden gap-1 rounded-lg p-1 md:flex",
          className,
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const className = cn(
            "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive
              ? "text-gray-950 dark:text-gray-950"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
          );
          const content = (
            <>
              {isActive && (
                <motion.div
                  layoutId={layoutId}
                  className="pointer-events-none absolute inset-0 rounded-md bg-sunflower-gold-500 shadow-xs dark:bg-sunflower-gold-500"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      isActive
                        ? "bg-white/70 text-gray-900 dark:bg-white/70 dark:text-gray-900"
                        : "bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
            </>
          );

          if (tab.href) {
            return (
              <Link key={tab.id} href={tab.href} scroll={false} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </>
  );
}
