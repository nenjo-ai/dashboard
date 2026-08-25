import type { ChatSessionIndicatorState } from "./chat/sessionIndicators.ts";
import type { ChatSessionExtended, ExecutionDetails, Project } from "./types.ts";
import {
  selectDashboardSessions,
  summarizeDashboardExecutions,
} from "./dashboardOverview.ts";

export function selectProjectSessions(
  sessions: readonly ChatSessionExtended[],
  projectId: string,
  indicators: ChatSessionIndicatorState,
  limit = 4,
): ChatSessionExtended[] {
  return selectDashboardSessions(
    sessions.filter((session) => session.project_id === projectId),
    indicators,
    limit,
  );
}

export function summarizeProjectExecutions(
  executions: readonly ExecutionDetails[],
  now = new Date(),
) {
  return summarizeDashboardExecutions(executions, now);
}

export function getProjectReadiness(project: Project) {
  const settings = project.settings as Record<string, unknown>;
  const context = settings.context;
  const repoUrl = settings.repo_url;

  return {
    hasContext: typeof context === "string" && context.trim().length > 0,
    hasRepository: typeof repoUrl === "string" && repoUrl.trim().length > 0,
  };
}
