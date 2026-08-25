import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  CircleAlert,
  Layers3,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActivityEntry } from "@/lib/hooks";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function eventPresentation(entry: ActivityEntry) {
  const event = entry.event_type.toLowerCase();
  if (event.includes("fail") || event.includes("error")) {
    return {
      icon: CircleAlert,
      iconClassName: "text-rose-600 dark:text-rose-300",
      surfaceClassName: "bg-rose-500/10",
    };
  }
  if (event.includes("complete") || event === "created") {
    return {
      icon: Check,
      iconClassName: "text-emerald-600 dark:text-emerald-300",
      surfaceClassName: "bg-emerald-500/10",
    };
  }
  if (entry.category === "system") {
    return {
      icon: Settings2,
      iconClassName: "text-violet-600 dark:text-violet-300",
      surfaceClassName: "bg-violet-500/10",
    };
  }
  if (entry.category === "resource") {
    return {
      icon: Layers3,
      iconClassName: "text-blue-600 dark:text-blue-300",
      surfaceClassName: "bg-blue-500/10",
    };
  }
  return {
    icon: Activity,
    iconClassName: "theme-text-muted",
    surfaceClassName: "theme-surface-muted",
  };
}

function activityContext(entry: ActivityEntry): string {
  const parts = [entry.resource_name, entry.actor_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : entry.category;
}

export function DashboardActivityTimeline({
  activity,
  description = "A readable trail of workspace changes.",
  allHref = "/dashboard/activity",
}: {
  activity: ActivityEntry[];
  description?: string;
  allHref?: string;
}) {
  return (
    <section className="theme-border theme-surface h-full overflow-hidden rounded-[1.4rem] border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="theme-border flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="theme-text text-sm font-semibold">Recent activity</h2>
          <p className="theme-text-muted mt-1 text-sm">{description}</p>
        </div>
        <Link
          href={allHref}
          className="theme-text-muted inline-flex shrink-0 items-center gap-1 text-xs font-medium transition-colors hover:text-deep-space-blue-600 dark:hover:text-deep-space-blue-300"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {activity.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center px-6 py-8 text-center">
          <div>
            <span className="theme-surface-muted theme-text-muted mx-auto flex h-10 w-10 items-center justify-center rounded-xl">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="theme-text mt-3 text-sm font-medium">No activity yet</p>
            <p className="theme-text-muted mt-1 text-sm">Workspace changes will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-black/[0.055] px-2 dark:divide-white/[0.07]">
          {activity.map((entry) => {
            const presentation = eventPresentation(entry);
            const Icon = presentation.icon;
            return (
              <div key={entry.id} className="flex items-start gap-3 px-3 py-3.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    presentation.surfaceClassName,
                  )}
                >
                  <Icon
                    className={cn("h-3.5 w-3.5", presentation.iconClassName)}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="theme-text block text-sm leading-5">{entry.summary}</span>
                  <span className="theme-text-muted mt-1 block truncate text-xs capitalize">
                    {activityContext(entry)}
                  </span>
                </span>
                <span className="theme-text-muted mt-0.5 shrink-0 text-[11px]">
                  {formatRelativeTime(entry.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
