import { cn } from "@/lib/cn";
import type { PackageInstallProgress } from "@/lib/types";

export type { PackageInstallProgress } from "@/lib/types";

export function PackageInstallProgressBar({
  progress,
  className,
}: {
  progress: PackageInstallProgress;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, progress.progressPercent));

  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-deep-space-blue-600 transition-all dark:bg-deep-space-blue-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="truncate capitalize">{progress.phase}</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
