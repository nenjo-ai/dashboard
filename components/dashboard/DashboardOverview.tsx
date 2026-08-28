"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { allChatSessionsUrl, fetcher } from "@/lib/api";
import {
  useActivity,
  useRecentExecutions,
  useWorkerStatus,
} from "@/lib/hooks";
import {
  selectDashboardSessions,
  summarizeDashboardExecutions,
} from "@/lib/dashboardOverview";
import type { ChatSessionExtended } from "@/lib/types";
import { useChatSessionIndicators } from "@/lib/useChatSessionIndicators";
import { DashboardActivityTimeline } from "./DashboardActivityTimeline";
import { DashboardContinueWorking } from "./DashboardContinueWorking";
import { DashboardQuickActions } from "./DashboardQuickActions";
import { DashboardWorkspaceSummary } from "./DashboardWorkspaceSummary";
import { TokenUsagePanel } from "./TokenUsagePanel";

export function DashboardOverview() {
  const { executions } = useRecentExecutions(undefined, 50);
  const { activity } = useActivity({ limit: 4 });
  const workerStatus = useWorkerStatus();
  const { data: sessions, isLoading: sessionsLoading } = useSWR<
    ChatSessionExtended[]
  >(allChatSessionsUrl(50, 0, "chat"), fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const sessionIds = useMemo(
    () => sessions?.map((session) => session.id) ?? [],
    [sessions],
  );
  const sessionIndicators = useChatSessionIndicators(sessionIds);

  const recentSessions = useMemo(
    () => selectDashboardSessions(sessions ?? [], sessionIndicators),
    [sessionIndicators, sessions],
  );
  const { activeCount, attentionCount, completedTodayCount } =
    summarizeDashboardExecutions(executions ?? []);
  const connectedWorkerCount = workerStatus.workers.filter(
    (worker) => worker.connected,
  ).length;
  const workerState = workerStatus.isLoading
    ? "checking"
    : workerStatus.isError
      ? "unavailable"
      : workerStatus.isConnected
        ? "connected"
        : "disconnected";

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
      <div className="lg:col-span-8">
        <DashboardWorkspaceSummary
          activeCount={activeCount}
          attentionCount={attentionCount}
          completedTodayCount={completedTodayCount}
          connectedWorkerCount={connectedWorkerCount}
          workerState={workerState}
        />
      </div>
      <div className="lg:col-span-4">
        <DashboardQuickActions />
      </div>

      <div className="lg:col-span-12">
        <DashboardContinueWorking
          sessions={recentSessions}
          indicators={sessionIndicators}
          isLoading={sessionsLoading}
        />
      </div>

      <div className="lg:col-span-5">
        <DashboardActivityTimeline activity={activity ?? []} />
      </div>
      <div className="lg:col-span-7">
        <TokenUsagePanel compact />
      </div>
    </div>
  );
}
