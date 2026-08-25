"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CHAT_STREAM_SNAPSHOT_EVENT,
  loadChatStreamSnapshots,
  type ChatStreamClearSnapshot,
  type ChatStreamSnapshot,
} from "./chatStreamDurability";
import { STREAM_CHANNEL_NAME } from "./chat/constants";
import {
  reduceChatSessionIndicators,
  type ChatSessionIndicatorState,
} from "./chat/sessionIndicators";

type SessionIndicatorEvent = ChatStreamSnapshot | ChatStreamClearSnapshot;

function isSessionIndicatorEvent(value: unknown): value is SessionIndicatorEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "sessionId" in value &&
      "updatedAt" in value,
  );
}

export function useChatSessionIndicators(
  sessionIds: readonly string[],
): ChatSessionIndicatorState {
  const sessionKey = useMemo(
    () => Array.from(new Set(sessionIds)).sort().join("\u0000"),
    [sessionIds],
  );
  const [indicators, setIndicators] = useState<ChatSessionIndicatorState>({});

  useEffect(() => {
    const visibleSessionIds = new Set(
      sessionKey ? sessionKey.split("\u0000") : [],
    );
    let cancelled = false;
    let channel: BroadcastChannel | null = null;

    const applyEvent = (value: unknown) => {
      if (!isSessionIndicatorEvent(value)) return;
      if (!visibleSessionIds.has(value.sessionId)) return;
      setIndicators((current) =>
        reduceChatSessionIndicators(current, value),
      );
    };

    void loadChatStreamSnapshots().then((snapshots) => {
      if (cancelled) return;
      setIndicators((current) => {
        let next = current;
        for (const snapshot of snapshots) {
          if (visibleSessionIds.has(snapshot.sessionId)) {
            next = reduceChatSessionIndicators(next, snapshot);
          }
        }
        return next;
      });
    });

    try {
      channel = new BroadcastChannel(STREAM_CHANNEL_NAME);
      channel.addEventListener("message", (event) => applyEvent(event.data));
    } catch {
      channel = null;
    }

    const handleWindowSnapshot = (event: Event) => {
      applyEvent((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(CHAT_STREAM_SNAPSHOT_EVENT, handleWindowSnapshot);

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; snapshot?: unknown }
        | undefined;
      if (data?.type === "chat-stream-snapshot") applyEvent(data.snapshot);
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    }

    return () => {
      cancelled = true;
      channel?.close();
      window.removeEventListener(
        CHAT_STREAM_SNAPSHOT_EVENT,
        handleWindowSnapshot,
      );
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage,
        );
      }
    };
  }, [sessionKey]);

  return indicators;
}
