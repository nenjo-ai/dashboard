"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
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
  const router = useRouter();
  const [open, setOpen] = useState<"desktop" | "mobile" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const orgLabel =
    activeOrgName ??
    activeOrganization?.name ??
    (isLoading ? "Loading org..." : "Organization");

  useEffect(() => {
    if (open !== "desktop") return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open !== "mobile") return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  const selectOrganization = (orgId: string) => {
    setActiveOrgId(orgId);
    setOpen(null);
    router.refresh();
  };

  const mobileSheet =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {open === "mobile" && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 bg-black/40 md:hidden"
                  onClick={() => setOpen(null)}
                />
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="mobile-org-switcher-title"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-black/10 bg-[#f5f7fb] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3 dark:border-white/10 dark:bg-[#05070b] md:hidden"
                >
                  <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-black/15 dark:bg-white/20" />
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                        Organization
                      </p>
                      <h2
                        id="mobile-org-switcher-title"
                        className="mt-1 text-lg font-semibold text-gray-950 dark:text-white"
                      >
                        Switch organization
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(null)}
                      className="rounded-full border border-black/10 p-2 text-gray-500 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                      aria-label="Close organization switcher"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <div className="space-y-1">
                    {organizations.map((org) => {
                      const selected = org.id === activeOrgId;
                      return (
                        <button
                          key={org.id}
                          type="button"
                          onClick={() => selectOrganization(org.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors",
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
                  <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
                    <Link
                      href="/dashboard/settings?tab=org"
                      onClick={() => setOpen(null)}
                      className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
                    >
                      <Settings2 className="h-4 w-4 text-gray-400" />
                      Manage org
                    </Link>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        );

  return (
    <>
      <div ref={rootRef} className="relative hidden md:block">
        <button
          type="button"
          onClick={() => setOpen(open === "desktop" ? null : "desktop")}
          className="theme-border theme-surface inline-flex h-10 min-w-0 items-center gap-2 rounded-full border px-3 text-sm text-gray-700 shadow-xs transition-colors hover:[background:var(--app-hover)] dark:text-gray-200"
          aria-haspopup="menu"
          aria-expanded={open === "desktop"}
        >
          <Building2 className="h-4 w-4 shrink-0 text-deep-space-blue-500" />
          <span className="max-w-44 truncate font-medium">{orgLabel}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-400 transition-transform",
              open === "desktop" && "rotate-180",
            )}
          />
        </button>

        {open === "desktop" && (
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
                    onClick={() => selectOrganization(org.id)}
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
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] dark:text-gray-200"
              >
                <Settings2 className="h-4 w-4 text-gray-400" />
                Manage org
              </Link>
            </div>
          </div>
        )}
      </div>

      {organizations.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen("mobile")}
          className="theme-border theme-surface inline-flex h-9 max-w-32 min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-xs text-gray-700 shadow-xs transition-colors hover:[background:var(--app-hover)] dark:text-gray-200 md:hidden"
          aria-haspopup="dialog"
          aria-expanded={open === "mobile"}
          aria-label="Switch organization"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-deep-space-blue-500" />
          <span className="truncate font-medium">{orgLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
      )}

      {mobileSheet}
    </>
  );
}
