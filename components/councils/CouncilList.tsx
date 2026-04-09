"use client";

import { cn } from "@/lib/cn";
import type { CouncilDetail } from "@/lib/types";
import { DELEGATION_STRATEGIES } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { MotionList, MotionItem } from "@/components/ui/motion";
import { Button } from "@/components/ui/Button";


interface CouncilListProps {
  councils: CouncilDetail[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onView: (council: CouncilDetail) => void;
  onCreate: () => void;
}

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

const STRATEGY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  dynamic: {
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-400",
  },
  broadcast: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-400",
  },
  decompose: {
    bg: "bg-deep-space-blue-50 dark:bg-deep-space-blue-900/30",
    text: "text-deep-space-blue-700 dark:text-deep-space-blue-300",
    dot: "bg-deep-space-blue-400",
  },
  round_robin: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  vote: {
    bg: "bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-400",
  },
};

function getStrategyLabel(strategy: string): string {
  return DELEGATION_STRATEGIES.find((s) => s.id === strategy)?.label ?? strategy;
}

function getStrategyColors(strategy: string) {
  return (
    STRATEGY_COLORS[strategy] ?? {
      bg: "bg-gray-50 dark:bg-gray-900",
      text: "text-gray-700 dark:text-gray-300",
      dot: "bg-gray-400",
    }
  );
}

// ---------------------------------------------------------------------------
// Skeletons & Empty State
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 dark:border-gray-600 dark:bg-gray-800">
      <div className="rounded-full bg-deep-space-blue-50 p-4 dark:bg-deep-space-blue-900/50">
        <svg
          className="h-10 w-10 text-deep-space-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        No councils yet
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
        Create your first agent council to enable multi-agent collaboration.
        Councils group agents with a leader and configurable delegation strategies.
      </p>
      <Button onClick={onCreate} className="mt-6">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Council
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Council Card
// ---------------------------------------------------------------------------

function CouncilCard({
  council,
  onView,
}: {
  council: CouncilDetail;
  onView: (council: CouncilDetail) => void;
}) {
  const strategyColors = getStrategyColors(council.delegation_strategy);

  return (
    <button
      type="button"
      onClick={() => onView(council)}
      className={cn(
        "w-full rounded-xl border border-gray-200 bg-white p-5 shadow-xs text-left transition-all",
        "hover:border-deep-space-blue-300 hover:shadow-md",
        "dark:border-gray-700 dark:bg-gray-800 dark:hover:border-deep-space-blue-700",
        "focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep-space-blue-100 dark:bg-deep-space-blue-900/50">
          <svg
            className="h-5 w-5 text-deep-space-blue-600 dark:text-deep-space-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">
            {council.name}
          </h3>
          {council.description && (
            <p className="mt-0.5 text-xs text-gray-500 truncate dark:text-gray-400">
              {council.description}
            </p>
          )}
        </div>
      </div>

      {/* Strategy & Member Count */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            strategyColors.bg,
            strategyColors.text,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", strategyColors.dot)} />
          {getStrategyLabel(council.delegation_strategy)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            />
          </svg>
          {council.members?.length ?? 0} member{(council.members?.length ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Leader */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <svg
          className="h-3.5 w-3.5 text-deep-space-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
        <span className="truncate">
          Leader: <span className="font-medium text-gray-700 dark:text-gray-300">{council.leader_agent?.name ?? "Unknown"}</span>
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CouncilList({
  councils,
  isLoading,
  isError,
  onView,
  onCreate,
}: CouncilListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
        <svg
          className="h-10 w-10 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Failed to load councils
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  if (!councils || councils.length === 0) {
    return <EmptyState onCreate={onCreate} />;
  }

  return (
    <MotionList className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {councils.map((council) => (
        <MotionItem key={council.id}>
          <CouncilCard council={council} onView={onView} />
        </MotionItem>
      ))}
    </MotionList>
  );
}
