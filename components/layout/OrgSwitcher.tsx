"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOrgContext } from "@/lib/org-context";

export function OrgSwitcher() {
  const {
    activeOrgId,
    activeOrgName,
    activeOrganization,
    organizations,
    isLoading,
    setActiveOrgId,
  } = useOrgContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="theme-border theme-surface inline-flex h-10 min-w-0 items-center gap-2 rounded-full border px-3 text-sm text-gray-700 shadow-xs transition-colors hover:[background:var(--app-hover)] dark:text-gray-200"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Building2 className="h-4 w-4 shrink-0 text-deep-space-blue-500" />
        <span className="max-w-44 truncate font-medium">
          {activeOrgName ?? activeOrganization?.name ?? (isLoading ? "Loading org..." : "Organization")}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="theme-border theme-surface-elevated absolute right-0 top-12 z-40 w-80 rounded-2xl border p-2 shadow-xl">
          <div className="px-3 pb-2 pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Organization
            </p>
          </div>

          <div className="space-y-1">
            {organizations.map((org) => {
              const selected = org.id === activeOrgId;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    setActiveOrgId(org.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-200"
                      : "text-gray-700 hover:bg-black/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{org.name}</span>
                    <span className="block truncate text-xs text-gray-400">{org.role}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="theme-border mt-2 border-t pt-2">
            <Link
              href="/dashboard/settings?tab=org"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
            >
              <Settings2 className="h-4 w-4 text-gray-400" />
              Manage org
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
