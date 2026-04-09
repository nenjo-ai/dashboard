"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { fetchCurrentUser } from "./api";
import { useChatWebSocket, type ChatWsStatus } from "./chat-websocket";

type Subscriber = (data: unknown) => void;
type ToolState = { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: ToolState[] };
const MAX_VISIBLE_TOOL_CALLS = 3;

interface WebSocketContextValue {
  status: ChatWsStatus;
  send: (msg: unknown) => boolean;
  userId: string | null;
  subscribe: (cb: Subscriber) => () => void;
  /**
   * The agent_id that has an in-flight response (between send and Done/Error).
   * Backed by sessionStorage so it survives component remounts.
   * `null` when idle.
   */
  pendingAgentId: string | null;
  /** Active tool calls persisted across navigation. */
  persistedActiveTools: ToolState[];
  /** In-progress assistant preview persisted across navigation. */
  persistedLivePreview?: string;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const BUFFER_CAP = 200;
const PENDING_KEY = "nenjo:pendingAgentId";
const TOOLS_KEY = "nenjo:activeTools";
const LIVE_PREVIEW_KEY = "nenjo:livePreview";

// ── sessionStorage-backed pending flag ────────────────────────────────────
// Written synchronously so the value survives provider re-renders, remounts,
// and React batching edge-cases.

function readPendingRoleId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePendingRoleId(roleId: string | null): void {
  try {
    if (roleId) {
      sessionStorage.setItem(PENDING_KEY, roleId);
    } else {
      sessionStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // SSR or sessionStorage unavailable — ignore
  }
}

function readLivePreview(): string | undefined {
  try {
    return sessionStorage.getItem(LIVE_PREVIEW_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeLivePreview(preview?: string): void {
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

function isAbilityTool(name: string): boolean {
  return name.startsWith("ability/");
}

function appendPreview(existing?: string, incoming?: string): string | undefined {
  const next = incoming?.trim();
  if (!next) return existing;
  const prev = existing?.trim();
  return prev ? `${prev}\n\n${next}` : next;
}

function limitRecentTools<T>(tools: T[]): T[] {
  return tools.slice(-MAX_VISIBLE_TOOL_CALLS);
}

function readActiveTools(): ToolState[] {
  try {
    const raw = sessionStorage.getItem(TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeActiveTools(tools: ToolState[]): void {
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

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingAgentId, setPendingRoleId] = useState<string | null>(readPendingRoleId);
  const [persistedActiveTools, setPersistedActiveTools] = useState<ToolState[]>(readActiveTools);
  const [persistedLivePreview, setPersistedLivePreview] = useState<string | undefined>(readLivePreview);

  const subscribersRef = useRef<Set<Subscriber>>(new Set());
  const bufferRef = useRef<unknown[]>([]);

  // Fetch the current user for REST consumers that still rely on it.
  // Retry when auth is ready instead of giving up permanently on the first race.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const loadCurrentUser = async () => {
      try {
        const u = await fetchCurrentUser();
        if (!cancelled && u.user_id) {
          setUserId(u.user_id);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch current user:", err);
        }
      }

      if (!cancelled) {
        retryTimer = setTimeout(() => {
          void loadCurrentUser();
        }, 2000);
      }
    };

    void loadCurrentUser();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [isLoaded, isSignedIn]);

  const handleMessage = useCallback((data: unknown) => {
    // Check for Done/Error to clear pending state
    const envelope = data as { payload?: unknown };
    const inner = (envelope.payload ?? data) as Record<string, unknown>;
    if (inner.type === "agent_response" && inner.payload) {
      const streamEvent = inner.payload as { event_type: string; data?: Record<string, unknown> };
      console.debug("[nenjo] worker turn event", streamEvent.event_type, streamEvent.data);
      if (streamEvent.event_type === "Done" || streamEvent.event_type === "Error") {
        writePendingRoleId(null);
        setPendingRoleId(null);
        writeActiveTools([]);
        setPersistedActiveTools([]);
        writeLivePreview(undefined);
        setPersistedLivePreview(undefined);
      }
      if (streamEvent.event_type === "AbilityActivated" && streamEvent.data) {
        const { ability_tool_name, task_preview } = streamEvent.data as {
          ability_tool_name: string;
          task_preview?: string;
        };
        const nextPreview = appendPreview(readLivePreview(), task_preview);
        writeLivePreview(nextPreview);
        setPersistedLivePreview(nextPreview);
        const prevTools = readActiveTools();
        const existing = prevTools.find((tool) => tool.name === ability_tool_name);
        if (existing) {
          const nextTools: ToolState[] = [{
            ...existing,
            args: "",
            status: "running",
            textPreview: appendPreview(existing.textPreview, task_preview),
            outputPreview: undefined,
            errorPreview: undefined,
          }];
          writeActiveTools(nextTools);
          setPersistedActiveTools(nextTools);
        } else {
          const nextTools: ToolState[] = [{
            name: ability_tool_name,
            args: "",
            textPreview: task_preview?.trim() || undefined,
            status: "running",
            children: [],
          }];
          writeActiveTools(nextTools);
          setPersistedActiveTools(nextTools);
        }
      }
      if (streamEvent.event_type === "AbilityCompleted" && streamEvent.data) {
        const { ability_tool_name, success, result_preview } = streamEvent.data as {
          ability_tool_name: string;
          success: boolean;
          result_preview: string;
        };
        const nextPreview = appendPreview(readLivePreview(), result_preview);
        writeLivePreview(nextPreview);
        setPersistedLivePreview(nextPreview);
        const prevTools = readActiveTools();
        const nextTools: ToolState[] = prevTools.map((tool) => tool.name === ability_tool_name ? {
          ...tool,
          status: success ? "completed" as const : "failed" as const,
          textPreview: appendPreview(tool.textPreview, result_preview),
          outputPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? result_preview : tool.outputPreview),
          errorPreview: isAbilityTool(ability_tool_name) ? undefined : (success ? tool.errorPreview : result_preview),
        } : tool);
        writeActiveTools(nextTools);
        setPersistedActiveTools(nextTools);
      }
      // Persist tool invocation state so it survives navigation
      if (streamEvent.event_type === "ToolInvoked" && streamEvent.data) {
        const { tool_name, tool_args, text_preview, parent_tool_name } = streamEvent.data as { tool_name: string; tool_args: string; text_preview?: string; parent_tool_name?: string };
        const nextPreview = appendPreview(readLivePreview(), text_preview);
        writeLivePreview(nextPreview);
        setPersistedLivePreview(nextPreview);
        const prevTools = readActiveTools();
        if (parent_tool_name) {
          if (tool_name === parent_tool_name) {
            return;
          }
          const existing = prevTools.find((tool) => tool.name === parent_tool_name);
          if (!existing) {
            const nextTools: ToolState[] = [
              ...prevTools,
              {
                name: parent_tool_name,
                args: "",
                textPreview: text_preview?.trim() || undefined,
                status: "running" as const,
                children: [
                  { name: tool_name, args: tool_args || "", textPreview: undefined, status: "running" as const },
                ],
              },
            ];
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          } else {
            const nextTools: ToolState[] = prevTools.map((tool) => {
              if (tool.name !== parent_tool_name) return tool;
              return {
                ...tool,
                textPreview: appendPreview(tool.textPreview, text_preview),
                children: limitRecentTools([
                  ...(tool.children ?? []),
                  { name: tool_name, args: tool_args || "", textPreview: undefined, status: "running" as const },
                ]),
              };
            });
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          }
        }
        if (!parent_tool_name) {
          if (isAbilityTool(tool_name)) {
            const nextTools = limitRecentTools([{
              name: tool_name,
              args: "",
              textPreview: text_preview?.trim() || undefined,
              status: "running" as const,
              children: [],
            }] as ToolState[]);
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          } else {
            const previousPreview = prevTools[0]?.textPreview?.trim() ?? "";
            const nextPreview = text_preview?.trim()
              ? previousPreview
                ? `${previousPreview}\n\n${text_preview.trim()}`
                : text_preview.trim()
              : previousPreview;
            const nextTools = limitRecentTools([{ name: tool_name, args: tool_args || "", textPreview: nextPreview || undefined, status: "running" as const, children: [] }] as ToolState[]);
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          }
        }
      }
      if (streamEvent.event_type === "ToolsInvoked" && streamEvent.data) {
        const { tool_names, tool_args, text_preview, parent_tool_name } = streamEvent.data as { tool_names: string[]; tool_args: string[]; text_preview?: string; parent_tool_name?: string };
        const nextPreview = appendPreview(readLivePreview(), text_preview);
        writeLivePreview(nextPreview);
        setPersistedLivePreview(nextPreview);
        const prevTools = readActiveTools();
        if (parent_tool_name) {
          const filteredNames = tool_names.filter((name) => name !== parent_tool_name);
          const filteredArgs = filteredNames.map((name) => {
            const idx = tool_names.indexOf(name);
            return tool_args?.[idx] || "";
          });
          const newChildren = tool_names.map((name, i) => ({
            name,
            args: tool_args?.[i] || "",
            textPreview: undefined,
            status: "running" as const,
          })).filter((child) => child.name !== parent_tool_name);
          if (filteredNames.length === 0) {
            return;
          }
          const existing = prevTools.find((tool) => tool.name === parent_tool_name);
          if (!existing) {
            const nextTools: ToolState[] = [
              ...prevTools,
              {
                name: parent_tool_name,
                args: "",
                textPreview: text_preview?.trim() || undefined,
                status: "running" as const,
                children: limitRecentTools(newChildren.map((child, i) => ({ ...child, args: filteredArgs[i] || child.args }))),
              },
            ];
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          } else {
            const nextTools: ToolState[] = prevTools.map((tool) => {
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
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
          }
        }
        if (!parent_tool_name) {
          const previousPreview = prevTools[0]?.textPreview?.trim() ?? "";
          const nextPreview = text_preview?.trim()
            ? previousPreview
              ? `${previousPreview}\n\n${text_preview.trim()}`
              : text_preview.trim()
            : previousPreview;
          const nextTools = limitRecentTools(tool_names.map((name, i) => ({ name, args: tool_args?.[i] || "", textPreview: nextPreview || undefined, status: "running" as const, children: [] })) as ToolState[]);
          writeActiveTools(nextTools);
          setPersistedActiveTools(nextTools);
        }
      }
      if (streamEvent.event_type === "ToolCompleted" && streamEvent.data) {
        const { tool_name, success, output_preview, error_preview, parent_tool_name } = streamEvent.data as { tool_name: string; success: boolean; output_preview?: string; error_preview?: string; parent_tool_name?: string };
        const prevTools = readActiveTools();
        if (parent_tool_name) {
          if (tool_name === parent_tool_name) {
            return;
          }
          const nextTools = prevTools.map((tool) => {
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
          });
          writeActiveTools(nextTools);
          setPersistedActiveTools(nextTools);
        }
        if (!parent_tool_name) {
          if (isAbilityTool(tool_name)) {
            const nextTools: ToolState[] = prevTools.map((tool) => tool.name === tool_name ? {
              ...tool,
              status: success ? "completed" as const : "failed" as const,
            } : tool);
            writeActiveTools(nextTools);
            setPersistedActiveTools(nextTools);
            return;
          }
          const nextTools: ToolState[] = prevTools.map((tool) => tool.name === tool_name ? {
            ...tool,
            status: success ? "completed" as const : "failed" as const,
            outputPreview: output_preview,
            errorPreview: error_preview,
          } : tool);
          writeActiveTools(nextTools);
          setPersistedActiveTools(nextTools);
        }
      }
      if (streamEvent.event_type === "Token") {
        // Tokens clear tool state (tool finished, now streaming text)
        writeActiveTools([]);
        setPersistedActiveTools([]);
        writeLivePreview(undefined);
        setPersistedLivePreview(undefined);
      }
    }
    // Legacy format
    if ((inner as { type?: string }).type === "chat.response" || (inner as { type?: string }).type === "chat.error") {
      writePendingRoleId(null);
      setPendingRoleId(null);
      writeActiveTools([]);
      setPersistedActiveTools([]);
      writeLivePreview(undefined);
      setPersistedLivePreview(undefined);
    }

    const subs = subscribersRef.current;
    if (subs.size === 0) {
      // No subscribers — buffer the message
      const buf = bufferRef.current;
      buf.push(data);
      if (buf.length > BUFFER_CAP) {
        buf.shift();
      }
    } else {
      subs.forEach((cb) => cb(data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { status, send: wsSend } = useChatWebSocket({
    enabled: isLoaded && isSignedIn,
    onMessage: handleMessage,
    onConnected: (connectedUserId) => {
      if (connectedUserId) {
        setUserId((prev) => prev ?? connectedUserId);
      }
    },
  });

  const send = useCallback(
    (msg: unknown) => {
      const typed = msg as { type?: string; agent_id?: string };
      if (typed.type === "chat.message" && typed.agent_id) {
        writePendingRoleId(typed.agent_id);
        setPendingRoleId(typed.agent_id);
      }
      if (typed.type === "chat.cancel") {
        writePendingRoleId(null);
        setPendingRoleId(null);
        writeActiveTools([]);
        setPersistedActiveTools([]);
        writeLivePreview(undefined);
        setPersistedLivePreview(undefined);
      }
      return wsSend(msg);
    },
    [wsSend],
  );

  const subscribe = useCallback((cb: Subscriber) => {
    // Flush buffer synchronously to new subscriber
    const buf = bufferRef.current;
    if (buf.length > 0) {
      for (const msg of buf) {
        cb(msg);
      }
      bufferRef.current = [];
    }
    subscribersRef.current.add(cb);

    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  const value = useMemo(
    () => ({ status, send, userId, subscribe, pendingAgentId, persistedActiveTools, persistedLivePreview }),
    [status, send, userId, subscribe, pendingAgentId, persistedActiveTools, persistedLivePreview],
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return ctx;
}
