import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getProjectReadiness,
  selectProjectSessions,
  summarizeProjectExecutions,
} from "../lib/projectOverview.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("project overview filters conversations and keeps running work first", () => {
  const session = (id, projectId, updatedAt) => ({ id, project_id: projectId, updated_at: updatedAt });
  const selected = selectProjectSessions(
    [
      session("other-project", "project-b", "2026-08-24T15:00:00.000Z"),
      session("recent", "project-a", "2026-08-24T14:00:00.000Z"),
      session("running", "project-a", "2026-08-22T14:00:00.000Z"),
    ],
    "project-a",
    { running: { status: "running", updatedAt: 1 } },
  );

  assert.deepEqual(selected.map((item) => item.id), ["running", "recent"]);
});

test("project pulse derives lifecycle and readiness from authoritative data", () => {
  const now = new Date(2026, 7, 24, 14, 0, 0);
  const summary = summarizeProjectExecutions(
    [
      { status: "running", pending_reviews: 0, completed_at: null },
      { status: "waiting_for_human", pending_reviews: 1, completed_at: null },
      { status: "completed", pending_reviews: 0, completed_at: new Date(2026, 7, 24, 10).toISOString() },
    ],
    now,
  );
  const readiness = getProjectReadiness({ settings: { context: "# Goals", repo_url: "https://example.com/repo.git" } });

  assert.deepEqual(summary, { activeCount: 1, attentionCount: 1, completedTodayCount: 1 });
  assert.deepEqual(readiness, { hasContext: true, hasRepository: true });
});

test("project details use one responsive functional surface with Overview as default", async () => {
  const [client, tabs, fallback] = await Promise.all([
    readSource("app/dashboard/projects/[id]/ProjectDetailClient.tsx"),
    readSource("components/ui/Tabs.tsx"),
    readSource("app/dashboard/projects/[id]/page.tsx"),
  ]);

  assert.match(client, /useTabParam<ProjectTabId>\("overview"/);
  assert.match(client, /<ProjectOverviewTab project={project}/);
  assert.match(client, /mobileVariant="scroll"/);
  assert.match(client, /dynamic\(/);
  assert.doesNotMatch(client, /MobileProjectDetail|ProjectHeader|animate-spin/);
  assert.match(tabs, /mobileVariant === "select"/);
  assert.doesNotMatch(fallback, /animate-spin/);
});

test("masthead stays focused while Settings owns repository and destructive controls", async () => {
  const [masthead, settings] = await Promise.all([
    readSource("components/project/ProjectMasthead.tsx"),
    readSource("components/project/ProjectSettingsTab.tsx"),
  ]);

  assert.match(masthead, /Open in chat/);
  assert.match(masthead, /ProjectChatLauncher/);
  assert.doesNotMatch(masthead, /deleteProject|disconnectRepo|syncRepo/);
  assert.match(settings, /No repository connected/);
  assert.match(settings, /Danger zone/);
  assert.match(settings, /Delete project/);
  assert.match(settings, /metadataDirty/);
});

test("context editor has calm references, starters, save state, and keyboard save", async () => {
  const [context, references] = await Promise.all([
    readSource("components/project/ProjectContextTab.tsx"),
    readSource("components/agents/TemplateVariableReference.tsx"),
  ]);

  assert.match(context, /CONTEXT_STARTERS/);
  assert.match(context, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(context, /Unsaved changes/);
  assert.match(context, /defaultCollapsed/);
  assert.match(context, /searchable/);
  assert.match(references, /Search references/);
  assert.match(references, /defaultCollapsed/);
  assert.doesNotMatch(references, /animate-spin/);
});
