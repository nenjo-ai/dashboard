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
  markChatSessionRead,
  notificationsUnreadUrl,
} from "@/lib/api";
import type { ChatSessionExtended, UnreadSummary } from "@/lib/types";
import GlobalSessionList from "./GlobalSessionList";
import { ChatArea } from "./ChatArea";
import { NewChatModal } from "./NewChatModal";
import { MobileChatContainer } from "./MobileChatContainer";
import { useSafeRouter } from "@/lib/safeRouter";
import { useAgents } from "@/lib/hooks";
import { useChatSessionIndicators } from "@/lib/useChatSessionIndicators";
import { ChatConversationHeader } from "./ChatConversationHeader";
import { normalizeLegacyNotificationUrl } from "@/lib/chat/notificationNavigation";

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
  const [localSelectedSessionId, setSelectedSessionId] = useState<
    string | null
  >(() => sessionParam);
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

  // Legacy notification URLs now land in the unified conversation view.
  useEffect(() => {
    const destination = normalizeLegacyNotificationUrl(pathname, searchParams.toString());
    if (destination) router.replace(destination, { scroll: false });
  }, [pathname, router, searchParams]);

  // Fetch the one authoritative set of conversational sessions.
  const {
    data: sessions,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionExtended[]>(
    isMobileViewport
      ? null
      : allChatSessionsUrl(1000, 0, "all"),
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true, dedupingInterval: 5000 },
  );
  const { data: unread, mutate: mutateUnread } = useSWR<UnreadSummary>(
    notificationsUnreadUrl(),
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
  const unreadCounts = useMemo(
    () =>
      Object.fromEntries(
        (unread?.by_agent ?? []).map((entry) => [
          entry.session_id,
          entry.unread_count,
        ]),
      ),
    [unread?.by_agent],
  );

  const [showNewChat, setShowNewChat] = useState(false);

  // Find active session data
  const activeSession = useMemo(
    () => sessions?.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );
  const { agents } = useAgents();
  const activeAgentColor = useMemo(() => {
    const activeAgentId =
      activeSession?.target_agent_id ?? activeSession?.agent_id;
    return activeAgentId
      ? agents?.find((agent) => agent.id === activeAgentId)?.color
      : undefined;
  }, [activeSession?.agent_id, activeSession?.target_agent_id, agents]);
  const selectedIndicatorSessionIds = useMemo(
    () => (selectedSessionId ? [selectedSessionId] : []),
    [selectedSessionId],
  );
  const selectedSessionIndicators = useChatSessionIndicators(
    selectedIndicatorSessionIds,
  );
  const selectedSessionStatus = selectedSessionId
    ? selectedSessionIndicators[selectedSessionId]?.status
    : undefined;

  useEffect(() => {
    if (!selectedSessionId || !unreadCounts[selectedSessionId]) return;
    void markChatSessionRead(selectedSessionId)
      .then(() => mutateUnread())
      .catch(() => {
        // The selected session may have been removed between refreshes.
      });
  }, [mutateUnread, selectedSessionId, unreadCounts]);

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
  }, [
    searchParams,
    sessions,
    selectedSessionId,
    selectSession,
    isMobileViewport,
  ]);

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
    if (
      sessionParam === selectedSessionId ||
      pendingNavigationSessionRef.current === selectedSessionId
    ) {
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
  }, [
    selectedSessionId,
    sessions,
    sessionsLoading,
    searchParams,
    router,
    pathname,
    isMobileViewport,
    mutateSessions,
    sessionParam,
  ]);

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
          (s) =>
            s.project_id === projectId &&
            s.target_type === targetType &&
            (s.target_agent_id ?? s.target_council_id) === targetId,
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
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-transparent md:rounded-[1.4rem] md:border md:border-black/[0.07] md:bg-white/65 md:shadow-[0_18px_60px_rgba(15,23,42,0.07)] md:backdrop-blur-xl md:dark:border-white/[0.08] md:dark:bg-[#070a10]/70 md:dark:shadow-[0_22px_70px_rgba(0,0,0,0.35)]">
      {/* Session list — left panel (desktop: always visible, mobile: animated) */}
      {!isMobileViewport && (
        <div className="w-[19rem] shrink-0 border-r border-black/[0.06] bg-slate-50/65 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <GlobalSessionList
            sessions={sessions ?? []}
            activeSessionId={selectedSessionId}
            isLoading={sessionsLoading}
            onSelect={selectSession}
            onCreate={() => setShowNewChat(true)}
            onRename={handleRename}
            onDelete={handleDelete}
            unreadCounts={unreadCounts}
          />
        </div>
      )}

      {/* Mobile: Grok-style shell */}
      {isMobileViewport && (
        <div className="relative min-h-0 flex-1 min-w-0 overflow-hidden">
          <MobileChatContainer
            onSessionCreated={() => mutateSessions()}
            unreadCounts={unreadCounts}
          />
        </div>
      )}

      {/* Chat area — right panel (desktop only) */}
      {!isMobileViewport && (
        <div className="min-h-0 min-w-0 flex-1 bg-white/55 dark:bg-[#06090f]/55">
          {activeSession ? (
            <div className="flex h-full min-h-0 flex-col">
              <ChatConversationHeader
                session={activeSession}
                agentColor={activeAgentColor}
                status={selectedSessionStatus}
              />

              {/* Chat content */}
              <div className="flex-1 min-h-0">
                <ChatArea
                    key={`${activeSession.id}:${activeSession.target_type}:${activeSession.target_agent_id ?? activeSession.target_council_id}`}
                    projectId={activeSession.project_id}
                    agentId={
                      (activeSession.target_agent_id ??
                        activeSession.target_council_id)!
                    }
                    targetType={activeSession.target_type}
                    sessionId={activeSession.id}
                    onNavigateToSession={navigateToSessionById}
                    onSessionCreated={() => mutateSessions()}
                  />
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

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreate={handleCreateChat}
        />
      )}
    </div>
  );
}
