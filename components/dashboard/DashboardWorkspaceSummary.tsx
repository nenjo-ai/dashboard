import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/cn";

type WorkerState = "checking" | "connected" | "disconnected" | "unavailable";

interface DashboardWorkspaceSummaryProps {
  activeCount: number;
  attentionCount: number;
  completedTodayCount: number;
  connectedWorkerCount: number;
  workerState: WorkerState;
}

function summaryCopy({
  activeCount,
  attentionCount,
  connectedWorkerCount,
  workerState,
}: Pick<
  DashboardWorkspaceSummaryProps,
  "activeCount" | "attentionCount" | "connectedWorkerCount" | "workerState"
>) {
  if (workerState === "checking") {
    return "Checking your local runtime and recent work.";
  }
  if (workerState === "unavailable") {
    return "Runtime status is temporarily unavailable. Your recent workspace data is still shown below.";
  }
  if (workerState === "disconnected") {
    return "Connect a worker to start or resume agent work from this workspace.";
  }
  if (activeCount > 0) {
    return `${activeCount} ${activeCount === 1 ? "execution is" : "executions are"} moving across ${connectedWorkerCount} connected ${connectedWorkerCount === 1 ? "worker" : "workers"}.`;
  }
  if (attentionCount > 0) {
    return `Your worker is online. ${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} your attention.`;
  }
  return "Your worker is online and the workspace is ready for the next task.";
}

function RuntimeBadge({ state, count }: { state: WorkerState; count: number }) {
  const connected = state === "connected";
  const label =
    state === "checking"
      ? "Checking runtime"
      : connected
        ? `${count} ${count === 1 ? "worker" : "workers"} online`
        : state === "unavailable"
          ? "Status unavailable"
          : "Worker offline";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        connected
          ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
          : state === "checking"
            ? "theme-border theme-text-muted theme-surface-muted"
            : "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
      )}
      role="status"
      aria-live="polite"
    >
      {connected ? (
        <Wifi className="h-3 w-3" aria-hidden="true" />
      ) : state === "checking" ? (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute h-2 w-2 rounded-full bg-current opacity-25 motion-safe:animate-pulse motion-reduce:animate-none" />
          <span className="relative m-auto h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : (
        <WifiOff className="h-3 w-3" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function DashboardWorkspaceSummary({
  activeCount,
  attentionCount,
  completedTodayCount,
  connectedWorkerCount,
  workerState,
}: DashboardWorkspaceSummaryProps) {
  const metrics = [
    {
      label: "Active work",
      mobileLabel: "Active work",
      value: activeCount,
      href: "/dashboard/executions",
      icon: Radio,
      tone: "text-blue-600 dark:text-blue-300",
    },
    {
      label: "Needs attention",
      mobileLabel: "Attention",
      value: attentionCount,
      href: "/dashboard/reviews",
      icon: CircleAlert,
      tone:
        attentionCount > 0
          ? "text-amber-600 dark:text-amber-300"
          : "theme-text-muted",
    },
    {
      label: "Completed today",
      mobileLabel: "Completed",
      value: completedTodayCount,
      href: "/dashboard/executions",
      icon: CheckCircle2,
      tone: "text-emerald-600 dark:text-emerald-300",
    },
  ];

  return (
    <section className="theme-border theme-surface relative h-full overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div
        className="pointer-events-none absolute -right-20 -top-28 h-60 w-60 rounded-full bg-deep-space-blue-500/[0.07] blur-3xl dark:bg-deep-space-blue-400/[0.08]"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
              Live overview
            </p>
            <h2 className="theme-text mt-1.5 text-xl font-semibold tracking-[-0.025em]">
              Workspace summary
            </h2>
          </div>
          <RuntimeBadge state={workerState} count={connectedWorkerCount} />
        </div>

        <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
          {summaryCopy({
            activeCount,
            attentionCount,
            connectedWorkerCount,
            workerState,
          })}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link
                key={metric.label}
                href={metric.href}
                className="group rounded-xl border border-black/[0.055] bg-white/55 p-3 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-black/10 hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.025] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.045] sm:p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className={cn("h-4 w-4", metric.tone)} aria-hidden="true" />
                  <ArrowRight
                    className="theme-text-muted h-3.5 w-3.5 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
                <p className="theme-text mt-3 text-xl font-semibold tabular-nums">
                  {metric.value}
                </p>
                <p className="theme-text-muted mt-0.5 text-[11px] sm:text-xs">
                  <span className="sm:hidden">{metric.mobileLabel}</span>
                  <span className="hidden sm:inline">{metric.label}</span>
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
