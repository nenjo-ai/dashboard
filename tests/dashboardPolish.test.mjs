import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  selectDashboardSessions,
  summarizeDashboardExecutions,
} from "../lib/dashboardOverview.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("councils route renders the real councils workspace", async () => {
  const source = await readSource("app/dashboard/councils/page.tsx");

  assert.match(source, /<CouncilsSection \/>/);
  assert.doesNotMatch(source, /redirect\(/);
});

test("mobile task filters are progressive disclosure with a clear action", async () => {
  const source = await readSource("components/tasks/TaskIndexClient.tsx");

  assert.match(source, /showFilters/);
  assert.match(source, /Filters/);
  assert.match(source, /clearFilters/);
  assert.match(source, /hidden.*lg:grid/);
});

test("dashboard loading feedback uses calm reduced-motion dots", async () => {
  const [button, loadingStatus, onboarding] = await Promise.all([
    readSource("components/ui/Button.tsx"),
    readSource("components/ui/LoadingStatus.tsx"),
    readSource("app/dashboard/onboarding/OnboardingContent.tsx"),
  ]);

  assert.match(button, /animate-loading-dot/);
  assert.match(loadingStatus, /role="status"/);
  assert.doesNotMatch(onboarding, /animate-spin/);
});

test("shared tabs no longer use the yellow active pill", async () => {
  const source = await readSource("components/ui/Tabs.tsx");

  assert.match(source, /theme-surface-elevated/);
  assert.doesNotMatch(source, /sunflower-gold/);
});

test("mobile agents retain an explicit creation workflow", async () => {
  const source = await readSource("components/agents/MobileAgentList.tsx");

  assert.match(source, /MobileAgentCreateDialog/);
  assert.match(source, /New agent/);
  assert.match(source, /Create agent/);
});

test("dashboard header uses cohesive floating utility chrome", async () => {
  const [topBar, orgSwitcher, sidebar, mobileHero, logoMark, pageContent] = await Promise.all([
    readSource("components/layout/TopBar.tsx"),
    readSource("components/layout/OrgSwitcher.tsx"),
    readSource("components/layout/Sidebar.tsx"),
    readSource("components/layout/MobileHeroBar.tsx"),
    readSource("components/layout/NenjoLogoMark.tsx"),
    readSource("components/ui/PageContent.tsx"),
  ]);

  assert.match(topBar, /aria-label="Workspace utilities"/);
  assert.match(topBar, /rounded-2xl border bg-white\/70/);
  assert.match(topBar, /PAGE_CONTENT_FRAME_CLASS/);
  assert.match(pageContent, /max-w-\[96rem\] px-4 md:px-6 lg:px-8/);
  assert.doesNotMatch(topBar, /pwa-topbar[^\"]*border-b/);
  assert.match(orgSwitcher, /h-9 min-w-0[\s\S]*rounded-xl/);
  assert.equal(
    sidebar.match(/flex h-16 items-center gap-3 px-6/g)?.length,
    2,
  );
  assert.equal(
    sidebar.match(/NenjoLogoMark className="h-8 w-5 rounded-lg"/g)?.length,
    2,
  );
  assert.equal(logoMark.match(/h-8\.5 w-8\.5 max-w-none shrink-0/g)?.length, 2);
  assert.doesNotMatch(logoMark, /translate-[xy]-/);
  assert.match(mobileHero, /bg-\[var\(--app-overlay\)\]/);
  assert.match(mobileHero, /backdrop-blur-2xl/);
});

test("projects is a flat primary navigation destination", async () => {
  const source = await readSource("components/layout/Sidebar.tsx");

  assert.match(
    source,
    /label: "Projects",\s*href: "\/dashboard\/projects",\s*icon:/,
  );
  assert.doesNotMatch(source, /collapsible|ProjectSubmenu|projectsExpanded/);
  assert.doesNotMatch(source, /projectsUrl|catalogFetcher|CreateProjectModal/);
  assert.doesNotMatch(source, /Collapse projects|Expand projects|New project/);
});

test("dashboard execution summary keeps lifecycle groups mutually understandable", () => {
  const now = new Date(2026, 7, 24, 14, 0, 0);
  const today = new Date(2026, 7, 24, 10, 0, 0).toISOString();
  const yesterday = new Date(2026, 7, 23, 18, 0, 0).toISOString();
  const execution = (status, overrides = {}) => ({
    status,
    pending_reviews: 0,
    completed_at: null,
    ...overrides,
  });

  const summary = summarizeDashboardExecutions(
    [
      execution("pending"),
      execution("queued"),
      execution("running"),
      execution("paused"),
      execution("waiting_for_human"),
      execution("failed", { pending_reviews: 2 }),
      execution("completed", { completed_at: today }),
      execution("completed", { completed_at: yesterday }),
    ],
    now,
  );

  assert.deepEqual(summary, {
    activeCount: 4,
    attentionCount: 2,
    completedTodayCount: 1,
  });
});

test("dashboard continuation prioritizes running sessions before recency", () => {
  const session = (id, updatedAt) => ({ id, updated_at: updatedAt });
  const sessions = [
    session("recent", "2026-08-24T14:00:00.000Z"),
    session("running", "2026-08-22T14:00:00.000Z"),
    session("older", "2026-08-23T14:00:00.000Z"),
  ];

  const selected = selectDashboardSessions(
    sessions,
    {
      running: { status: "running", updatedAt: 1 },
      recent: { status: "completed", updatedAt: 2 },
    },
    2,
  );

  assert.deepEqual(
    selected.map((item) => item.id),
    ["running", "recent"],
  );
});

test("dashboard overview is organized around work, not equal metric cards", async () => {
  const [overview, summary, continuation, quickActions, activity, usage] =
    await Promise.all([
      readSource("components/dashboard/DashboardOverview.tsx"),
      readSource("components/dashboard/DashboardWorkspaceSummary.tsx"),
      readSource("components/dashboard/DashboardContinueWorking.tsx"),
      readSource("components/dashboard/DashboardQuickActions.tsx"),
      readSource("components/dashboard/DashboardActivityTimeline.tsx"),
      readSource("components/dashboard/TokenUsagePanel.tsx"),
    ]);

  assert.match(overview, /useWorkerStatus/);
  assert.match(overview, /useChatSessionIndicators/);
  assert.match(overview, /<TokenUsagePanel compact \/>/);
  assert.match(summary, /Workspace summary/);
  assert.match(summary, /motion-reduce:animate-none/);
  assert.match(continuation, /Continue working/);
  assert.match(continuation, /SessionStatusIndicator/);
  assert.match(quickActions, /New chat/);
  assert.match(quickActions, /label: "Project"/);
  assert.match(activity, /Recent activity/);
  assert.match(activity, /eventPresentation/);
  assert.match(usage, /compact \? "Usage" : "Token usage"/);
});
