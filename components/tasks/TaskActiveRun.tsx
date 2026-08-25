"use client";

import dynamic from "next/dynamic";
import { Radio, Square } from "lucide-react";

import type { TaskExecutionRun } from "@/lib/types";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

const TaskRunActivity = dynamic(() => import("./TaskRunActivity").then((module) => module.TaskRunActivity), {
  ssr: false,
  loading: () => <LoadingStatus className="min-h-44" label="Loading live activity" />,
});

export function TaskActiveRun({ run, targetName, cancelling, onCancel, onRefresh }: {
  run: TaskExecutionRun;
  targetName: string;
  cancelling: boolean;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200/80 bg-blue-50/35 dark:border-blue-400/20 dark:bg-blue-400/[0.04]">
      <div className="flex flex-col gap-3 border-b border-blue-200/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-blue-400/20">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300"><Radio className="h-4 w-4 motion-safe:animate-pulse" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="theme-text text-sm font-semibold">Active run</h2><Badge variant={run.status} showDot>{run.status}</Badge></div><p className="theme-text-muted mt-1 text-xs">{targetName || "Assigned target"} · started {formatExecutionRelativeTime(run.started_at ?? run.created_at)}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {run.pending_reviews > 0 ? <a className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white" href={`/dashboard/reviews?execution_id=${run.id}`}>Review request</a> : null}
          <Button disabled={cancelling} onClick={onCancel} size="sm" variant="secondary"><Square className="h-3.5 w-3.5" />Cancel</Button>
        </div>
      </div>
      <div className="p-4"><TaskRunActivity executionId={run.id} onTerminal={onRefresh} status={run.status} /></div>
    </section>
  );
}
