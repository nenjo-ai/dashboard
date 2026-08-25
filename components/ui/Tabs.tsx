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
  indicatorAnimation?: "layout" | "slide";
  mobileVariant?: "select" | "scroll";
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className,
  layoutId = "tab-indicator",
  indicatorAnimation = "layout",
  mobileVariant = "select",
}: TabsProps) {
  const tabCount = Math.max(tabs.length, 1);
  const activeIndex = Math.max(
    tabs.findIndex((tab) => tab.id === activeTab),
    0,
  );
  const usesSlideIndicator = indicatorAnimation === "slide";

  return (
    <>
      {/* Mobile: select dropdown */}
      {mobileVariant === "select" ? <div className={cn("md:hidden relative", className)}>
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
      </div> : (
        <div
          className={cn("theme-surface-muted theme-border grid rounded-xl border p-1 md:hidden", className)}
          style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2 sm:text-xs",
                  isActive
                    ? "theme-surface-elevated theme-border theme-text border shadow-xs"
                    : "theme-text-muted",
                )}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop: quiet segmented control */}
      <div
        className={cn(
          usesSlideIndicator
            ? "theme-surface-muted theme-border relative hidden rounded-xl border p-1 md:grid"
            : "theme-surface-muted theme-border hidden gap-1 rounded-xl border p-1 md:flex",
          className,
        )}
        style={
          usesSlideIndicator
            ? { gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {usesSlideIndicator && tabs.length ? (
          <span
            aria-hidden="true"
            className="theme-surface-elevated theme-border pointer-events-none absolute bottom-1 left-1 top-1 rounded-lg border shadow-xs transition-transform duration-200 ease-out"
            style={{
              width: `calc((100% - 0.5rem) / ${tabCount})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        ) : null}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const className = cn(
            "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            usesSlideIndicator ? "justify-center" : undefined,
            isActive
              ? "theme-text"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
          );
          const content = (
            <>
              {!usesSlideIndicator && isActive && (
                <motion.div
                  layoutId={layoutId}
                  className="theme-surface-elevated theme-border pointer-events-none absolute inset-0 rounded-lg border shadow-xs"
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
                        ? "theme-selection-accent-soft theme-selected-text"
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
              <Link
                key={tab.id}
                href={tab.href}
                scroll={false}
                prefetch={false}
                className={className}
              >
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
