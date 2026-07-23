"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  fetcher,
  allChatSessionsUrl,
  createChatSession,
  updateChatSession,
  deleteChatSession,
} from "@/lib/api";
import type { ChatSessionExtended } from "@/lib/types";
import GlobalSessionList from "./GlobalSessionList";
import { ChatArea } from "./ChatArea";
import { NotificationArea } from "./NotificationArea";
import { NewChatModal } from "./NewChatModal";
import { MobileChatContainer } from "./MobileChatContainer";
import { MobileNotificationContainer } from "./MobileNotificationContainer";
import { useSafeRouter } from "@/lib/safeRouter";

export function ChatView() {
  const searchParams = useSearchParams();
  const router = useSafeRouter();
  const pathname = usePathname();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  const pendingNavigationSessionRef = useRef<string | null>(null);

  // Active session from URL
  const sessionParam = searchParams.get("session");
  const channelParam = searchParams.get("channel");
  const isNotificationView = channelParam === "notifications";
  const [localSelectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => sessionParam,
  );
  const selectedSessionId = sessionParam ?? localSelectedSessionId;

  useEffect(() => {
    if (sessionParam) {
      pendingNavigationSessionRef.current = sessionParam;
      return;
    }

    pendingNavigationSessionRef.current = null;
    const timer = setTimeout(() => setSelectedSessionId(null), 0);
    return () => clearTimeout(timer);
  }, [sessionParam]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  // Fetch sessions — filtered by channel type
  const {
    data: sessions,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionExtended[]>(
    isMobileViewport
      ? null
      : allChatSessionsUrl(1000, 0, isNotificationView ? "notification" : "chat"),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  const [showNewChat, setShowNewChat] = useState(false);

  // Find active session data
  const activeSession = useMemo(
    () => sessions?.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    if (!sessionParam) {
      pendingNavigationSessionRef.current = null;
      return;
    }
    if (sessions?.some((s) => s.id === sessionParam)) {
      pendingNavigationSessionRef.current = null;
    }
  }, [sessionParam, sessions]);

  // Navigate to a session
  const selectSession = useCallback(
    (session: ChatSessionExtended) => {
      pendingNavigationSessionRef.current = session.id;
      setSelectedSessionId(session.id);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("project");
      params.delete("agent");
      params.set("session", session.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Handle deep-link: if URL has project+agent params, find the latest session
  useEffect(() => {
    if (isMobileViewport) return;
    const projectParam = searchParams.get("project");
    const agentParam = searchParams.get("agent");
    if (projectParam && agentParam && !selectedSessionId && sessions) {
      const match = sessions.find(
        (s) => s.project_id === projectParam && s.agent_id === agentParam,
      );
      if (match) {
        const timer = setTimeout(() => selectSession(match), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, sessions, selectedSessionId, selectSession, isMobileViewport]);

  // Auto-select most recent session when landing with no session param
  useEffect(() => {
    if (isMobileViewport) return;
    if (!selectedSessionId && sessions && sessions.length > 0) {
      const timer = setTimeout(() => selectSession(sessions[0]), 0);
      return () => clearTimeout(timer);
    }
  }, [sessions, selectedSessionId, selectSession, isMobileViewport]);

  // Recover when the URL points at a session that is no longer in the fetched list.
  useEffect(() => {
    if (isMobileViewport) return;
    if (!selectedSessionId || sessionsLoading || !sessions) return;
    if (sessions.some((s) => s.id === selectedSessionId)) return;
    if (sessionParam === selectedSessionId || pendingNavigationSessionRef.current === selectedSessionId) {
      void mutateSessions();
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (sessions.length > 0) {
      params.set("session", sessions[0].id);
      const timer = setTimeout(() => {
        setSelectedSessionId(sessions[0].id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }, 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        params.delete("session");
        setSelectedSessionId(null);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedSessionId, sessions, sessionsLoading, searchParams, router, pathname, isMobileViewport, mutateSessions, sessionParam]);

  // Create new chat
  const handleCreateChat = useCallback(
    async (
      projectId: string | null,
      targetId: string,
      targetName: string,
      targetType: "agent" | "council" = "agent",
    ) => {
      // Count existing sessions for this project+agent to auto-name
      const existingCount =
        sessions?.filter(
          (s) => s.project_id === projectId && s.target_type === targetType && (s.target_agent_id ?? s.target_council_id) === targetId,
        ).length ?? 0;

      const title = `${targetName.charAt(0).toUpperCase() + targetName.slice(1)} #${existingCount + 1}`;

      const newSession = await createChatSession({
        ...(projectId ? { project_id: projectId } : {}),
        ...(targetType === "agent" ? { agent_id: targetId } : {}),
        target_type: targetType,
        target_id: targetId,
        title,
      });

      await mutateSessions();
      setShowNewChat(false);

      // Navigate to the new session
      const params = new URLSearchParams(searchParams.toString());
      // Clean up project/agent params if present
      params.delete("project");
      params.delete("agent");
      params.set("session", newSession.id);
      setSelectedSessionId(newSession.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [sessions, mutateSessions, searchParams, router, pathname],
  );

  // Session actions
  const handleRename = useCallback(
    async (id: string, title: string) => {
      await updateChatSession(id, { title });
      mutateSessions();
    },
    [mutateSessions],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteChatSession(id);
      mutateSessions();
      if (id === selectedSessionId) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("session");
        setSelectedSessionId(null);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [mutateSessions, selectedSessionId, searchParams, router, pathname],
  );

  const navigateToSessionById = useCallback(
    (sessionId: string) => {
      pendingNavigationSessionRef.current = sessionId;
      setSelectedSessionId(sessionId);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("project");
      params.delete("agent");
      params.set("session", sessionId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      void mutateSessions();
    },
    [searchParams, router, pathname, mutateSessions],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-transparent md:rounded-xl md:border md:border-black/10 md:bg-transparent md:dark:border-white/10 md:dark:bg-transparent">
      {/* Session list — left panel (desktop: always visible, mobile: animated) */}
      {!isMobileViewport && (
        <div className="w-80 shrink-0 border-r border-black/10 dark:border-white/10">
          <GlobalSessionList
            sessions={sessions ?? []}
            activeSessionId={selectedSessionId}
            isLoading={sessionsLoading}
            onSelect={selectSession}
            onCreate={isNotificationView ? undefined : () => setShowNewChat(true)}
            onRename={isNotificationView ? undefined : handleRename}
            onDelete={handleDelete}
            channelType={isNotificationView ? "notification" : "chat"}
          />
        </div>
      )}

      {/* Mobile: Grok-style shell */}
      {isMobileViewport && (
        <div className="relative min-h-0 flex-1 min-w-0 overflow-hidden">
          {isNotificationView ? (
            <MobileNotificationContainer />
          ) : (
            <MobileChatContainer onSessionCreated={() => mutateSessions()} />
          )}
        </div>
      )}

      {/* Chat area — right panel (desktop only) */}
      {!isMobileViewport && (
        <div className="min-h-0 flex-1 min-w-0">
          {activeSession ? (
            <div className="flex h-full min-h-0 flex-col">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {activeSession.target_type === "council"
                      ? activeSession.council_name ?? activeSession.title
                      : activeSession.agent_name}
                  </h2>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {isNotificationView
                      ? `@${activeSession.agent_name}`
                      : activeSession.target_type === "council"
                        ? `${activeSession.project_id ? activeSession.project_name : "General"} · Council`
                        : `${activeSession.project_id ? activeSession.project_name : "General"} · @${activeSession.agent_name}`}
                  </p>
                </div>
              </div>

              {/* Chat content */}
              <div className="flex-1 min-h-0">
                {isNotificationView ? (
                  <NotificationArea
                    agentId={activeSession.agent_id!}
                    sessionId={activeSession.id}
                    agentName={activeSession.agent_name}
                    variant="desktop"
                  />
                ) : (
                  <ChatArea
                    key={`${activeSession.id}:${activeSession.target_type}:${activeSession.target_agent_id ?? activeSession.target_council_id}`}
                    projectId={activeSession.project_id}
                    agentId={(activeSession.target_agent_id ?? activeSession.target_council_id)!}
                    targetType={activeSession.target_type}
                    sessionId={activeSession.id}
                    onNavigateToSession={navigateToSessionById}
                    onSessionCreated={() => mutateSessions()}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Select a conversation or start a new chat
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New chat modal — hidden in notification view */}
      {showNewChat && !isNotificationView && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreate={handleCreateChat}
        />
      )}
    </div>
  );
}
