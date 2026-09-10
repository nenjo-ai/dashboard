import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { compactDuplicateChatMessages } from "../lib/chat/derivations.ts";
import { normalizeLegacyNotificationUrl } from "../lib/chat/notificationNavigation.ts";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [viewSource, bubbleSource, controllerSource, topBarSource, apiSource] =
  await Promise.all([
    readSource("components/chat/ChatView.tsx"),
    readSource("components/chat/ChatMessageBubble.tsx"),
    readSource("lib/useChatController.ts"),
    readSource("components/layout/TopBar.tsx"),
    readSource("lib/api.ts"),
  ]);

test("agent updates render in the normal transcript with a restrained distinction", () => {
  assert.match(controllerSource, /metadata\?\.kind !== "agent_update"/);
  assert.match(controllerSource, /agentUpdate: persistedAgentUpdate/);
  assert.match(controllerSource, /record\.body/);
  assert.match(bubbleSource, /<span>Agent update<\/span>/);
  assert.match(bubbleSource, /message\.agentUpdate\?\.link/);
});

test("an assistant reply repeating update text remains a separate message", () => {
  const timestamp = new Date().toISOString();
  const messages = compactDuplicateChatMessages([
    {
      id: "shared-local-id",
      persistedId: "update-row",
      role: "assistant",
      content: "Unified agent update verified.",
      timestamp,
      agentUpdate: { severity: "info" },
    },
    {
      id: "shared-local-id",
      persistedId: "reply-row",
      role: "assistant",
      content: "Unified agent update verified.",
      timestamp,
    },
  ]);

  assert.equal(messages.length, 2);
  assert.equal(messages.filter((message) => message.agentUpdate).length, 1);
});

test("chat owns unread navigation and read cleanup", () => {
  assert.match(topBarSource, /unread\?\.by_agent\[0\]\?\.session_id/);
  assert.match(viewSource, /unreadCounts=\{unreadCounts\}/);
  assert.match(viewSource, /markChatSessionRead\(selectedSessionId\)/);
  assert.match(apiSource, /chat-sessions\/\$\{sessionId\}\/read/);
});

test("legacy notification URLs normalize into chat and no dedicated surface remains", async () => {
  assert.equal(normalizeLegacyNotificationUrl("/dashboard/chat", "channel=notifications&session=source-session"), "/dashboard/chat?session=source-session");
  assert.equal(normalizeLegacyNotificationUrl("/dashboard/chat", "channel=notifications"), "/dashboard/chat");
  assert.equal(normalizeLegacyNotificationUrl("/dashboard/chat", "session=source-session"), null);
  assert.doesNotMatch(viewSource, /NotificationArea|MobileNotificationContainer/);
  await assert.rejects(
    access(new URL("../components/chat/NotificationArea.tsx", import.meta.url)),
  );
  await assert.rejects(
    access(
      new URL("../components/chat/MobileNotificationContainer.tsx", import.meta.url),
    ),
  );
});
