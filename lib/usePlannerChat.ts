"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  authRequestHeaders,
  chatStreamsUrl,
  fetchChatMessages,
  deleteChatMessage,
  createChatStream,
  cancelChat,
  createDomainSession,
  completeDomainSession,
  cancelDomainSession,
  enterChatDomain,
  exitChatDomain,
  fetchActiveDomainSession,
  fetchChatSessions,
  createChatSession,
  updateChatSession,
  archiveChatSession,
  deleteChatSession,
  notifyChatSessionDelete,
} from "./api";
import { consumeSseStream } from "./chatStream";
import {
  decryptContentPayload,
  encryptContentPayload,
  loadStoredAccountContentKey,
  warmAccountContentKey,
} from "./cryptoContent";
import { useCurrentUser } from "./hooks";
import { toast } from "./toast";
import {
  clearChatStreamSnapshot,
  type ChatStreamSnapshot,
  loadChatStreamSnapshot,
  notifyChatStreamSnapshot,
  persistChatStreamSnapshot,
} from "./chatStreamDurability";
import type {
  ChatMessage,
  ChatSession,
  DomainSession,
  EncryptedPayload,
  PersistedChatMessage,
} from "./types";

type NormalizedStreamEvent = {
  event_type: string;
  data: Record<string, unknown>;
};

function isAbilityTool(name: string): boolean {
  return name.startsWith("ability/");
}

function appendPreview(existing?: string, incoming?: string): string | undefined {
  const next = incoming?.trim();
  if (!next) return existing;
  const prev = existing?.trim();
  return prev ? `${prev}\n\n${next}` : next;
}

const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
const PENDING_AGENT_KEY = "nenjo:pendingAgentId";
const TOOLS_KEY = "nenjo:activeTools";
const LIVE_PREVIEW_KEY = "nenjo:livePreview";
const STREAM_CHANNEL_NAME = "nenjo-chat-stream";

function isClearSnapshot(
  snapshot: ChatStreamSnapshot | { sessionId: string; clear: true },
): snapshot is { sessionId: string; clear: true } {
  return "clear" in snapshot && snapshot.clear === true;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function readPendingAgentId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_AGENT_KEY);
  } catch {
    return null;
  }
}

function writePendingAgentId(agentId: string | null): void {
  try {
    if (agentId) {
      sessionStorage.setItem(PENDING_AGENT_KEY, agentId);
    } else {
      sessionStorage.removeItem(PENDING_AGENT_KEY);
    }
  } catch {
    // ignore
  }
}

function readPersistedTools() {
  try {
    const raw = sessionStorage.getItem(TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePersistedTools(tools: unknown[]): void {
  try {
    if (tools.length > 0) {
      sessionStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
    } else {
      sessionStorage.removeItem(TOOLS_KEY);
    }
  } catch {
    // ignore
  }
}

function readPersistedLivePreview(): string | undefined {
  try {
    return sessionStorage.getItem(LIVE_PREVIEW_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writePersistedLivePreview(preview?: string): void {
  try {
    const next = preview?.trim();
    if (next) {
      sessionStorage.setItem(LIVE_PREVIEW_KEY, next);
    } else {
      sessionStorage.removeItem(LIVE_PREVIEW_KEY);
    }
  } catch {
    // ignore
  }
}

function normalizeSseAgentEvent(event: { event: string; data: unknown }): NormalizedStreamEvent | null {
  if (typeof event.data === "object" && event.data !== null) {
    const maybeWrapped = event.data as { event_type?: unknown; data?: unknown };
    if (typeof maybeWrapped.event_type === "string") {
      return {
        event_type: maybeWrapped.event_type,
        data: (maybeWrapped.data as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  const eventTypeMap: Record<string, string> = {
    tool_calls: "ToolCalls",
    tool_completed: "ToolCompleted",
    ability_activated: "AbilityActivated",
    ability_completed: "AbilityCompleted",
    done: "Done",
    error: "Error",
    domain_entered: "DomainEntered",
    domain_exited: "DomainExited",
    message_compacted: "MessageCompacted",
    paused: "Paused",
    resumed: "Resumed",
  };

  const event_type = eventTypeMap[event.event];
  if (!event_type || typeof event.data !== "object" || event.data === null) {
    return null;
  }

  return {
    event_type,
    data: event.data as Record<string, unknown>,
  };
}

interface AgentCache {
  messages: ChatMessage[];
  hasMore: boolean;
}

function findLastIndexCompat<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index, items)) {
      return index;
    }
  }
  return -1;
}

function findLastCompat<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => boolean,
): T | undefined {
  const index = findLastIndexCompat(items, predicate);
  return index >= 0 ? items[index] : undefined;
}

function mergeLoadedMessages(loaded: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const merged = [...loaded];
  const seen = new Set(loaded.map((message) => message.persistedId ?? message.id));

  for (const message of current) {
    const key = message.persistedId ?? message.id;
    if (seen.has(key)) continue;
    const duplicateLoadedMessage = loaded.find((loadedMessage) => {
      if (loadedMessage.role !== message.role) return false;
      if (loadedMessage.content !== message.content) return false;

      const loadedTime = new Date(loadedMessage.timestamp).getTime();
      const currentTime = new Date(message.timestamp).getTime();
      return Math.abs(loadedTime - currentTime) < 120_000;
    });
    if (duplicateLoadedMessage) continue;
    merged.push(message);
    seen.add(key);
  }

  return merged.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function isRecentMatch(a: ChatMessage, bTimestamp: string, windowMs = 120_000): boolean {
  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(bTimestamp).getTime();
  return Math.abs(aTime - bTime) < windowMs;
}

function isLikelySameAssistantContent(existing: string, incoming: string): boolean {
  if (existing === incoming) return true;
  if (!existing || !incoming) return false;
  return incoming.startsWith(existing) || existing.startsWith(incoming);
}

function normalizeResolvedAssistantContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return content;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const finalOutput = record.final_output ?? record.message ?? record.text ?? record.output;
      if (typeof finalOutput === "string") {
        return finalOutput;
      }
    }
  } catch {
    // Keep the original plaintext if it is not JSON-encoded.
  }

  return content;
}

async function resolvePersistedMessageContent(
  message: Pick<PersistedChatMessage, "content" | "metadata">,
): Promise<string> {
  const encryptedPayload = message.metadata?.encrypted_payload;
  if (!encryptedPayload) {
    return normalizeResolvedAssistantContent(message.content);
  }

  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted !== null) {
      return normalizeResolvedAssistantContent(decrypted);
    }
    console.warn("Persisted chat decrypt returned null", {
      hasAck: Boolean(storedAck),
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    await warmAccountContentKey();
    const retried = await decryptContentPayload(encryptedPayload);
    if (retried !== null) {
      return normalizeResolvedAssistantContent(retried);
    }
    return message.content.trim()
      ? normalizeResolvedAssistantContent(message.content)
      : "[Encrypted assistant message could not be decrypted]";
  } catch (error) {
    console.warn("Failed to decrypt persisted chat content", {
      error,
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    return message.content.trim()
      ? normalizeResolvedAssistantContent(message.content)
      : "[Encrypted assistant message could not be decrypted]";
  }
}

async function resolveEncryptedPreview(
  plaintext: string | undefined,
  encryptedPayload?: EncryptedPayload,
): Promise<string | undefined> {
  if (encryptedPayload) {
    try {
      const storedAck = await loadStoredAccountContentKey();
      const decrypted = await decryptContentPayload(encryptedPayload);
      if (decrypted) return normalizeResolvedAssistantContent(decrypted);
      console.warn("Live preview decrypt returned null", {
        hasAck: Boolean(storedAck),
        accountId: encryptedPayload.account_id,
        objectId: encryptedPayload.object_id,
        objectType: encryptedPayload.object_type,
        algorithm: encryptedPayload.algorithm,
        keyVersion: encryptedPayload.key_version,
      });
      await warmAccountContentKey();
      const retried = await decryptContentPayload(encryptedPayload);
      if (retried) return normalizeResolvedAssistantContent(retried);
    } catch (error) {
      console.warn("Failed to decrypt live preview", {
        error,
        accountId: encryptedPayload.account_id,
        objectId: encryptedPayload.object_id,
        objectType: encryptedPayload.object_type,
        algorithm: encryptedPayload.algorithm,
        keyVersion: encryptedPayload.key_version,
      });
    }
  }
  const trimmed = plaintext?.trim();
  return trimmed ? normalizeResolvedAssistantContent(trimmed) : undefined;
}

async function resolveEncryptedPayloadJson<T extends Record<string, unknown>>(
  encryptedPayload?: EncryptedPayload,
): Promise<Partial<T> | undefined> {
  if (!encryptedPayload) return undefined;
  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted) {
      return JSON.parse(decrypted) as Partial<T>;
    }
    console.warn("Encrypted payload JSON decrypt returned null", {
      hasAck: Boolean(storedAck),
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    await warmAccountContentKey();
    const retried = await decryptContentPayload(encryptedPayload);
    if (retried) {
      return JSON.parse(retried) as Partial<T>;
    }
  } catch (error) {
    console.warn("Failed to decrypt encrypted payload JSON", {
      error,
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
  }
  return undefined;
}

export function usePlannerChat(projectId: string, agentId?: string, initialSessionId?: string) {
  const { userId } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [livePreview, setLivePreview] = useState<string | undefined>(undefined);
  const status = "connected";

  // Initialize from pendingAgentId so the typing indicator is correct on the
  // very first render after remount — no useEffect delay.
  // Only show typing if THIS role is the one with a pending response.
  const [isTyping, setIsTyping] = useState(
    () => !!agentId && readPendingAgentId() === agentId,
  );

  useEffect(() => {
    void warmAccountContentKey();
  }, []);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTools, setActiveTools] = useState<{ name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string }[] }[]>(
    () => (!!agentId && readPendingAgentId() === agentId)
      ? readPersistedTools() as { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string }[] }[]
      : [],
  );
  const [activeDomainSession, setActiveDomainSession] = useState<DomainSession | null>(null);
  const activeDomainSessionRef = useRef<DomainSession | null>(null);
  const [isDomainPending, setIsDomainPending] = useState(false);
  // Pending domain session — kept only while waiting for backend domain-session creation.
  const pendingDomainSessionRef = useRef<DomainSession | null>(null);
  // After a local exit/cancel succeeds, suppress backend "active domain" restore
  // for this project+agent until the user explicitly enters a domain again.
  const suppressedDomainRestoreRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeDomainSessionRef.current = activeDomainSession;
  }, [activeDomainSession]);

  useEffect(() => {
    return () => {
      if (clearTypingUiTimeoutRef.current) {
        clearTimeout(clearTypingUiTimeoutRef.current);
      }
    };
  }, []);

  // ── Session state ────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [internalSessionId, setInternalSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // When initialSessionId is provided (consolidated chat view), use it directly
  // instead of going through async state updates. This avoids race conditions.
  const activeSessionId = initialSessionId ?? internalSessionId;
  const setActiveSessionId = setInternalSessionId;

  // Stable response ID set when the user sends a message so the final
  // assistant event targets the same message consistently.
  const responseIdRef = useRef<string | null>(null);
  const responsePersistedRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const clearTypingUiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monotonic counter for history fetches — only the latest fetch can update state.
  // This handles React Strict Mode double-mount and rapid session switching.
  const historyFetchIdRef = useRef(0);

  // Role+session-keyed message cache to avoid re-fetching on every toggle
  const agentCacheRef = useRef<Map<string, AgentCache>>(new Map());

  // Track the previous agentId so we can save cache on switch
  const prevAgentIdRef = useRef<string | undefined>(undefined);
  const prevSessionIdRef = useRef<string | null>(null);

  // ── Stable subscriber via ref ──────────────────────────────────────────
  const handleIncomingRef = useRef<(raw: unknown) => void>(() => {});
  const optimisticUserMessageIdRef = useRef<string | null>(null);
  const awaitingDeliveryRef = useRef(false);

  const setTypingIfDelivered = useCallback(() => {
    if (!awaitingDeliveryRef.current) {
      setIsTyping(true);
    }
  }, []);

  const applyStreamSnapshot = useCallback((snapshot: ChatStreamSnapshot | { sessionId: string; clear: true }) => {
    if (!activeSessionId || snapshot.sessionId !== activeSessionId) {
      return;
    }

    if (isClearSnapshot(snapshot)) {
      responseIdRef.current = null;
      responsePersistedRef.current = false;
      setActiveTools([]);
      setLivePreview(undefined);
      setIsTyping(false);
      return;
    }

    const responseId = snapshot.responseId ?? snapshot.requestId;
    responseIdRef.current = responseId;
    responsePersistedRef.current = false;
    setIsTyping(snapshot.status === "streaming");
    setMessages((prev) => {
      const targetIndex = findLastIndexCompat(
        prev,
        (message) =>
          message.id === responseId
          || message.persistedId === responseId
          || (message.role === "assistant" && message.id === snapshot.requestId),
      );

      if (targetIndex >= 0) {
        return prev.map((message, index) =>
          index === targetIndex
            ? {
                ...message,
                id: responseId,
                content: snapshot.content,
                timestamp: new Date(snapshot.updatedAt).toISOString(),
              }
            : message,
        );
      }

      if (!snapshot.content.trim()) {
        return prev;
      }

      return [
        ...prev,
        {
          id: responseId,
          role: "assistant",
          content: snapshot.content,
          timestamp: new Date(snapshot.updatedAt).toISOString(),
        },
      ];
    });
  }, [activeSessionId]);

  // Cache key includes session ID
  const cacheKey = useCallback(
    (rId: string, sId?: string | null) => `${rId}:${sId ?? "none"}`,
    [],
  );
  const domainRestoreKey = useCallback(
    (pId: string, aId: string) => `${pId}:${aId}`,
    [],
  );

  // ── Load sessions on mount / role change ──────────────────────────────
  useEffect(() => {
    if (!projectId || !agentId) {
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    // When an initialSessionId is provided (e.g. from the consolidated chat
    // view), skip fetching sessions and auto-selection — activeSessionId is
    // already derived directly from the prop.
    if (initialSessionId) {
      return;
    }

    setIsLoadingSessions(true);
    fetchChatSessions(projectId, agentId)
      .then(async (fetched) => {
        setSessions(fetched);
        // Pick most recent non-archived session, or auto-create one
        const active = fetched.find((s) => !s.archived_at);
        if (active) {
          setActiveSessionId(active.id);
        } else {
          try {
            const session = await createChatSession({
              project_id: projectId,
              agent_id: agentId,
            });
            setSessions((prev) => [session, ...prev]);
            setActiveSessionId(session.id);
          } catch (err) {
            console.error("Failed to auto-create session:", err);
            setActiveSessionId(null);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load sessions:", err);
        setSessions([]);
        setActiveSessionId(null);
      })
      .finally(() => setIsLoadingSessions(false));
  }, [projectId, agentId, initialSessionId]);

  // ── Load history on mount / role / session change ─────────────────────
  useEffect(() => {
    const previousAgentId = prevAgentIdRef.current;
    const previousSessionId = prevSessionIdRef.current;
    const sessionChanged = previousAgentId !== agentId || previousSessionId !== activeSessionId;
    const pendingAgentId = readPendingAgentId();
    const persistedActiveTools = readPersistedTools() as { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string }[] }[];
    const persistedLivePreview = readPersistedLivePreview();

    // Save current messages to cache for the previous role+session
    if (previousAgentId) {
      agentCacheRef.current.set(cacheKey(previousAgentId, previousSessionId), {
        messages: messages,
        hasMore: hasMore,
      });
    }
    prevAgentIdRef.current = agentId;
    prevSessionIdRef.current = activeSessionId;

    // Reset typing state: only show if the NEW role has a pending response
    const isPending = !!agentId && pendingAgentId === agentId;
    setIsTyping(isPending);
    setActiveTools(isPending ? persistedActiveTools : []);
    setLivePreview(isPending ? persistedLivePreview : undefined);

    // Clear the response ref so stray tokens from the old role don't bleed in
    responseIdRef.current = null;

    // Clear stale domain session only when the role or chat session actually changes.
    if (sessionChanged) {
      setActiveDomainSession(null);
      setMessages([]);
      setHasMore(false);
    }

    if (!projectId || !agentId) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    // Check cache first
    const cached = agentCacheRef.current.get(cacheKey(agentId, activeSessionId));
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      return;
    }

    // Fetch from API
    setIsLoadingHistory(true);
    if (!activeSessionId) {
      setMessages([]);
      setHasMore(false);
      setIsLoadingHistory(false);
      return;
    }

    const fetchId = ++historyFetchIdRef.current;

    fetchChatMessages(projectId, agentId, {
      session_id: activeSessionId,
    })
      .then(async (page) => {
        if (fetchId !== historyFetchIdRef.current) return;
        const storedAck = await loadStoredAccountContentKey().catch(() => null);
        console.warn("Chat history fetch", {
          sessionId: activeSessionId,
          totalMessages: page.messages.length,
          assistantMessages: page.messages
            .filter((message) => message.sender === "assistant")
            .map((message) => ({
              id: message.id,
              content: message.content,
              hasEncryptedPayload: Boolean(message.metadata?.encrypted_payload),
              objectId: message.metadata?.encrypted_payload?.object_id,
              objectType: message.metadata?.encrypted_payload?.object_type,
            })),
          hasAck: Boolean(storedAck),
        });
        if (page.messages.length === 0) {
          setMessages([]);
          setHasMore(false);
        } else {
          // API returns newest-first (DESC), reverse for oldest-first display
          const loaded: ChatMessage[] = (
            await Promise.all(
              page.messages
                .reverse()
                .map(async (m) => ({
                  id: m.id,
                  persistedId: m.id,
                  role: m.sender,
                  content: await resolvePersistedMessageContent(m),
                  timestamp: m.created_at,
                })),
            )
          );
          setMessages(loaded);
          setHasMore(page.has_more);
        }
      })
      .catch((err) => {
        if (fetchId !== historyFetchIdRef.current) return;
        console.error("Failed to load chat history:", err);
        setMessages([]);
        setHasMore(false);
      })
      .finally(() => {
        if (fetchId !== historyFetchIdRef.current) return;
        setIsLoadingHistory(false);
      });
  }, [projectId, agentId, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || isLoadingHistory) return;

    try {
      const raw = sessionStorage.getItem(LOCAL_CHAT_SEED_KEY);
      if (!raw) return;

      const seeded = JSON.parse(raw) as {
        session_id: string;
        message: string;
        timestamp?: string;
      };
      if (seeded.session_id !== activeSessionId) return;

      setMessages((prev) => {
        const sessionCreatedAt =
          sessions.find((session) => session.id === activeSessionId)?.created_at;
        const seededTimestamp =
          seeded.timestamp
          ?? sessionCreatedAt
          ?? prev[prev.length - 1]?.timestamp
          ?? new Date().toISOString();

        const existingSeedIndex = prev.findIndex(
          (m) => m.id === `local-seed-${activeSessionId}`,
        );
        if (existingSeedIndex >= 0) {
          return prev.map((m, index) =>
            index === existingSeedIndex
              ? {
                  ...m,
                  content: seeded.message,
                  timestamp: seededTimestamp,
                }
              : m,
          ).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        }

        if (prev.some((m) => m.role === "assistant" && m.content === seeded.message)) {
          return prev;
        }

        const seededMessage: ChatMessage = {
          id: `local-seed-${activeSessionId}`,
          role: "assistant",
          content: seeded.message,
          timestamp: seededTimestamp,
        };

        return [...prev, seededMessage].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      });
    } catch {
      // ignore malformed seed data
    }
  }, [activeSessionId, isLoadingHistory, sessions]);

  // Restore active domain session from backend on mount/role switch
  useEffect(() => {
    if (!agentId) return;
    const restoreKey = domainRestoreKey(projectId, agentId);

    if (suppressedDomainRestoreRef.current.has(restoreKey)) {
      setActiveDomainSession(null);
      return;
    }

    let cancelled = false;

    fetchActiveDomainSession(projectId, agentId)
      .then((session) => {
        if (
          !cancelled &&
          session &&
          session.status === "active" &&
          !suppressedDomainRestoreRef.current.has(restoreKey)
        ) {
          setActiveDomainSession(session);
        }
      })
      .catch(() => {
        /* ignore — no active session */
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, agentId, domainRestoreKey]);

  // Load older messages (scroll-up pagination)
  const loadMore = useCallback(async () => {
    if (!agentId || !hasMore || isLoadingMore) return;

    const oldest = messages[0];
    if (!oldest) return;

    setIsLoadingMore(true);
    try {
      if (!activeSessionId) return;
      const page = await fetchChatMessages(projectId, agentId, {
        before: oldest.timestamp,
        session_id: activeSessionId,
      });
      const storedAck = await loadStoredAccountContentKey().catch(() => null);
      console.warn("Chat history pagination fetch", {
        sessionId: activeSessionId,
        totalMessages: page.messages.length,
        assistantMessages: page.messages
          .filter((message) => message.sender === "assistant")
          .map((message) => ({
            id: message.id,
            content: message.content,
            hasEncryptedPayload: Boolean(message.metadata?.encrypted_payload),
            objectId: message.metadata?.encrypted_payload?.object_id,
            objectType: message.metadata?.encrypted_payload?.object_type,
          })),
        hasAck: Boolean(storedAck),
      });
      if (page.messages.length > 0) {
        const older: ChatMessage[] = await Promise.all(
          page.messages
            .reverse()
            .map(async (m) => ({
              id: m.id,
              role: m.sender,
              content: await resolvePersistedMessageContent(m),
              timestamp: m.created_at,
            })),
        );
        setMessages((prev) => [...older, ...prev]);
      }
      setHasMore(page.has_more);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [projectId, agentId, activeSessionId, hasMore, isLoadingMore, messages]);

  const handleIncoming = useCallback((raw: unknown) => {
    // The backend wraps worker responses in an AgentEvent envelope:
    // { user_id, payload } where payload is the worker's AgentResponse.
    const outer = raw as { type?: string; user_id?: string; payload?: unknown };
    const inner = outer.type === "agent_response"
      ? outer as Record<string, unknown>
      : ((outer.payload ?? raw) as Record<string, unknown>);

    // ── Handle persisted message from backend ────────────────────────────
    // The backend persists chat messages (user + assistant) and pushes the
    // DB row back. We store the server UUID as `persistedId` rather than
    // replacing the client-generated ID for optimistic user messages.
    if (inner.type === "chat.message_persisted") {
      const msg = inner.message as {
        id: string;
        sender: string;
        content: string;
        created_at: string;
        metadata?: PersistedChatMessage["metadata"];
      };
      if (!msg?.id) return;
      void (async () => {
        const resolvedContent = await resolvePersistedMessageContent({
          content: msg.content,
          metadata: msg.metadata ?? null,
        });

        setMessages((prev) => {
        const role = msg.sender as "user" | "assistant";
        if (role === "user" && optimisticUserMessageIdRef.current) {
          const optimisticIdx = prev.findIndex((m) => m.id === optimisticUserMessageIdRef.current);
          if (optimisticIdx >= 0) {
            optimisticUserMessageIdRef.current = null;
            awaitingDeliveryRef.current = false;
            setTypingIfDelivered();
            return prev.map((m, i) =>
              i === optimisticIdx ? {
                ...m,
                persistedId: msg.id,
                content: resolvedContent,
                timestamp: msg.created_at,
                status: "delivered",
              } : m,
            );
          }
        }
        if (role === "assistant" && responseIdRef.current) {
          const responseIdx = prev.findIndex((m) => m.id === responseIdRef.current);
          if (responseIdx >= 0) {
            responseIdRef.current = msg.id;
            return prev.map((m, i) =>
              i === responseIdx ? {
                ...m,
                id: msg.id,
                persistedId: msg.id,
                content: resolvedContent,
                timestamp: msg.created_at,
              } : m,
            );
          }
        }
        if (role === "assistant") {
          const partialIdx = findLastIndexCompat(
            prev,
              (m) =>
                m.role === "assistant"
                && !m.persistedId
                && isLikelySameAssistantContent(m.content, resolvedContent)
                && isRecentMatch(m, msg.created_at),
          );
          if (partialIdx >= 0) {
            return prev.map((m, i) =>
              i === partialIdx ? {
                ...m,
                id: msg.id,
                persistedId: msg.id,
                content: resolvedContent,
                timestamp: msg.created_at,
              } : m,
            );
          }
        }
        // Find the last message with this role and content that doesn't
        // already have a persistedId.
        const idx = findLastIndexCompat(
          prev,
          (m) => m.role === role && m.content === resolvedContent && !m.persistedId,
        );
        if (idx >= 0) {
          if (role === "assistant" && responseIdRef.current === prev[idx].id) {
            responseIdRef.current = msg.id;
          }
          if (role === "user" && optimisticUserMessageIdRef.current === prev[idx].id) {
            optimisticUserMessageIdRef.current = null;
          }
          return prev.map((m, i) =>
            i === idx ? {
              ...m,
              id: role === "assistant" ? msg.id : m.id,
              persistedId: msg.id,
              content: resolvedContent,
              timestamp: msg.created_at,
              status: role === "user" ? "delivered" : m.status,
            } : m,
          );
        }

        // If there is no optimistic/local placeholder to reconcile against,
        // append the persisted row so assistant replies still appear when the
        // live worker stream event is delayed or missed.
        if (prev.some((m) => (m.persistedId ?? m.id) === msg.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: msg.id,
            persistedId: msg.id,
            role,
            content: resolvedContent,
            timestamp: msg.created_at,
          },
        ];
        });
      })();
      return;
    }

    // ── Handle message status updates (sent/delivered) ──────────────────
    if (inner.type === "message_status") {
      const { message_id, status } = inner as { message_id: string; status: string };
      if (message_id === optimisticUserMessageIdRef.current && status === "delivered") {
        awaitingDeliveryRef.current = false;
        setTypingIfDelivered();
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message_id ? { ...m, status: status as ChatMessage["status"] } : m,
        ),
      );
      return;
    }

    if (inner.type === "delivery_receipt") {
      const { message_id } = inner as { message_id: string };
      if (message_id === optimisticUserMessageIdRef.current) {
        awaitingDeliveryRef.current = false;
        setTypingIfDelivered();
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message_id ? { ...m, status: "delivered" } : m,
        ),
      );
      return;
    }

    // ── Handle StreamEvent format (worker AgentResponse wrapper) ────────
    // Worker sends: { type: "agent_response", payload: { event_type, data } }
    if (inner.type === "agent_response" && inner.payload) {
      const streamEvent = inner.payload as { event_type: string; data: Record<string, unknown> };

      switch (streamEvent.event_type) {
        case "Done": {
          optimisticUserMessageIdRef.current = null;
          const { payload, encrypted_payload, session_id } = streamEvent.data as {
            payload?: string;
            encrypted_payload?: EncryptedPayload;
            session_id?: string;
          };
          if (session_id && activeSessionId && session_id !== activeSessionId) {
            break;
          }
          void (async () => {
            const resolvedFinalOutput =
              encrypted_payload
                ? await resolvePersistedMessageContent({
                    content: payload ?? "",
                    metadata: { encrypted_payload },
                  })
                : (payload ?? "");
            let id = responseIdRef.current;
            if (!id) {
              id = generateId();
            }
            responseIdRef.current = null;
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === id);
              if (existing) {
                return prev.map((m) =>
                  m.id === id ? { ...m, content: resolvedFinalOutput } : m,
                );
              }
              const partialIdx = findLastIndexCompat(
                prev,
                (m) =>
                  m.role === "assistant"
                  && !m.persistedId
                  && isLikelySameAssistantContent(m.content, resolvedFinalOutput),
              );
              if (partialIdx >= 0) {
                return prev.map((m, i) =>
                  i === partialIdx ? { ...m, content: resolvedFinalOutput } : m,
                );
              }
              const existingPersisted = findLastCompat(
                prev,
                (m) => m.role === "assistant" && m.content === resolvedFinalOutput,
              );
              if (existingPersisted) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: id!,
                  role: "assistant" as const,
                  content: resolvedFinalOutput,
                  timestamp: new Date().toISOString(),
                },
              ];
            });
            if (clearTypingUiTimeoutRef.current) {
              clearTimeout(clearTypingUiTimeoutRef.current);
            }
            clearTypingUiTimeoutRef.current = setTimeout(() => {
              setActiveTools([]);
              setLivePreview(undefined);
              setIsTyping(false);
              clearTypingUiTimeoutRef.current = null;
            }, 600);
            if (activeSessionId) {
              void clearChatStreamSnapshot(activeSessionId);
              notifyChatStreamSnapshot({ sessionId: activeSessionId, clear: true });
            }
          })();
          break;
        }

        case "Error": {
          optimisticUserMessageIdRef.current = null;
          responsePersistedRef.current = false;
          responseIdRef.current = null;
          const { message, payload, encrypted_payload } = streamEvent.data as {
            message: string;
            payload?: { message?: string };
            encrypted_payload?: EncryptedPayload;
          };
          void (async () => {
            const encryptedData = await resolveEncryptedPayloadJson<{ message?: string }>(
              encrypted_payload,
            );
            const resolvedErrorMessage = encryptedData?.message
              ? String(encryptedData.message)
              : payload?.message
                ? String(payload.message)
                : await resolveEncryptedPreview(message, encrypted_payload);
            const displayError = resolvedErrorMessage ?? message;
            setMessages((prev) => [
              ...prev,
              {
                id: generateId(),
                role: "assistant" as const,
                content: displayError === "Request cancelled" ? displayError : `Error: ${displayError}`,
                timestamp: new Date().toISOString(),
              },
            ]);
          })();
          if (clearTypingUiTimeoutRef.current) {
            clearTimeout(clearTypingUiTimeoutRef.current);
          }
          clearTypingUiTimeoutRef.current = setTimeout(() => {
            setActiveTools([]);
            setLivePreview(undefined);
            setIsTyping(false);
            clearTypingUiTimeoutRef.current = null;
          }, 0);
          if (activeSessionId) {
            void clearChatStreamSnapshot(activeSessionId);
            notifyChatStreamSnapshot({ sessionId: activeSessionId, clear: true });
          }
          break;
        }

        case "DomainEntered": {
          // Domain is activated from the backend createDomainSession response.
          // Keep this as a no-op fallback in case older workers still emit it.
          setIsDomainPending(false);
          if (pendingDomainSessionRef.current) {
            setActiveDomainSession(pendingDomainSessionRef.current);
            pendingDomainSessionRef.current = null;
          }
          break;
        }

        case "DomainExited": {
          const { session_id } = streamEvent.data as { session_id: string };
          const currentActiveDomainSession = activeDomainSessionRef.current;

          if (pendingDomainSessionRef.current?.id === session_id) {
            pendingDomainSessionRef.current = null;
          }

          if (!currentActiveDomainSession?.id || currentActiveDomainSession.id !== session_id) {
            break;
          }

          setActiveDomainSession(null);
          break;
        }

        case "AbilityActivated": {
          const { ability_tool_name, payload, encrypted_payload } = streamEvent.data as {
            ability_tool_name: string;
            payload?: { task_preview?: string };
            encrypted_payload?: EncryptedPayload;
          };
          void (async () => {
            const encryptedData = await resolveEncryptedPayloadJson<{ task_preview?: string }>(
              encrypted_payload,
            );
            const resolvedTaskPreview =
              encryptedData?.task_preview
                ? String(encryptedData.task_preview)
                : payload?.task_preview
                  ? String(payload.task_preview)
                  : undefined;
            setTypingIfDelivered();
            setLivePreview((prev) => appendPreview(prev, resolvedTaskPreview));
            setActiveTools((prev) => {
              const existing = prev.find((tool) => tool.name === ability_tool_name);
              if (existing) {
                return [{
                  ...existing,
                  args: "",
                  status: "running",
                  textPreview: appendPreview(existing.textPreview, resolvedTaskPreview),
                  outputPreview: undefined,
                  errorPreview: undefined,
                }];
              }
              return [{
                name: ability_tool_name,
                args: "",
                textPreview: resolvedTaskPreview,
                status: "running",
                children: [],
              }];
            });
          })();
          break;
        }

        case "AbilityCompleted": {
          const { ability_tool_name, success, payload, encrypted_payload } = streamEvent.data as {
            ability_tool_name: string;
            success: boolean;
            payload?: { result_preview?: string };
            encrypted_payload?: EncryptedPayload;
          };
          void (async () => {
            const encryptedData = await resolveEncryptedPayloadJson<{ result_preview?: string }>(
              encrypted_payload,
            );
            const resolvedResultPreview =
              encryptedData?.result_preview
                ? String(encryptedData.result_preview)
                : payload?.result_preview
                  ? String(payload.result_preview)
                  : undefined;
            setTypingIfDelivered();
            setLivePreview((prev) => appendPreview(prev, resolvedResultPreview));
            setActiveTools((prev) => prev.map((tool) => tool.name === ability_tool_name ? {
              ...tool,
              status: success ? "completed" : "failed",
              textPreview: appendPreview(tool.textPreview, resolvedResultPreview),
              outputPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? resolvedResultPreview : tool.outputPreview),
              errorPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? tool.errorPreview : resolvedResultPreview),
            } : tool));
          })();
          break;
        }

        case "ToolCalls": {
          const { tool_calls, parent_tool_name, payload, encrypted_payload } = streamEvent.data as {
            tool_calls: { tool_name: string; tool_args: string }[];
            parent_tool_name?: string;
            payload?: { text_preview?: string };
            encrypted_payload?: EncryptedPayload;
          };
          const toolNames = tool_calls.map((call) => call.tool_name);
          void (async () => {
            const encryptedData = await resolveEncryptedPayloadJson<{ text_preview?: string }>(
              encrypted_payload,
            );
            const resolvedTextPreview =
              encryptedData?.text_preview
                ? String(encryptedData.text_preview)
                : payload?.text_preview
                  ? String(payload.text_preview)
                  : undefined;
            if (parent_tool_name) {
              const newChildren = tool_calls
                .filter((call) => call.tool_name !== parent_tool_name)
                .map((call) => ({
                  name: call.tool_name,
                  args: call.tool_args || "",
                  textPreview: undefined,
                  status: "running" as const,
                }));
              if (newChildren.length === 0) {
                return;
              }
              setTypingIfDelivered();
              setLivePreview((prev) => appendPreview(prev, resolvedTextPreview));
              setActiveTools((prev) => {
                const existing = prev.find((tool) => tool.name === parent_tool_name);
                const nextTools = !existing ? [
                  ...prev,
                  {
                    name: parent_tool_name,
                    args: "",
                    textPreview: resolvedTextPreview,
                    status: "running" as const,
                    children: newChildren,
                  },
                ] : prev.map((tool) => {
                  if (tool.name !== parent_tool_name) return tool;
                  return {
                    ...tool,
                    textPreview: appendPreview(tool.textPreview, resolvedTextPreview),
                    children: [
                      ...(tool.children ?? []),
                      ...newChildren,
                    ],
                  };
                });
                return nextTools;
              });
              return;
            }
            setTypingIfDelivered();
            setLivePreview((prev) => appendPreview(prev, resolvedTextPreview));
            setActiveTools((prev) => {
              const nextTools = toolNames.length === 1 && isAbilityTool(toolNames[0])
                ? [{
                  name: toolNames[0],
                  args: "",
                  textPreview: resolvedTextPreview,
                  status: "running" as const,
                  children: [],
                }]
                : (() => {
                    const previousPreview = prev[0]?.textPreview?.trim() ?? "";
                    const nextPreview = resolvedTextPreview?.trim()
                      ? previousPreview
                        ? `${previousPreview}\n\n${resolvedTextPreview.trim()}`
                        : resolvedTextPreview.trim()
                      : previousPreview;
                    return tool_calls.map((call) => ({
                      name: call.tool_name,
                      args: call.tool_args || "",
                      textPreview: nextPreview || undefined,
                      status: "running" as const,
                      children: [],
                    }));
                  })();
              return nextTools;
            });
          })();
          break;
        }

        case "ToolCompleted": {
          const { tool_name, success, parent_tool_name, payload, encrypted_payload } = streamEvent.data as {
            tool_name: string;
            success: boolean;
            parent_tool_name?: string;
            payload?: { output_preview?: string; error_preview?: string };
            encrypted_payload?: EncryptedPayload;
          };
          void (async () => {
            const encryptedData = await resolveEncryptedPayloadJson<{
              output_preview?: string;
              error_preview?: string;
            }>(encrypted_payload);
            const resolvedOutputPreview =
              encryptedData?.output_preview
                ? String(encryptedData.output_preview)
                : payload?.output_preview
                  ? String(payload.output_preview)
                  : undefined;
            const resolvedErrorPreview =
              encryptedData?.error_preview
                ? String(encryptedData.error_preview)
                : payload?.error_preview
                  ? String(payload.error_preview)
                  : undefined;
            if (parent_tool_name) {
              if (tool_name === parent_tool_name) {
                return;
              }
              setTypingIfDelivered();
              setActiveTools((prev) => prev.map((tool) => {
                if (tool.name !== parent_tool_name) return tool;
                const children = [...(tool.children ?? [])];
                const idx = [...children].reverse().findIndex((child) => child.name === tool_name && (!child.status || child.status === "running"));
                if (idx !== -1) {
                  const realIdx = children.length - 1 - idx;
                  children[realIdx] = {
                    ...children[realIdx],
                    status: success ? "completed" : "failed",
                    outputPreview: resolvedOutputPreview,
                    errorPreview: resolvedErrorPreview,
                  };
                }
                return { ...tool, children };
              }));
              return;
            }
            if (isAbilityTool(tool_name)) {
              setTypingIfDelivered();
              setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
                ...tool,
                status: success ? "completed" : "failed",
              } : tool));
              return;
            }
            setTypingIfDelivered();
            setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
              ...tool,
              status: success ? "completed" : "failed",
              outputPreview: resolvedOutputPreview,
              errorPreview: resolvedErrorPreview,
            } : tool));
          })();
          break;
        }

        default:
          break;
      }
      return;
    }

    // Legacy chat.response / chat.response.chunk / chat.error formats
    // are no longer sent by the worker. All responses use the
    // agent_response envelope handled above.
  }, [activeSessionId]);

  // Keep the ref in sync with the latest handleIncoming
  useEffect(() => {
    handleIncomingRef.current = handleIncoming;
  }, [handleIncoming]);

  useEffect(() => {
    if (!activeSessionId) return;
    void loadChatStreamSnapshot(activeSessionId).then((snapshot) => {
      if (!snapshot || snapshot.status !== "streaming" || !snapshot.content.trim()) {
        return;
      }
      applyStreamSnapshot(snapshot);
    });
  }, [activeSessionId, applyStreamSnapshot]);

  useEffect(() => {
    if (!activeSessionId) return;

    let channel: BroadcastChannel | null = null;

    const handleSnapshotMessage = (data: unknown) => {
      const snapshot = data as ChatStreamSnapshot | { sessionId: string; clear: true } | undefined;
      if (!snapshot || typeof snapshot !== "object" || !("sessionId" in snapshot)) {
        return;
      }
      applyStreamSnapshot(snapshot);
    };

    try {
      channel = new BroadcastChannel(STREAM_CHANNEL_NAME);
      channel.addEventListener("message", (event) => handleSnapshotMessage(event.data));
    } catch {
      channel = null;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; snapshot?: unknown } | undefined;
      if (data?.type !== "chat-stream-snapshot") return;
      handleSnapshotMessage(data.snapshot);
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    }

    return () => {
      channel?.close();
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
      }
    };
  }, [activeSessionId, applyStreamSnapshot]);

  useEffect(() => {
    writePendingAgentId(isTyping && agentId ? agentId : null);
  }, [agentId, isTyping]);

  useEffect(() => {
    writePersistedTools(activeTools);
  }, [activeTools]);

  useEffect(() => {
    writePersistedLivePreview(livePreview);
  }, [livePreview]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !activeSessionId) return;
      if (!userId) {
        toast.error("This device is not ready to encrypt messages yet.");
        return;
      }

      const storedAck = await loadStoredAccountContentKey();
      if (!storedAck) {
        toast.error("Generate a local account content key in Settings before sending encrypted messages.");
        return;
      }

      const encryptedMessage = await encryptContentPayload({
        accountId: userId,
        objectId: crypto.randomUUID(),
        objectType: "agent_prompt",
        plaintext: trimmed,
      });
      if (!encryptedMessage) {
        toast.error("Failed to encrypt this message on the current device.");
        return;
      }

      const msgId = generateId();
      const userMsg: ChatMessage = {
        id: msgId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        status: "sending",
      };
      optimisticUserMessageIdRef.current = msgId;
      awaitingDeliveryRef.current = true;
      setMessages((prev) => [...prev, userMsg]);

      // Pre-allocate a response ID so the final response targets the same message
      responsePersistedRef.current = false;
      responseIdRef.current = generateId();
      setLivePreview(undefined);
      setIsTyping(false);

      if (activeSessionId) {
        void persistChatStreamSnapshot({
          sessionId: activeSessionId,
          requestId: msgId,
          responseId: responseIdRef.current ?? undefined,
          content: "",
          status: "streaming",
          updatedAt: Date.now(),
        });
        notifyChatStreamSnapshot({
          sessionId: activeSessionId,
          requestId: msgId,
          responseId: responseIdRef.current ?? undefined,
          content: "",
          status: "streaming",
          updatedAt: Date.now(),
        });
      }

      const controller = new AbortController();
      streamAbortRef.current = controller;

      const streamBody = {
        id: msgId,
        message: "[Encrypted message]",
        encrypted_message: encryptedMessage,
        session_id: activeSessionId,
        ...(activeDomainSession ? { domain_session_id: activeDomainSession.id } : {}),
        agent_id: agentId!,
        ...(projectId ? { project_id: projectId } : {}),
      };

      const handleStreamEvent = (event: { event: string; data: unknown }) => {
        if (event.event === "message_persisted") {
          handleIncomingRef.current(event.data);
          return;
        }
        if (event.event === "delivery_receipt") {
          handleIncomingRef.current(event.data);
          return;
        }
        const normalized = normalizeSseAgentEvent(event);
        if (!normalized) {
          return;
        }
        handleIncomingRef.current({
          type: "agent_response",
          payload: normalized,
        });
      };

      const markMessageDelivered = () => {
        awaitingDeliveryRef.current = false;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === msgId ? { ...message, status: "delivered" } : message,
          ),
        );
        setTypingIfDelivered();
      };

      const streamPromise = createChatStream(
        streamBody,
        controller.signal,
      ).then((response) => {
        markMessageDelivered();
        return consumeSseStream(response, handleStreamEvent);
      });

      void streamPromise
        .then(async () => {
          const sessionId = activeSessionId;
          const resolvedProjectId = projectId;
          const resolvedAgentId = agentId;
          if (!sessionId || !resolvedProjectId || !resolvedAgentId) return;
          const page = await fetchChatMessages(resolvedProjectId, resolvedAgentId, {
            session_id: sessionId,
          });
          const loaded: ChatMessage[] = await Promise.all(
            page.messages
              .reverse()
              .map(async (message) => ({
                id: message.id,
                persistedId: message.id,
                role: message.sender,
                content: await resolvePersistedMessageContent(message),
                timestamp: message.created_at,
                status: message.sender === "user" ? "delivered" : undefined,
              })),
          );
          setMessages((prev) => mergeLoadedMessages(loaded, prev));
          setHasMore(page.has_more);
        })
        .catch((err) => {
          console.error("Failed to stream chat:", err);
          optimisticUserMessageIdRef.current = null;
          responseIdRef.current = null;
          setIsTyping(false);
          if (activeSessionId) {
            void clearChatStreamSnapshot(activeSessionId);
            notifyChatStreamSnapshot({ sessionId: activeSessionId, clear: true });
          }
          const wasCancelled =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.name === "AbortError");
          setMessages((prev) => prev.map((m) => (
            m.id === msgId ? { ...m, status: wasCancelled ? "cancelled" : "failed" } : m
          )));
        })
        .finally(() => {
          if (streamAbortRef.current === controller) {
            streamAbortRef.current = null;
          }
          if (clearTypingUiTimeoutRef.current) {
            clearTimeout(clearTypingUiTimeoutRef.current);
          }
          clearTypingUiTimeoutRef.current = setTimeout(() => {
            setActiveTools([]);
            setLivePreview(undefined);
            setIsTyping(false);
            clearTypingUiTimeoutRef.current = null;
          }, 0);
        });
    },
    [projectId, agentId, activeDomainSession, activeSessionId, userId],
  );

  // Enter a domain by command (e.g. "#creator")
  const enterDomain = useCallback(
    async (domainId: string, domainCommand: string, overrideRoleId?: string) => {
      const effectiveRoleId = overrideRoleId ?? agentId;
      if (!effectiveRoleId || activeDomainSession) return;

      try {
        suppressedDomainRestoreRef.current.delete(domainRestoreKey(projectId, effectiveRoleId));
        setIsDomainPending(true);
        const session = await createDomainSession(domainId, projectId, effectiveRoleId);
        pendingDomainSessionRef.current = session;
        setActiveDomainSession(session);
        setIsDomainPending(false);
        pendingDomainSessionRef.current = null;

        await enterChatDomain({
          project_id: projectId,
          agent_id: effectiveRoleId,
          domain_command: domainCommand,
          session_id: session.id,
        });
      } catch (err) {
        pendingDomainSessionRef.current = null;
        setIsDomainPending(false);
        console.error("Failed to enter domain:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant" as const,
            content: `Failed to enter domain: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    },
    [projectId, agentId, activeDomainSession, domainRestoreKey],
  );

  // Exit the active domain
  const exitDomain = useCallback(async () => {
    if (!activeDomainSession || !agentId) return;

    try {
      const restoreKey = domainRestoreKey(projectId, agentId);
      suppressedDomainRestoreRef.current.add(restoreKey);
      await completeDomainSession(activeDomainSession.id);
      pendingDomainSessionRef.current = null;
      setActiveDomainSession(null);

      await exitChatDomain({
        project_id: projectId,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
      });
    } catch (err) {
      suppressedDomainRestoreRef.current.delete(domainRestoreKey(projectId, agentId));
      console.error("Failed to exit domain:", err);
    }
  }, [projectId, agentId, activeDomainSession, domainRestoreKey]);

  // Cancel the active domain (discard artifact)
  const cancelDomain = useCallback(async () => {
    if (!activeDomainSession || !agentId) return;

    try {
      const restoreKey = domainRestoreKey(projectId, agentId);
      suppressedDomainRestoreRef.current.add(restoreKey);
      await cancelDomainSession(activeDomainSession.id);
      pendingDomainSessionRef.current = null;
      setActiveDomainSession(null);

      await exitChatDomain({
        project_id: projectId,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
      });
    } catch (err) {
      suppressedDomainRestoreRef.current.delete(domainRestoreKey(projectId, agentId));
      console.error("Failed to cancel domain:", err);
    }
  }, [projectId, agentId, activeDomainSession, domainRestoreKey]);

  const deleteMessage = useCallback(
    (messageId: string) => {
      // Look up the persistedId (server UUID) before removing from state.
      // Messages now keep their client-generated ID in `id` and store the
      // server UUID in `persistedId`.
      const target = messages.find((m) => m.id === messageId);
      const dbId = target?.persistedId;

      // Optimistically remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Evict from role cache so the deletion persists across role switches
      if (agentId) {
        agentCacheRef.current.delete(cacheKey(agentId, activeSessionId));
      }

      // Delete from the database using the server-generated UUID.
      // Fall back to messageId itself for messages loaded from the API
      // (which already use the server UUID as their id).
      const deleteId = dbId ?? messageId;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deleteId);
      if (isUuid) {
        deleteChatMessage(deleteId).catch((err) =>
          console.error("Failed to delete chat message:", err),
        );
      }
    },
    [agentId, activeSessionId, cacheKey, messages],
  );

  // Archive the current session instead of bulk-deleting all messages
  const clearMessages = useCallback(() => {
    if (!projectId || !agentId) return;
    setMessages([]);
    setHasMore(false);
    if (agentId) {
      agentCacheRef.current.delete(cacheKey(agentId, activeSessionId));
    }
    if (activeSessionId) {
      archiveChatSession(activeSessionId)
        .then(async () => {
          setSessions((prev) => prev.filter((s) => s.id !== activeSessionId));
          // Auto-create a new session to replace the archived one
          try {
            const session = await createChatSession({
              project_id: projectId,
              agent_id: agentId,
            });
            setSessions((prev) => [session, ...prev]);
            setActiveSessionId(session.id);
          } catch (err) {
            console.error("Failed to auto-create session:", err);
            setActiveSessionId(null);
          }
        })
        .catch((err) =>
          console.error("Failed to archive session:", err),
        );
    }
  }, [projectId, agentId, activeSessionId, cacheKey]);

  const cancelResponse = useCallback(() => {
    if (!isTyping) return;

    // Clear local typing state immediately
    responseIdRef.current = null;
    setIsTyping(false);
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    if (activeSessionId) {
      void clearChatStreamSnapshot(activeSessionId);
      notifyChatStreamSnapshot({ sessionId: activeSessionId, clear: true });
    }

    void cancelChat({
      project_id: projectId,
      ...(agentId ? { agent_id: agentId } : {}),
      ...(activeSessionId ? { session_id: activeSessionId } : {}),
    }).catch((err) => {
      console.error("Failed to cancel chat:", err);
    });
  }, [projectId, agentId, activeSessionId, isTyping]);

  // ── Session management callbacks ─────────────────────────────────────
  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      // Save current to cache
      if (agentId) {
        agentCacheRef.current.set(cacheKey(agentId, activeSessionId), {
          messages,
          hasMore,
        });
      }
      setActiveSessionId(sessionId);
    },
    [agentId, activeSessionId, messages, hasMore, cacheKey],
  );

  const createNewSession = useCallback(async () => {
    if (!agentId) return;
    try {
      const session = await createChatSession({
        project_id: projectId,
        agent_id: agentId,
      });
      setSessions((prev) => [session, ...prev]);
      switchSession(session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [projectId, agentId, switchSession]);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        await updateChatSession(id, { title });
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title } : s)),
        );
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    },
    [],
  );

  // Notify the worker to delete the chat history file for a session
  const notifyWorkerSessionDelete = useCallback(
    (sessionId: string) => {
      if (!agentId) return;
      void notifyChatSessionDelete({
        project_id: projectId,
        agent_id: agentId,
        session_id: sessionId,
      }).catch((err) => {
        console.error("Failed to notify worker of session delete:", err);
      });
    },
    [projectId, agentId],
  );

  const archiveSession = useCallback(
    async (id: string) => {
      try {
        await archiveChatSession(id);
        notifyWorkerSessionDelete(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (agentId) {
          agentCacheRef.current.delete(cacheKey(agentId, id));
        }
        if (id === activeSessionId) {
          const next = sessions.find((s) => s.id !== id && !s.archived_at);
          if (next) {
            setActiveSessionId(next.id);
          } else {
            // Auto-create a new session
            try {
              const session = await createChatSession({
                project_id: projectId,
                agent_id: agentId!,
              });
              setSessions((prev) => [session, ...prev]);
              setActiveSessionId(session.id);
            } catch (err) {
              console.error("Failed to auto-create session:", err);
              setActiveSessionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to archive session:", err);
      }
    },
    [activeSessionId, sessions, agentId, projectId, cacheKey, notifyWorkerSessionDelete],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteChatSession(id);
        notifyWorkerSessionDelete(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (agentId) {
          agentCacheRef.current.delete(cacheKey(agentId, id));
        }
        if (id === activeSessionId) {
          const next = sessions.find((s) => s.id !== id && !s.archived_at);
          if (next) {
            setActiveSessionId(next.id);
          } else {
            try {
              const session = await createChatSession({
                project_id: projectId,
                agent_id: agentId!,
              });
              setSessions((prev) => [session, ...prev]);
              setActiveSessionId(session.id);
            } catch (err) {
              console.error("Failed to auto-create session:", err);
              setActiveSessionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [activeSessionId, sessions, agentId, projectId, cacheKey, notifyWorkerSessionDelete],
  );

  return {
    messages,
    livePreview,
    sendMessage,
    deleteMessage,
    clearMessages,
    isTyping,
    activeTools,
    status,
    isLoadingHistory,
    hasMore,
    isLoadingMore,
    loadMore,
    activeDomainSession,
    isDomainPending,
    enterDomain,
    exitDomain,
    cancelDomain,
    cancelResponse,
    // Session management
    activeSessionId,
    sessions,
    isLoadingSessions,
    switchSession,
    createNewSession,
    renameSession,
    archiveSession,
    deleteSession,
  };
}
