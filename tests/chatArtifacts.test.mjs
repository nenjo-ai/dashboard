import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chatArtifactCacheContainsAny,
  chatArtifactDetailsCacheKey,
  chatArtifactSupport,
  sessionArtifactIds,
  withoutDeletedArtifactDetails,
} from "../lib/chatArtifacts.ts";

const agent = { id: "agent-1", model_id: "model-1" };

test("chat attachments require assigned, default, or direct analysis support", () => {
  assert.deepEqual(chatArtifactSupport(agent, [], [], []), {
    canAttach: false,
    canAnalyzeDocument: false,
    canAnalyzeImage: false,
  });

  assert.equal(chatArtifactSupport(agent, [], [{
    capability: "analyze_document",
  }], []).canAnalyzeDocument, true);
  assert.equal(chatArtifactSupport(agent, [], [], [{
    capability: "analyze_image",
  }]).canAnalyzeImage, true);
  assert.deepEqual(chatArtifactSupport(agent, [{
    id: "model-1",
    input_modalities: ["file", "image"],
  }], [], []), {
    canAttach: true,
    canAnalyzeDocument: true,
    canAnalyzeImage: true,
  });
});

test("session artifact references retain message order without duplicates", () => {
  assert.deepEqual(sessionArtifactIds([
    { artifactIds: ["artifact-1", "artifact-2"] },
    { artifactIds: undefined },
    { artifactIds: ["artifact-2", "artifact-3"] },
  ]), ["artifact-1", "artifact-2", "artifact-3"]);
});

test("chat artifact caches are tenant-scoped and evict deleted lineage members", () => {
  const key = chatArtifactDetailsCacheKey("org-1", ["artifact-1", "artifact-2"]);
  assert.deepEqual(key, [
    "chat-artifact-details",
    "org-1",
    "artifact-1",
    "artifact-2",
  ]);
  assert.equal(chatArtifactCacheContainsAny(key, ["artifact-2"]), true);
  assert.equal(chatArtifactCacheContainsAny(key, ["artifact-3"]), false);
  assert.equal(chatArtifactCacheContainsAny("chat-artifact-details", ["artifact-1"]), false);

  assert.deepEqual(withoutDeletedArtifactDetails([
    { artifact: { id: "artifact-1" } },
    { artifact: { id: "artifact-2" } },
  ], ["artifact-1"]), [
    { artifact: { id: "artifact-2" } },
  ]);
});

test("deleted artifact metadata is omitted instead of rendering a fallback pill", async () => {
  const source = await readFile(
    new URL("../components/artifacts/ChatArtifactAttachments.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /cause instanceof ApiError && cause\.status === 404/);
  assert.match(source, /visibleArtifactIds\.length === 0/);
  assert.match(source, /chatArtifactDetailsCacheKey\(activeOrgId, artifactIds\)/);
});

test("desktop chat keeps the attachment control with the turn controls", async () => {
  const areaSource = await readFile(
    new URL("../components/chat/ChatArea.tsx", import.meta.url),
    "utf8",
  );
  const composerSource = await readFile(
    new URL("../components/chat/ChatComposer.tsx", import.meta.url),
    "utf8",
  );
  const button = composerSource.indexOf("<ArtifactAttachmentButton");
  const cancel = composerSource.indexOf("<ChatCancelControl");
  const send = composerSource.indexOf("<Button", cancel);

  assert.ok(button >= 0);
  assert.ok(cancel > button);
  assert.ok(send > cancel);
  assert.match(composerSource, /disabled=\{attachmentDisabled\}/);
  assert.match(areaSource, /<SessionArtifactAttachments messages=\{messages\}/);
});
