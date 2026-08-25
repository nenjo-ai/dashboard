import Link from "next/link";
import {
  Bot,
  FolderPlus,
  ListPlus,
  MessageSquarePlus,
  type LucideIcon,
} from "lucide-react";

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
  iconSurfaceClassName: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "New chat",
    href: "/dashboard/chat",
    icon: MessageSquarePlus,
    iconClassName: "text-blue-600 dark:text-blue-300",
    iconSurfaceClassName: "bg-blue-500/10",
  },
  {
    label: "Project",
    href: "/dashboard/projects",
    icon: FolderPlus,
    iconClassName: "text-violet-600 dark:text-violet-300",
    iconSurfaceClassName: "bg-violet-500/10",
  },
  {
    label: "New task",
    href: "/dashboard/tasks",
    icon: ListPlus,
    iconClassName: "text-emerald-600 dark:text-emerald-300",
    iconSurfaceClassName: "bg-emerald-500/10",
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    icon: Bot,
    iconClassName: "text-amber-600 dark:text-amber-300",
    iconSurfaceClassName: "bg-amber-500/10",
  },
];

export function DashboardQuickActions() {
  return (
    <section className="theme-border theme-surface h-full rounded-[1.4rem] border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div>
        <h2 className="theme-text text-sm font-semibold">Quick actions</h2>
        <p className="theme-text-muted mt-1 text-sm">
          Start something without hunting through navigation.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="group min-w-0 rounded-xl border border-transparent p-3 transition-[background-color,border-color] hover:border-black/[0.055] hover:[background:var(--app-hover)] dark:hover:border-white/[0.08]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.iconSurfaceClassName}`}
              >
                <Icon className={`h-4 w-4 ${action.iconClassName}`} aria-hidden="true" />
              </span>
              <span className="theme-text mt-2 block truncate text-xs font-semibold sm:text-sm lg:text-xs xl:text-sm">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
