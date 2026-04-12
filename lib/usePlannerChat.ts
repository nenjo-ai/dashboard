"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import {
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
  clearChatStreamSnapshot,
  loadChatStreamSnapshot,
  notifyChatStreamSnapshot,
  persistChatStreamSnapshot,
} from "./chatStreamDurability";
import type {
  ChatMessage,
  ChatSession,
  DomainSession,
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

const MAX_VISIBLE_TOOL_CALLS = 3;
const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
const PENDING_AGENT_KEY = "nenjo:pendingAgentId";
const TOOLS_KEY = "nenjo:activeTools";
const LIVE_PREVIEW_KEY = "nenjo:livePreview";

function limitRecentTools<T>(tools: T[]): T[] {
  return tools.slice(-MAX_VISIBLE_TOOL_CALLS);
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
    token: "Token",
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

export function usePlannerChat(projectId: string, agentId?: string, initialSessionId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [livePreview, setLivePreview] = useState<string | undefined>(undefined);
  const status = "connected";

  // Initialize from pendingAgentId so the typing indicator is correct on the
  // very first render after remount — no useEffect delay.
  // Only show typing if THIS role is the one with a pending response.
  const [isTyping, setIsTyping] = useState(
    () => !!agentId && readPendingAgentId() === agentId,
  );
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

  // Stable response ID set when the user sends a message. Token and Done
  // events both use this ID to target the same message, preventing
  // duplication regardless of event ordering or React batching.
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
    if (previousAgentId !== agentId || previousSessionId !== activeSessionId) {
      setActiveDomainSession(null);
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
      .then((page) => {
        if (fetchId !== historyFetchIdRef.current) return;
        if (page.messages.length === 0) {
          setMessages([]);
          setHasMore(false);
        } else {
          // API returns newest-first (DESC), reverse for oldest-first display
          const loaded: ChatMessage[] = page.messages
            .reverse()
            .map((m) => ({
              id: m.id,
              role: m.sender,
              content: m.content,
              timestamp: m.created_at,
            }));
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

      const seeded = JSON.parse(raw) as { session_id: string; message: string };
      if (seeded.session_id !== activeSessionId) return;

      setMessages((prev) => {
        if (prev.some((m) => m.role === "assistant" && m.content === seeded.message)) {
          return prev;
        }

        return [
          {
            id: `local-seed-${activeSessionId}`,
            role: "assistant",
            content: seeded.message,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ];
      });
    } catch {
      // ignore malformed seed data
    }
  }, [activeSessionId, isLoadingHistory]);

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
      if (page.messages.length > 0) {
        const older: ChatMessage[] = page.messages
          .reverse()
          .map((m) => ({
            id: m.id,
            role: m.sender,
            content: m.content,
            timestamp: m.created_at,
          }));
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
      };
      if (!msg?.id) return;

      setMessages((prev) => {
        const role = msg.sender as "user" | "assistant";
        if (role === "assistant" && responseIdRef.current) {
          const responseIdx = prev.findIndex((m) => m.id === responseIdRef.current);
          if (responseIdx >= 0) {
            responsePersistedRef.current = true;
            return prev.map((m, i) =>
              i === responseIdx ? {
                ...m,
                id: msg.id,
                persistedId: msg.id,
                content: msg.content,
                timestamp: msg.created_at,
              } : m,
            );
          }
        }
        // Find the last message with this role and content that doesn't
        // already have a persistedId.
        const idx = prev.findLastIndex(
          (m) => m.role === role && m.content === msg.content && !m.persistedId,
        );
        if (idx >= 0) {
          return prev.map((m, i) =>
            i === idx ? {
              ...m,
              id: role === "assistant" ? msg.id : m.id,
              persistedId: msg.id,
              content: msg.content,
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
            content: msg.content,
            timestamp: msg.created_at,
          },
        ];
      });
      return;
    }

    // ── Handle message status updates (sent/delivered) ──────────────────
    if (inner.type === "message_status") {
      const { message_id, status } = inner as { message_id: string; status: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message_id ? { ...m, status: status as ChatMessage["status"] } : m,
        ),
      );
      return;
    }

    if (inner.type === "delivery_receipt") {
      const { message_id } = inner as { message_id: string };
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
        case "Token": {
          if (responsePersistedRef.current) {
            break;
          }
          let id = responseIdRef.current;
          if (!id) {
            // Orphan token from buffer replay — create a new slot
            id = generateId();
            responseIdRef.current = id;
          }
          const text = (streamEvent.data as { text: string }).text;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === id);
            if (existing) {
              return prev.map((m) =>
                m.id === id ? { ...m, content: m.content + text } : m,
              );
            }
            return [
              ...prev,
              {
                id,
                role: "assistant" as const,
                content: text,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          if (activeSessionId) {
            void persistChatStreamSnapshot({
              sessionId: activeSessionId,
              requestId: responseIdRef.current ?? id,
              responseId: id,
              content: text,
              status: "streaming",
              updatedAt: Date.now(),
            });
            notifyChatStreamSnapshot({
              sessionId: activeSessionId,
              requestId: responseIdRef.current ?? id,
              responseId: id,
              content: text,
              status: "streaming",
              updatedAt: Date.now(),
            });
          }
          break;
        }

        case "Done": {
          if (responsePersistedRef.current) {
            responseIdRef.current = null;
            responsePersistedRef.current = false;
            if (clearTypingUiTimeoutRef.current) {
              clearTimeout(clearTypingUiTimeoutRef.current);
            }
            clearTypingUiTimeoutRef.current = setTimeout(() => {
              setActiveTools([]);
              setLivePreview(undefined);
              setIsTyping(false);
              clearTypingUiTimeoutRef.current = null;
            }, 600);
            break;
          }
          const { final_output, session_id } = streamEvent.data as {
            final_output: string;
            session_id?: string;
          };
          if (session_id && activeSessionId && session_id !== activeSessionId) {
            break;
          }
          let id = responseIdRef.current;
          if (!id) {
            id = generateId();
          }
          responseIdRef.current = null;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === id);
            if (existing) {
              return prev.map((m) =>
                m.id === id ? { ...m, content: final_output } : m,
              );
            }
            const existingPersisted = prev.findLast(
              (m) => m.role === "assistant" && m.content === final_output,
            );
            if (existingPersisted) {
              return prev;
            }
            return [
              ...prev,
              {
                id: id!,
                role: "assistant" as const,
                content: final_output,
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
          break;
        }

        case "Error": {
          responsePersistedRef.current = false;
          responseIdRef.current = null;
          const errorMessage = (streamEvent.data as { message: string }).message;
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant" as const,
              content: errorMessage === "Request cancelled" ? errorMessage : `Error: ${errorMessage}`,
              timestamp: new Date().toISOString(),
            },
          ]);
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
          const { ability_tool_name, task_preview } = streamEvent.data as {
            ability_tool_name: string;
            task_preview?: string;
          };
          flushSync(() => {
            setIsTyping(true);
            setLivePreview((prev) => appendPreview(prev, task_preview));
            setActiveTools((prev) => {
              const existing = prev.find((tool) => tool.name === ability_tool_name);
              if (existing) {
                return [{
                  ...existing,
                  args: "",
                  status: "running",
                  textPreview: appendPreview(existing.textPreview, task_preview),
                  outputPreview: undefined,
                  errorPreview: undefined,
                }];
              }
              return [{
                name: ability_tool_name,
                args: "",
                textPreview: task_preview?.trim() || undefined,
                status: "running",
                children: [],
              }];
            });
          });
          break;
        }

        case "AbilityCompleted": {
          const { ability_tool_name, success, result_preview } = streamEvent.data as {
            ability_tool_name: string;
            success: boolean;
            result_preview: string;
          };
          flushSync(() => {
            setIsTyping(true);
            setLivePreview((prev) => appendPreview(prev, result_preview));
            setActiveTools((prev) => prev.map((tool) => tool.name === ability_tool_name ? {
              ...tool,
              status: success ? "completed" : "failed",
              textPreview: appendPreview(tool.textPreview, result_preview),
              outputPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? result_preview : tool.outputPreview),
              errorPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? tool.errorPreview : result_preview),
            } : tool));
          });
          break;
        }

        case "ToolCalls": {
          const { tool_calls, text_preview, parent_tool_name } = streamEvent.data as {
            tool_calls: { tool_name: string; tool_args: string }[];
            text_preview?: string;
            parent_tool_name?: string;
          };
          const toolNames = tool_calls.map((call) => call.tool_name);
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
              break;
            }
            flushSync(() => {
              setIsTyping(true);
              setLivePreview((prev) => appendPreview(prev, text_preview));
              setActiveTools((prev) => {
                const existing = prev.find((tool) => tool.name === parent_tool_name);
                const nextTools = !existing ? [
                  ...limitRecentTools(prev),
                  {
                    name: parent_tool_name,
                    args: "",
                    textPreview: text_preview?.trim() || undefined,
                    status: "running" as const,
                    children: limitRecentTools(newChildren),
                  },
                ] : prev.map((tool) => {
                  if (tool.name !== parent_tool_name) return tool;
                  return {
                    ...tool,
                    textPreview: appendPreview(tool.textPreview, text_preview),
                    children: limitRecentTools([
                      ...(tool.children ?? []),
                      ...newChildren,
                    ]),
                  };
                });
                return nextTools;
              });
            });
            break;
          }
          flushSync(() => {
            setIsTyping(true);
            setLivePreview((prev) => appendPreview(prev, text_preview));
            setActiveTools((prev) => {
              const nextTools = toolNames.length === 1 && isAbilityTool(toolNames[0])
                ? limitRecentTools([{
                  name: toolNames[0],
                  args: "",
                  textPreview: text_preview?.trim() || undefined,
                  status: "running" as const,
                  children: [],
                }])
                : (() => {
                    const previousPreview = prev[0]?.textPreview?.trim() ?? "";
                    const nextPreview = text_preview?.trim()
                      ? previousPreview
                        ? `${previousPreview}\n\n${text_preview.trim()}`
                        : text_preview.trim()
                      : previousPreview;
                    return limitRecentTools(tool_calls.map((call) => ({
                      name: call.tool_name,
                      args: call.tool_args || "",
                      textPreview: nextPreview || undefined,
                      status: "running" as const,
                      children: [],
                    })));
                  })();
              return nextTools;
            });
          });
          break;
        }

        case "ToolCompleted": {
          const { tool_name, success, output_preview, error_preview, parent_tool_name } = streamEvent.data as { tool_name: string; success: boolean; output_preview?: string; error_preview?: string; parent_tool_name?: string };
          if (parent_tool_name) {
            if (tool_name === parent_tool_name) {
              break;
            }
            flushSync(() => {
              setIsTyping(true);
              setActiveTools((prev) => prev.map((tool) => {
                if (tool.name !== parent_tool_name) return tool;
                const children = [...(tool.children ?? [])];
                const idx = [...children].reverse().findIndex((child) => child.name === tool_name && (!child.status || child.status === "running"));
                if (idx !== -1) {
                  const realIdx = children.length - 1 - idx;
                  children[realIdx] = {
                    ...children[realIdx],
                    status: success ? "completed" : "failed",
                    outputPreview: output_preview,
                    errorPreview: error_preview,
                  };
                }
                return { ...tool, children };
              }));
            });
            break;
          }
          if (isAbilityTool(tool_name)) {
            flushSync(() => {
              setIsTyping(true);
              setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
                ...tool,
                status: success ? "completed" : "failed",
              } : tool));
            });
            break;
          }
          flushSync(() => {
            setIsTyping(true);
            setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
              ...tool,
              status: success ? "completed" : "failed",
              outputPreview: output_preview,
              errorPreview: error_preview,
            } : tool));
          });
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
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === (snapshot.responseId ?? snapshot.requestId))) {
          return prev;
        }
        return [
          ...prev,
          {
            id: snapshot.responseId ?? snapshot.requestId,
            role: "assistant",
            content: snapshot.content,
            timestamp: new Date(snapshot.updatedAt).toISOString(),
          },
        ];
      });
    });
  }, [activeSessionId]);

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
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !activeSessionId) return;

      const msgId = generateId();
      const userMsg: ChatMessage = {
        id: msgId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => [...prev, userMsg]);

      // Pre-allocate a response ID so Token/Done events target the same message
      responsePersistedRef.current = false;
      responseIdRef.current = generateId();
      setLivePreview(undefined);
      setIsTyping(true);

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

      void createChatStream(
        {
          id: msgId,
          message: trimmed,
          session_id: activeSessionId,
          ...(activeDomainSession ? { domain_session_id: activeDomainSession.id } : {}),
          agent_id: agentId!,
          ...(projectId ? { project_id: projectId } : {}),
        },
        controller.signal,
      )
        .then((response) =>
          consumeSseStream(response, (event) => {
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
          }),
        )
        .catch((err) => {
          console.error("Failed to stream chat:", err);
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
    [projectId, agentId, activeDomainSession, activeSessionId],
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
