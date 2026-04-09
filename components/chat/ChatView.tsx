"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { motion, AnimatePresence } from "motion/react";
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

export function ChatView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Active session from URL
  const sessionParam = searchParams.get("session");
  const channelParam = searchParams.get("channel");
  const isNotificationView = channelParam === "notifications";

  // Fetch sessions — filtered by channel type
  const {
    data: sessions,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionExtended[]>(
    allChatSessionsUrl(50, 0, isNotificationView ? "notification" : "chat"),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Navigate to a session by ID (used by ChatArea's @mention session picker)
  const navigateToSessionById = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("project");
      params.delete("agent");
      params.set("session", sessionId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setMobileShowChat(true);
    },
    [searchParams, router, pathname],
  );

  // Find active session data
  const activeSession = useMemo(
    () => sessions?.find((s) => s.id === sessionParam) ?? null,
    [sessions, sessionParam],
  );

  // Navigate to a session
  const selectSession = useCallback(
    (session: ChatSessionExtended) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", session.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setMobileShowChat(true);
    },
    [searchParams, router, pathname],
  );

  // Handle deep-link: if URL has project+agent params, find the latest session
  useEffect(() => {
    const projectParam = searchParams.get("project");
    const agentParam = searchParams.get("agent");
    if (projectParam && agentParam && !sessionParam && sessions) {
      const match = sessions.find(
        (s) => s.project_id === projectParam && s.agent_id === agentParam,
      );
      if (match) {
        const timer = setTimeout(() => selectSession(match), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, sessions, sessionParam, selectSession]);

  // Auto-select most recent session when landing with no session param
  useEffect(() => {
    if (!sessionParam && sessions && sessions.length > 0) {
      const timer = setTimeout(() => selectSession(sessions[0]), 0);
      return () => clearTimeout(timer);
    }
  }, [sessions, sessionParam, selectSession]);

  // Recover when the URL points at a session that is no longer in the fetched list.
  useEffect(() => {
    if (!sessionParam || sessionsLoading || !sessions) return;
    if (sessions.some((s) => s.id === sessionParam)) return;

    const params = new URLSearchParams(searchParams.toString());
    if (sessions.length > 0) {
      params.set("session", sessions[0].id);
      const timer = setTimeout(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        setMobileShowChat(true);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        params.delete("session");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [sessionParam, sessions, sessionsLoading, searchParams, router, pathname]);

  // Create new chat
  const handleCreateChat = useCallback(
    async (projectId: string, agentId: string, agentName: string) => {
      // Count existing sessions for this project+agent to auto-name
      const existingCount =
        sessions?.filter(
          (s) => s.project_id === projectId && s.agent_id === agentId,
        ).length ?? 0;

      const title = `${agentName.charAt(0).toUpperCase() + agentName.slice(1)} #${existingCount + 1}`;

      const newSession = await createChatSession({
        project_id: projectId,
        agent_id: agentId,
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
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setMobileShowChat(true);
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
      if (id === sessionParam) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("session");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [mutateSessions, sessionParam, searchParams, router, pathname],
  );

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Session list — left panel (desktop: always visible, mobile: animated) */}
      <div className="hidden md:block w-80 shrink-0 border-r border-gray-200 dark:border-gray-700">
        <GlobalSessionList
          sessions={sessions ?? []}
          activeSessionId={sessionParam}
          isLoading={sessionsLoading}
          onSelect={selectSession}
          onCreate={isNotificationView ? undefined : () => setShowNewChat(true)}
          onRename={isNotificationView ? undefined : handleRename}
          onDelete={handleDelete}
          channelType={isNotificationView ? "notification" : "chat"}
        />
      </div>

      {/* Mobile: animated panel swap */}
      <div className="relative flex-1 min-w-0 md:hidden overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {!mobileShowChat ? (
            <motion.div
              key="session-list"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0"
            >
              <GlobalSessionList
                sessions={sessions ?? []}
                activeSessionId={sessionParam}
                isLoading={sessionsLoading}
                onSelect={selectSession}
                onCreate={isNotificationView ? undefined : () => setShowNewChat(true)}
                onRename={isNotificationView ? undefined : handleRename}
                onDelete={handleDelete}
                channelType={isNotificationView ? "notification" : "chat"}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat-area"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0"
            >
              {activeSession ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
                    <button
                      onClick={() => setMobileShowChat(false)}
                      className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {activeSession.agent_display_name ?? activeSession.agent_name}
                      </h2>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {isNotificationView
                          ? `@${activeSession.agent_name}`
                          : `${activeSession.project_name === "__system__" ? "General" : activeSession.project_name} · @${activeSession.agent_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    {isNotificationView ? (
                      <NotificationArea
                        agentId={activeSession.agent_id}
                        sessionId={activeSession.id}
                        agentName={activeSession.agent_display_name ?? activeSession.agent_name}
                      />
                    ) : (
                      <ChatArea
                        projectId={activeSession.project_id!}
                        agentId={activeSession.agent_id}
                        sessionId={activeSession.id}
                        onNavigateToSession={navigateToSessionById}
                        onSessionCreated={() => mutateSessions()}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat area — right panel (desktop only) */}
      <div className="hidden md:block flex-1 min-w-0">
        {activeSession ? (
          <div className="flex h-full flex-col">
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {activeSession.agent_display_name ?? activeSession.agent_name}
                </h2>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {isNotificationView
                    ? `@${activeSession.agent_name}`
                    : `${activeSession.project_name === "__system__" ? "General" : activeSession.project_name} · @${activeSession.agent_name}`}
                </p>
              </div>
            </div>

            {/* Chat content */}
            <div className="flex-1 min-h-0">
              {isNotificationView ? (
                <NotificationArea
                  agentId={activeSession.agent_id}
                  sessionId={activeSession.id}
                  agentName={activeSession.agent_display_name ?? activeSession.agent_name}
                />
              ) : (
                <ChatArea
                  projectId={activeSession.project_id!}
                  agentId={activeSession.agent_id}
                  sessionId={activeSession.id}
                  onNavigateToSession={navigateToSessionById}
                  onSessionCreated={() => mutateSessions()}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="hidden md:flex h-full items-center justify-center">
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
