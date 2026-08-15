import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  approvalOptions,
  artifactPreviewKind,
  buildHumanDecision,
  normalizeArtifactMediaType,
  normalizeHumanReviewInputs,
  validateApprovalAnswers,
} from "../lib/humanReview.ts";

test("artifact media types select safe dashboard preview renderers", () => {
  assert.equal(normalizeArtifactMediaType("IMAGE/PNG; charset=binary"), "image/png");
  assert.equal(normalizeArtifactMediaType("not-a-media-type"), "application/octet-stream");
  assert.equal(artifactPreviewKind("image/svg+xml"), "unsupported");
  assert.equal(artifactPreviewKind("audio/mpeg"), "audio");
  assert.equal(artifactPreviewKind("video/mp4"), "video");
  assert.equal(artifactPreviewKind("application/pdf"), "pdf");
  assert.equal(artifactPreviewKind("text/markdown"), "markdown");
  assert.equal(artifactPreviewKind("application/problem+json"), "json");
  assert.equal(artifactPreviewKind("text/html"), "text");
  assert.equal(artifactPreviewKind("application/zip"), "unsupported");
});

test("legacy subject payloads remain readable after the edge-input migration", () => {
  const schema = { type: "object", properties: { summary: { type: "string" } } };
  assert.deepEqual(
    normalizeHumanReviewInputs({ summary: "Ready" }, [schema]),
    [{
      input: "legacy",
      source_name: "Legacy review input",
      schema,
      value: { summary: "Ready" },
    }],
  );
});

const fields = [{
  id: "components",
  label: "Components",
  type: "multi_select",
  required: true,
  min_items: 1,
  max_items: 2,
  options: [{ value: "api", label: "API" }],
}];

test("approval controls use the materialized review form", () => {
  assert.deepEqual(approvalOptions(fields[0]), [{ value: "api", label: "API" }]);
});

test("approval validation enforces required selection cardinality", () => {
  assert.equal(validateApprovalAnswers(fields, {}), "Components is required");
  assert.equal(validateApprovalAnswers(fields, { components: ["api", "web", "worker"] }), "Components allows at most 2 selections");
  assert.equal(validateApprovalAnswers(fields, { components: ["api"] }), null);
});

test("decision construction keeps the outcome set closed and requires reviewer text", () => {
  assert.equal(buildHumanDecision("changes_requested", {}, "", "  "), "Change instructions are required");
  assert.equal(buildHumanDecision("rejected", {}, "", "  "), "A rejection reason is required");
  assert.deepEqual(buildHumanDecision("approved", { components: ["api"] }, " ship it ", ""), {
    outcome: "approved",
    answers: { components: ["api"] },
    comment: "ship it",
  });
});

test("editor exposes fixed outcomes and puts review schemas on incoming edges", async () => {
  const [node, panel, constants, editor] = await Promise.all([
    readFile(new URL("../components/routine/RoutineStepNode.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/routine/StepConfigPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/routine/constants.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/routine/RoutineEditor.tsx", import.meta.url), "utf8"),
  ]);
  for (const handle of ["human-approved", "human-changes-requested", "human-rejected"]) {
    assert.match(constants, new RegExp(handle));
  }
  assert.match(node, /HANDLE_HUMAN_APPROVED/);
  assert.match(node, /HANDLE_HUMAN_CHANGES/);
  assert.match(node, /HANDLE_HUMAN_REJECTED/);
  assert.doesNotMatch(panel, /eligible_scope|expires_at|timeout_outcome|quorum/);
  assert.match(editor, /requiresRouteHandoffSchema\(sourceData\?\.stepType\)/);
  assert.doesNotMatch(editor, /targetData\?\.stepType !== "human"/);
});

test("review response uses a singleton PUT resource and If-Match", async () => {
  const [api, platformProxy] = await Promise.all([
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/[...path]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(api, /method: "PUT"/);
  assert.match(api, /"If-Match"/);
  assert.match(api, /\/reviews\/\$\{reviewId\}\/response/);
  assert.match(platformProxy, /req\.headers\.get\("if-match"\)/);
  assert.match(platformProxy, /headers\.set\("if-match", ifMatch\)/);
});

test("waiting review is reachable from task and routine execution history", async () => {
  const [taskDetail, sharedHistory] = await Promise.all([
    readFile(new URL("../components/tasks/TaskDetailClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/tasks/TaskExecutionHistory.tsx", import.meta.url), "utf8"),
  ]);
  for (const surface of [taskDetail, sharedHistory]) {
    assert.match(surface, /pending_reviews > 0/);
    assert.match(surface, /\/dashboard\/reviews\?execution_id=/);
  }
});

test("review deep links preserve execution and task filters", async () => {
  const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /search\.set\("execution_id", executionId\)/);
  assert.match(api, /search\.set\("task_id", taskId\)/);
});

test("inbox has safe renderers, automatic artifact downloads, conflict refresh, and realtime recovery", async () => {
  const [inbox, artifactViewer, pdfPreview, artifactBrowser, api, artifactProxy, libraryTabs] = await Promise.all([
    readFile(new URL("../components/human-review/HumanReviewInbox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/artifacts/ArtifactViewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/human-review/PdfArtifactPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/library/artifacts/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/artifacts/[artifactId]/content/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/library/LibraryTabs.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(inbox, /ReactMarkdown/);
  assert.match(inbox, /nenjo-artifact-id/);
  assert.match(inbox, /ArtifactViewer/);
  assert.match(artifactViewer, /fetchArtifactContent/);
  assert.match(artifactViewer, /useLoadedArtifact/);
  assert.match(artifactViewer, /state\.key === key/);
  assert.match(artifactViewer, /controller\.abort/);
  assert.match(artifactViewer, /active = false/);
  assert.doesNotMatch(artifactViewer, /useSWRImmutable/);
  assert.doesNotMatch(artifactViewer, /mutateSWRCache/);
  assert.match(inbox, /artifactIds\.has\(value\)/);
  assert.match(inbox, /new Set\(detail\?\.artifact_ids/);
  assert.match(artifactViewer, /ArrowDownToLine/);
  assert.match(artifactViewer, /anchor\.download = artifact\.name/);
  assert.match(artifactViewer, /URL\.createObjectURL/);
  assert.match(artifactViewer, /URL\.revokeObjectURL/);
  assert.match(artifactViewer, /PdfArtifactPreview/);
  assert.match(artifactViewer, /ssr: false/);
  assert.doesNotMatch(artifactViewer, /<iframe/);
  assert.doesNotMatch(artifactViewer, /`data:/);
  assert.match(artifactBrowser, /fetchArtifactCatalog/);
  assert.match(artifactBrowser, /detail\.revisions\.map/);
  assert.match(artifactBrowser, /LibraryTabs/);
  assert.match(libraryTabs, /Knowledge Packs/);
  assert.match(libraryTabs, /Artifacts/);
  assert.match(api, /artifacts\/\$\{encodeURIComponent\(artifactId\)\}\/content/);
  assert.doesNotMatch(api, /fetch\(grant\.download_url\)/);
  assert.match(artifactProxy, /createPlatformToken/);
  assert.match(artifactProxy, /validateArtifactDownloadUrl\(grant\.download_url\)/);
  assert.match(artifactProxy, /objectResponse\.body/);
  assert.match(pdfPreview, /import\("pdfjs-dist"\)/);
  assert.match(pdfPreview, /pdf\.worker\.min\.mjs/);
  assert.match(pdfPreview, /maxImageSize: MAX_CANVAS_PIXELS/);
  assert.match(pdfPreview, /enableXfa: false/);
  assert.match(pdfPreview, /MAX_PDF_BYTES/);
  assert.match(pdfPreview, /MAX_CANVAS_PIXELS/);
  assert.match(pdfPreview, /renderTask\?\.cancel\(\)/);
  assert.match(pdfPreview, /void task\.destroy\(\)/);
  assert.match(inbox, /<Modal/);
  assert.match(inbox, /openDecision\("approved"\)/);
  assert.match(inbox, /openDecision\("changes_requested"\)/);
  assert.match(inbox, /activeOutcome === "approved"/);
  assert.match(inbox, /activeOutcome === "changes_requested"/);
  assert.doesNotMatch(inbox, /Required for requesting changes or rejecting/);
  assert.doesNotMatch(inbox, />Open<\/button>/);
  assert.match(inbox, /JSON\.stringify\(value, null, 2\)/);
  assert.match(inbox, /cause\.status === 409/);
  assert.match(inbox, /subscribeExecutionRealtime/);
  assert.match(inbox, /refreshInterval: 5000/);
});
