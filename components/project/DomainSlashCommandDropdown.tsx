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
}

export function DomainSlashCommandDropdown({
  domains,
  selectedIndex,
  onSelect,
  onClose,
  anchorRef,
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

  if (domains.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
        Available Domains
      </div>
      {domains.map((domain, idx) => (
        <button
          key={domain.id}
          className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors ${
            idx === selectedIndex
              ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
          onClick={() => onSelect(domain)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm bg-purple-100 text-xs font-medium text-purple-600 dark:bg-purple-900/50 dark:text-purple-300">
            /
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{domain.command}</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {domain.display_name}
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
