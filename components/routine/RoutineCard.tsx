"use client";

import { useRouter } from "next/navigation";
import type { RoutineSummary } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Trigger visual config
// ---------------------------------------------------------------------------

const triggerConfig: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  cron: {
    icon: "clock",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    border: "border-cyan-200 dark:border-cyan-800",
    label: "Cron / Scheduled",
  },
  "chat.message": {
    icon: "chat",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    label: "Chat Message",
  },
  "task.ready": {
    icon: "bolt",
    color: "text-deep-space-blue-600 dark:text-deep-space-blue-400",
    bg: "bg-deep-space-blue-50 dark:bg-deep-space-blue-950/30",
    border: "border-deep-space-blue-200 dark:border-deep-space-blue-800",
    label: "Task Ready",
  },
};

function TriggerIcon({ trigger, className }: { trigger: string; className?: string }) {
  const cfg = triggerConfig[trigger] ?? triggerConfig["task.ready"];
  if (cfg.icon === "clock") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (cfg.icon === "chat") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    );
  }
  // bolt
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface RoutineCardProps {
  routine: RoutineSummary;
  onDelete?: (routine: RoutineSummary) => void;
  isDeleting?: boolean;
}

export function RoutineCard({ routine, onDelete, isDeleting }: RoutineCardProps) {
  const router = useRouter();
  const cfg = triggerConfig[routine.trigger] ?? triggerConfig["task.ready"];

  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button")) return;
        const tab = routine.trigger === "cron" ? "?tab=run" : "";
        router.push(`/dashboard/routines/${routine.id}${tab}`);
      }}
      className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
            <TriggerIcon trigger={routine.trigger} className={`h-4.5 w-4.5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {routine.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
              {routine.is_default && (
                <Badge variant="ready">Default</Badge>
              )}
              {!routine.is_active && (
                <Badge variant="inactive">Inactive</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Delete button */}
        {onDelete && !routine.is_default && (
          <button
            onClick={() => onDelete(routine)}
            disabled={isDeleting}
            className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-flag-red-500 disabled:opacity-50 dark:text-gray-600 dark:hover:bg-red-900/30 dark:hover:text-flag-red-400"
            title="Delete routine"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>

      {/* Stats — pushed to bottom */}
      <div className="mt-auto pt-4">
        <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <span>{routine.step_count} {routine.step_count === 1 ? "step" : "steps"}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{new Date(routine.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
