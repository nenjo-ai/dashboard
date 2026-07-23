"use client";

import { useEffect, useRef } from "react";
import type { Domain } from "@/lib/types";

interface DomainSlashCommandDropdownProps {
  /** Pre-filtered list of domains to display. */
  domains: Domain[];
  selectedIndex: number;
  onSelect: (domain: Domain) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  accentColor?: string;
  exitMode?: boolean;
  onExitDomain?: () => void;
}

export function DomainSlashCommandDropdown({
  domains,
  selectedIndex,
  onSelect,
  onClose,
  anchorRef,
  accentColor,
  exitMode = false,
  onExitDomain,
}: DomainSlashCommandDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  if (domains.length === 0 && !exitMode) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
        Domain Expansion
      </div>
      {exitMode ? (
        <button
          className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
          style={
            accentColor
              ? {
                  backgroundColor: `${accentColor}12`,
                  color: accentColor,
                }
              : undefined
          }
          onClick={() => onExitDomain?.()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            style={
              accentColor
                ? {
                    backgroundColor: `${accentColor}18`,
                    color: accentColor,
                  }
                : undefined
            }
          >
            #
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Exit domain</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              Return to normal chat
            </div>
          </div>
        </button>
      ) : domains.map((domain, idx) => (
        <button
          key={domain.id}
          className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors ${
            idx === selectedIndex
              ? "bg-gray-50 text-gray-900 dark:bg-gray-700/70 dark:text-gray-100"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
          style={
            idx === selectedIndex && accentColor
              ? {
                  backgroundColor: `${accentColor}12`,
                  color: accentColor,
                }
              : undefined
          }
          onClick={() => onSelect(domain)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            style={
              accentColor
                ? {
                    backgroundColor: `${accentColor}18`,
                    color: accentColor,
                  }
                : undefined
            }
          >
            #
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{domain.command}</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {domain.name}
              {domain.description && ` — ${domain.description}`}
            </div>
          </div>
          {domain.category && (
            <span className="mt-0.5 rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {domain.category}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
