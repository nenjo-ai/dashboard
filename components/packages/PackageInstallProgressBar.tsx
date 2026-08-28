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
  const phase = packageInstallPhaseLabel(progress.phase);

  return (
    <div
      className={cn("space-y-1.5", className)}
      role="status"
      aria-live="polite"
      aria-label={`${phase}, ${percent}% complete`}
    >
      <div
        className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={phase}
      >
        <div
          className="h-full rounded-full bg-deep-space-blue-600 transition-[width] duration-300 motion-reduce:transition-none dark:bg-deep-space-blue-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="animate-loading-dot h-1 w-1 rounded-full bg-current motion-reduce:animate-none"
                style={{ animationDelay: `${dot * 120}ms` }}
              />
            ))}
          </span>
          {phase}
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}

function packageInstallPhaseLabel(phase: string): string {
  const normalized = phase.trim().toLowerCase().replaceAll("_", " ");
  const labels: Record<string, string> = {
    queued: "Waiting for worker",
    resolving: "Resolving package",
    downloading: "Downloading package",
    validating: "Validating manifest",
    dependencies: "Checking dependencies",
    installing: "Installing resources",
    finalizing: "Finalizing install",
    completed: "Package installed",
  };
  return labels[normalized] ?? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
