import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  viewSource,
  headerSource,
  sessionListSource,
  bubbleSource,
  composerSource,
  activitySource,
  areaSource,
  controllerSource,
  mobileShellSource,
  globalStylesSource,
] = await Promise.all([
  readSource("components/chat/ChatView.tsx"),
  readSource("components/chat/ChatConversationHeader.tsx"),
  readSource("components/chat/GlobalSessionList.tsx"),
  readSource("components/chat/ChatMessageBubble.tsx"),
  readSource("components/chat/ChatComposer.tsx"),
  readSource("components/chat/AssistantActivity.tsx"),
  readSource("components/chat/ChatArea.tsx"),
  readSource("lib/useChatController.ts"),
  readSource("components/chat/MobileChatShell.tsx"),
  readSource("app/globals.css"),
]);

test("desktop chat uses a cohesive conversation hierarchy", () => {
  assert.match(viewSource, /<ChatConversationHeader/);
  assert.match(headerSource, /session\.title \|\| targetName/);
  assert.match(headerSource, /SessionStatusIndicator/);
  assert.match(sessionListSource, /"Today" \| "Yesterday" \| "Earlier"/);
  assert.match(
    sessionListSource,
    /session\.title \|\| displayAgentName\(session\)/,
  );
  assert.match(sessionListSource, /Search conversations\.\.\./);
});

test("message alignment and composer controls form one restrained surface", () => {
  assert.match(bubbleSource, /flex-row-reverse/);
  assert.match(bubbleSource, /md:max-w-\[68%\]/);
  assert.match(bubbleSource, /md:max-w-\[44rem\]/);
  assert.match(composerSource, /rounded-2xl border bg-white/);
  assert.match(composerSource, /Esc twice to stop/);
  assert.doesNotMatch(
    composerSource,
    /animate-spin|Loader2|animate-cancel-pulse/,
  );
  assert.doesNotMatch(globalStylesSource, /cancel-pulse/);
});

test("activity is calm by default and reveals above the docked composer", () => {
  assert.match(activitySource, /useState\(false\)/);
  assert.match(activitySource, /rounded-full/);
  assert.match(activitySource, /rounded-xl/);
  assert.match(activitySource, /scrollIntoView/);
  assert.match(activitySource, /prefers-reduced-motion: reduce/);
});

test("session-scoped durability is the only lifecycle restore authority", () => {
  assert.match(controllerSource, /per-session IndexedDB checkpoint/);
  assert.doesNotMatch(
    controllerSource,
    /readPendingAgentId|readPersistedLivePreview|readPersistedTools/,
  );
  assert.doesNotMatch(
    controllerSource,
    /nenjo:pendingAgentId|nenjo:activeTools|nenjo:livePreview/,
  );
});

test("mobile labels the conversation and long histories skip offscreen layout", () => {
  assert.match(mobileShellSource, /activeSession\.title \|\|/);
  assert.match(areaSource, /--mobile-composer-dock-height/);
  assert.match(globalStylesSource, /\.chat-message-item/);
  assert.match(globalStylesSource, /content-visibility: auto/);
  assert.match(globalStylesSource, /contain-intrinsic-size: auto 120px/);
});
