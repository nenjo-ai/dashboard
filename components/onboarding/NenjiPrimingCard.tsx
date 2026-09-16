"use client";

import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

/**
 * The "Priming Nenji / Worker connected" card from the onboarding connect
 * step, shared with the harness pairing landing page so both flows present
 * the same visualization while the welcome chat session is prepared.
 */
export function NenjiPrimingCard({
  roleId,
  color,
  animate,
  headline,
  subline,
  chips,
  pillLabel = "Nenji",
}: {
  roleId: string;
  color: string;
  animate: boolean;
  headline: string;
  subline: string;
  chips: string[];
  pillLabel?: string;
}) {
  return (
    <div className="relative p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_55%)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-deep-space-blue-400/20 blur-xl" />
            <RoleIdenticon
              roleId={roleId}
              color={color}
              size={72}
              animate={animate}
              className="relative ring-4 ring-white/80 dark:ring-gray-900/70"
              name="Nenji"
            />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-deep-space-blue-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-deep-space-blue-700 dark:border-deep-space-blue-500/40 dark:bg-gray-900/60 dark:text-deep-space-blue-300">
              <span
                className={`h-2 w-2 rounded-full ${animate ? "animate-pulse bg-deep-space-blue-500" : "bg-green-500"}`}
              />
              {pillLabel}
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{headline}</p>
            <p className="max-w-md text-sm text-gray-600 dark:text-gray-300">{subline}</p>
          </div>
        </div>
        <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:min-w-56">
          {chips.map((chip) => (
            <div
              key={chip}
              className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 dark:border-gray-700/80 dark:bg-gray-900/60"
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
