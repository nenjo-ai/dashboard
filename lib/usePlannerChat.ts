"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  fetchChatMessages,
  deleteChatMessage,

  createDomainSession,
  completeDomainSession,
  cancelDomainSession,
  fetchActiveDomainSession,
  fetchChatSessions,
  createChatSession,
  updateChatSession,
  archiveChatSession,
  deleteChatSession,
} from "./api";
import { useWebSocketContext } from "./WebSocketContext";
import type {
  ChatMessage,
  ChatCancelOutbound,
  ChatMessageOutbound,
  ChatDomainEnterOutbound,
  ChatDomainExitOutbound,
  ChatSession,
  DomainSession,
} from "./types";

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

function limitRecentTools<T>(tools: T[]): T[] {
  return tools.slice(-MAX_VISIBLE_TOOL_CALLS);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

interface AgentCache {
  messages: ChatMessage[];
  hasMore: boolean;
}

export function usePlannerChat(projectId: string, agentId?: string, initialSessionId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [livePreview, setLivePreview] = useState<string | undefined>(undefined);

  // Read context BEFORE isTyping so we can seed the initial value.
  const { status, send, userId, subscribe, pendingAgentId, persistedActiveTools, persistedLivePreview } = useWebSocketContext();

  // Initialize from pendingAgentId so the typing indicator is correct on the
  // very first render after remount — no useEffect delay.
  // Only show typing if THIS role is the one with a pending response.
  const [isTyping, setIsTyping] = useState(
    () => !!agentId && pendingAgentId === agentId,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTools, setActiveTools] = useState<{ name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string }[] }[]>(
    () => (!!agentId && pendingAgentId === agentId) ? persistedActiveTools : [],
  );
  const [activeDomainSession, setActiveDomainSession] = useState<DomainSession | null>(null);
  const [isDomainPending, setIsDomainPending] = useState(false);
  // Pending domain session — set by enterDomain, promoted to active by DomainEntered event
  const pendingDomainSessionRef = useRef<DomainSession | null>(null);

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

  // Gate: don't process WS messages until history is loaded for the current
  // role, otherwise the async history fetch overwrites buffer-replayed msgs.
  const historyReadyRef = useRef(false);
  const localBufferRef = useRef<unknown[]>([]);

  const drainLocalBuffer = useCallback(() => {
    const buf = localBufferRef.current;
    if (buf.length === 0) return;
    localBufferRef.current = [];
    for (const msg of buf) {
      handleIncomingRef.current(msg);
    }
  }, []);

  // Cache key includes session ID
  const cacheKey = useCallback(
    (rId: string, sId?: string | null) => `${rId}:${sId ?? "none"}`,
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
    // Save current messages to cache for the previous role+session
    if (prevAgentIdRef.current) {
      agentCacheRef.current.set(cacheKey(prevAgentIdRef.current, prevSessionIdRef.current), {
        messages: messages,
        hasMore: hasMore,
      });
    }
    prevAgentIdRef.current = agentId;
    prevSessionIdRef.current = activeSessionId;

    // Pause message processing until new history is loaded
    historyReadyRef.current = false;
    localBufferRef.current = [];

    // Reset typing state: only show if the NEW role has a pending response
    const isPending = !!agentId && pendingAgentId === agentId;
    setIsTyping(isPending);
    setActiveTools(isPending ? persistedActiveTools : []);
    setLivePreview(isPending ? persistedLivePreview : undefined);

    // Clear the response ref so stray tokens from the old role don't bleed in
    responseIdRef.current = null;

    // Clear stale domain session when switching roles
    setActiveDomainSession(null);

    if (!projectId || !agentId) {
      setMessages([]);
      setHasMore(false);
      historyReadyRef.current = true;
      drainLocalBuffer();
      return;
    }

    // Check cache first
    const cached = agentCacheRef.current.get(cacheKey(agentId, activeSessionId));
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      historyReadyRef.current = true;
      drainLocalBuffer();
      return;
    }

    // Fetch from API
    setIsLoadingHistory(true);
    if (!activeSessionId) {
      setMessages([]);
      setHasMore(false);
      setIsLoadingHistory(false);
      historyReadyRef.current = true;
      drainLocalBuffer();
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
        historyReadyRef.current = true;
        drainLocalBuffer();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, agentId, activeSessionId, pendingAgentId, persistedActiveTools, persistedLivePreview]);

  // Restore active domain session from backend on mount/role switch
  useEffect(() => {
    if (!agentId || !userId) return;
    let cancelled = false;

    fetchActiveDomainSession(projectId, agentId)
      .then((session) => {
        if (!cancelled && session) {
          setActiveDomainSession(session);
        }
      })
      .catch(() => {
        /* ignore — no active session */
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, agentId, userId]);

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
    const envelope = raw as { user_id?: string; payload?: unknown };
    const inner = (envelope.payload ?? raw) as Record<string, unknown>;

    // ── Handle persisted message from backend ────────────────────────────
    // The backend persists chat messages (user + assistant) and pushes the
    // DB row back. We store the server UUID as `persistedId` rather than
    // replacing `id`, because delivery status events (message_status,
    // delivery_receipt) still reference the original client-generated ID.
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
        // Find the last message with this role and content that doesn't
        // already have a persistedId.
        const idx = prev.findLastIndex(
          (m) => m.role === role && m.content === msg.content && !m.persistedId,
        );
        if (idx >= 0) {
          return prev.map((m, i) =>
            i === idx ? { ...m, persistedId: msg.id } : m,
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
      setIsTyping(true);
      return;
    }

    // ── Handle StreamEvent format (worker AgentResponse wrapper) ────────
    // Worker sends: { type: "agent_response", payload: { event_type, data } }
    if (inner.type === "agent_response" && inner.payload) {
      const streamEvent = inner.payload as { event_type: string; data: Record<string, unknown> };

      switch (streamEvent.event_type) {
        case "Token": {
          setActiveTools([]);
          setLivePreview(undefined);
          let id = responseIdRef.current;
          if (!id) {
            // Orphan token from buffer replay — create a new slot
            id = generateId();
            responseIdRef.current = id;
          }
          // Response text is now visible — dismiss typing indicator
          setIsTyping(false);
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
          break;
        }

        case "Done": {
          setActiveTools([]);
          setLivePreview(undefined);
          let id = responseIdRef.current;
          if (!id) {
            id = generateId();
          }
          responseIdRef.current = null;
          const finalOutput = (streamEvent.data as { final_output: string }).final_output;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === id);
            if (existing) {
              return prev.map((m) =>
                m.id === id ? { ...m, content: finalOutput } : m,
              );
            }
            const existingPersisted = prev.findLast(
              (m) => m.role === "assistant" && m.content === finalOutput,
            );
            if (existingPersisted) {
              return prev;
            }
            return [
              ...prev,
              {
                id: id!,
                role: "assistant" as const,
                content: finalOutput,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          setIsTyping(false);
          break;
        }

        case "Error": {
          responseIdRef.current = null;
          setLivePreview(undefined);
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
          setIsTyping(false);
          break;
        }

        case "DomainEntered": {
          // Worker confirmed domain entry — activate the pending session
          setIsDomainPending(false);
          if (pendingDomainSessionRef.current) {
            setActiveDomainSession(pendingDomainSessionRef.current);
            pendingDomainSessionRef.current = null;
          }
          break;
        }

        case "DomainExited": {
          setActiveDomainSession(null);
          break;
        }

        case "AbilityActivated": {
          setIsTyping(true);
          const { ability_tool_name, task_preview } = streamEvent.data as {
            ability_tool_name: string;
            task_preview?: string;
          };
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
          break;
        }

        case "AbilityCompleted": {
          setIsTyping(true);
          const { ability_tool_name, success, result_preview } = streamEvent.data as {
            ability_tool_name: string;
            success: boolean;
            result_preview: string;
          };
          setLivePreview((prev) => appendPreview(prev, result_preview));
          setActiveTools((prev) => prev.map((tool) => tool.name === ability_tool_name ? {
            ...tool,
            status: success ? "completed" : "failed",
            textPreview: appendPreview(tool.textPreview, result_preview),
            outputPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? result_preview : tool.outputPreview),
            errorPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? tool.errorPreview : result_preview),
          } : tool));
          break;
        }

        case "ToolInvoked": {
          setIsTyping(true);
          const { tool_name, tool_args, text_preview, parent_tool_name } = streamEvent.data as { tool_name: string; tool_args: string; text_preview?: string; parent_tool_name?: string };
          setLivePreview((prev) => appendPreview(prev, text_preview));
          if (parent_tool_name) {
            if (tool_name === parent_tool_name) {
              break;
            }
            setActiveTools((prev) => {
              const existing = prev.find((tool) => tool.name === parent_tool_name);
              if (!existing) {
                return [
                  ...limitRecentTools(prev),
                  {
                    name: parent_tool_name,
                    args: "",
                    textPreview: text_preview?.trim() || undefined,
                    status: "running",
                    children: [
                      { name: tool_name, args: tool_args || "", textPreview: undefined, status: "running" },
                    ],
                  },
                ];
              }
              return prev.map((tool) => {
                if (tool.name !== parent_tool_name) return tool;
                return {
                  ...tool,
                  textPreview: appendPreview(tool.textPreview, text_preview),
                  children: limitRecentTools([
                    ...(tool.children ?? []),
                    { name: tool_name, args: tool_args || "", textPreview: undefined, status: "running" },
                  ]),
                };
              });
            });
            break;
          }
          setActiveTools((prev) => {
            if (isAbilityTool(tool_name)) {
              return limitRecentTools([{
                name: tool_name,
                args: "",
                textPreview: text_preview?.trim() || undefined,
                status: "running",
                children: [],
              }]);
            }
            const previousPreview = prev[0]?.textPreview?.trim() ?? "";
            const nextPreview = text_preview?.trim()
              ? previousPreview
                ? `${previousPreview}\n\n${text_preview.trim()}`
                : text_preview.trim()
              : previousPreview;
            return limitRecentTools([{ name: tool_name, args: tool_args || "", textPreview: nextPreview || undefined, status: "running", children: [] }]);
          });
          break;
        }

        case "ToolsInvoked": {
          setIsTyping(true);
          const { tool_names, tool_args, text_preview, parent_tool_name } = streamEvent.data as { tool_names: string[]; tool_args: string[]; text_preview?: string; parent_tool_name?: string };
          setLivePreview((prev) => appendPreview(prev, text_preview));
          if (parent_tool_name) {
            setActiveTools((prev) => {
              const newChildren = tool_names.map((name, i) => ({
                name,
                args: tool_args?.[i] || "",
                textPreview: undefined,
                status: "running" as const,
              })).filter((child) => child.name !== parent_tool_name);
              if (newChildren.length === 0) {
                return prev;
              }
              const existing = prev.find((tool) => tool.name === parent_tool_name);
              if (!existing) {
                return [
                  ...limitRecentTools(prev),
                  {
                    name: parent_tool_name,
                    args: "",
                    textPreview: text_preview?.trim() || undefined,
                    status: "running",
                    children: limitRecentTools(newChildren),
                  },
                ];
              }
              return prev.map((tool) => {
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
            });
            break;
          }
          setActiveTools((prev) => {
            const previousPreview = prev[0]?.textPreview?.trim() ?? "";
            const nextPreview = text_preview?.trim()
              ? previousPreview
                ? `${previousPreview}\n\n${text_preview.trim()}`
                : text_preview.trim()
              : previousPreview;
            return limitRecentTools(tool_names.map((name, i) => ({ name, args: tool_args?.[i] || "", textPreview: nextPreview || undefined, status: "running", children: [] })));
          });
          break;
        }

        case "ToolCompleted": {
          setIsTyping(true);
          const { tool_name, success, output_preview, error_preview, parent_tool_name } = streamEvent.data as { tool_name: string; success: boolean; output_preview?: string; error_preview?: string; parent_tool_name?: string };
          if (parent_tool_name) {
            if (tool_name === parent_tool_name) {
              break;
            }
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
            break;
          }
          if (isAbilityTool(tool_name)) {
            setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
              ...tool,
              status: success ? "completed" : "failed",
            } : tool));
            break;
          }
          setActiveTools((prev) => prev.map((tool) => tool.name === tool_name ? {
            ...tool,
            status: success ? "completed" : "failed",
            outputPreview: output_preview,
            errorPreview: error_preview,
          } : tool));
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
  }, []);

  // Keep the ref in sync with the latest handleIncoming
  useEffect(() => {
    handleIncomingRef.current = handleIncoming;
  }, [handleIncoming]);

  // Subscribe once — the stable wrapper routes through the ref and gates on
  // history readiness so the async history fetch can't overwrite replayed msgs.
  useEffect(() => {
    return subscribe((data: unknown) => {
      if (!historyReadyRef.current) {
        localBufferRef.current.push(data);
        return;
      }
      handleIncomingRef.current(data);
    });
  }, [subscribe]);

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
        status: status === "connected" ? "sending" : "failed",
      };
      setMessages((prev) => [...prev, userMsg]);

      if (status !== "connected") {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant" as const,
            content: "Cannot send message while the backend connection is offline.",
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }

      // Pre-allocate a response ID so Token/Done events target the same message
      responseIdRef.current = generateId();
      setLivePreview(undefined);

      // Send over WebSocket — the backend persists the message to the DB
      // and pushes back a chat.message_persisted event with the server ID.
      const outbound: ChatMessageOutbound = {
        type: "chat.message",
        id: msgId,
        project_id: projectId,
        content: trimmed,
        timestamp: userMsg.timestamp,
        ...(agentId ? { agent_id: agentId } : {}),
        ...(activeDomainSession ? { domain_session_id: activeDomainSession.id } : {}),
        session_id: activeSessionId,
      };
      if (!send(outbound)) {
        responseIdRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: "failed" } : m,
          ),
        );
      }
    },
    [projectId, agentId, send, activeDomainSession, activeSessionId, status],
  );

  // Enter a domain by command (e.g. "/prd")
  const enterDomain = useCallback(
    async (domainId: string, domainCommand: string, overrideRoleId?: string) => {
      const effectiveRoleId = overrideRoleId ?? agentId;
      if (!effectiveRoleId || activeDomainSession) return;

      try {
        setIsDomainPending(true);
        const session = await createDomainSession(domainId, projectId, effectiveRoleId);
        // Don't activate yet — wait for worker's DomainEntered event
        pendingDomainSessionRef.current = session;

        // Send domain enter event via WebSocket (include the backend session
        // ID so the harness stores its domain runner under the same key).
        const outbound: ChatDomainEnterOutbound = {
          type: "chat.domain_enter",
          project_id: projectId,
          agent_id: effectiveRoleId,
          domain_command: domainCommand,
          session_id: session.id,
        };
        send(outbound);
      } catch (err) {
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
    [projectId, agentId, activeDomainSession, send],
  );

  // Exit the active domain
  const exitDomain = useCallback(async () => {
    if (!activeDomainSession || !agentId) return;

    try {
      await completeDomainSession(activeDomainSession.id);

      // Send domain exit event via WebSocket — don't clear activeDomainSession yet,
      // wait for worker's DomainExited event to trigger exit animations
      const outbound: ChatDomainExitOutbound = {
        type: "chat.domain_exit",
        project_id: projectId,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
      };
      send(outbound);
    } catch (err) {
      console.error("Failed to exit domain:", err);
    }
  }, [projectId, agentId, activeDomainSession, send]);

  // Cancel the active domain (discard artifact)
  const cancelDomain = useCallback(async () => {
    if (!activeDomainSession || !agentId) return;

    try {
      await cancelDomainSession(activeDomainSession.id);

      const outbound: ChatDomainExitOutbound = {
        type: "chat.domain_exit",
        project_id: projectId,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
      };
      send(outbound);
    } catch (err) {
      console.error("Failed to cancel domain:", err);
    }
  }, [projectId, agentId, activeDomainSession, send]);

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

    // Send cancel over WebSocket
    const outbound: ChatCancelOutbound = {
      type: "chat.cancel",
      project_id: projectId,
      ...(agentId ? { agent_id: agentId } : {}),
    };
    send(outbound);
  }, [projectId, agentId, isTyping, send]);

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
      send({
        type: "chat.session_delete",
        project_id: projectId,
        agent_id: agentId,
        session_id: sessionId,
      });
    },
    [projectId, agentId, send],
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
