import { CalendarClock, CheckCircle2, CircleDot, ListTodo } from "lucide-react";

import type { TaskWorkspaceSummary } from "@/lib/taskWorkspace";

const metrics = [
  { key: "inProgressCount", label: "In progress", icon: CircleDot, accent: "text-blue-600 dark:text-blue-400" },
  { key: "readyCount", label: "Ready", icon: ListTodo, accent: "text-violet-600 dark:text-violet-400" },
  { key: "scheduledCount", label: "Scheduled", icon: CalendarClock, accent: "text-amber-600 dark:text-amber-400" },
  { key: "completedCount", label: "Completed", icon: CheckCircle2, accent: "text-emerald-600 dark:text-emerald-400" },
] as const;

export function TaskWorkspaceSummary({ summary }: { summary: TaskWorkspaceSummary }) {
  return (
    <section className="theme-surface theme-border overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.03)]" aria-label="Task summary">
      <div className="grid grid-cols-2 divide-x divide-y theme-border sm:grid-cols-4 sm:divide-y-0">
        {metrics.map(({ key, label, icon: Icon, accent }) => (
          <div className="min-w-0 px-4 py-4 sm:px-5" key={key}>
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${accent}`} aria-hidden="true" />
              <span className="theme-text-muted text-xs font-medium">{label}</span>
            </div>
            <p className="theme-text mt-2 text-2xl font-semibold tracking-[-0.03em]">{summary[key]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
