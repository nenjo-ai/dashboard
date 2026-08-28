import Link from "next/link";
import { ArrowUpRight, Clock3, ListTree, Trash2, Workflow } from "lucide-react";

import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import type { RoutineSummary } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

// ---------------------------------------------------------------------------
// Trigger visual config
// ---------------------------------------------------------------------------

const triggerConfig = {
  color: "text-deep-space-blue-600 dark:text-deep-space-blue-400",
  bg: "bg-deep-space-blue-50 dark:bg-deep-space-blue-950/30",
  label: "Task",
};

function TriggerIcon({ className }: { className?: string }) {
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
  const cfg = triggerConfig;

  return (
    <article className="theme-surface theme-border group relative flex h-full min-h-56 flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-deep-space-blue-300/70 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:hover:border-deep-space-blue-500/30">
      <Link
        aria-label={`Open ${routine.name}`}
        className="flex h-full flex-1 flex-col p-5 outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-deep-space-blue-400"
        href={`/dashboard/routines/${routine.id}`}
        prefetch={false}
      >
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
            <TriggerIcon className={`h-4.5 w-4.5 ${cfg.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="theme-text truncate font-semibold tracking-[-0.01em]">
              {routine.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`text-xs font-medium ${cfg.color}`}>
                {cfg.label} workflow
              </span>
              {routine.is_default && (
                <Badge variant="ready">Default</Badge>
              )}
            </div>
          </div>
          </div>
          <ArrowUpRight className="theme-text-muted h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </div>

        <p className="theme-text-muted mt-4 line-clamp-2 min-h-12 text-sm leading-6">
          {routine.description || "Add a description to explain when this routine should be used."}
        </p>

        <div className="theme-border mt-auto grid grid-cols-2 gap-3 border-t pt-4 text-xs">
          <div className="theme-text-muted flex items-center gap-1.5">
            <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{routine.step_count} {routine.step_count === 1 ? "step" : "steps"}</span>
          </div>
          <div className="theme-text-muted flex items-center justify-end gap-1.5">
            {routine.last_run_at ? <Workflow className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{routine.last_run_at ? `Ran ${formatExecutionRelativeTime(routine.last_run_at)}` : `Updated ${formatExecutionRelativeTime(routine.updated_at)}`}</span>
          </div>
        </div>
      </Link>

      {onDelete && !routine.is_default ? (
        <button
          aria-label={`Delete ${routine.name}`}
          className="theme-text-muted absolute right-3.5 top-3.5 z-10 rounded-lg p-2 opacity-0 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-flag-red-500 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 group-hover:opacity-100 disabled:opacity-50 dark:hover:text-flag-red-400"
          disabled={isDeleting}
          onClick={() => onDelete(routine)}
          title="Delete routine"
          type="button"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}
