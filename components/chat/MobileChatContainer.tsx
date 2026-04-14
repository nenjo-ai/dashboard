"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { AgentDefinition, ChatSessionExtended } from "@/lib/types";
import {
  allChatSessionsUrl,
  createChatSession,
  deleteChatSession,
  fetchAllChatSessions,
  fetchSystemProject,
  fetcher,
  updateChatSession,
} from "@/lib/api";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { MobileChatShell } from "./MobileChatShell";
import { MobileNewChatSheet } from "./MobileNewChatSheet";

interface MobileChatContainerProps {
  onSessionCreated?: () => void;
}

export function MobileChatContainer({
  onSessionCreated,
}: MobileChatContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => sessionParam);
  const [mobileShowChat, setMobileShowChat] = useState(() => Boolean(sessionParam));
  const [showNewChatSheet, setShowNewChatSheet] = useState(false);
  const pendingSessionClearRef = useRef(false);

  const {
    data: sessions,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionExtended[]>(
    allChatSessionsUrl(200, 0, "chat"),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  useEffect(() => {
    if (pendingSessionClearRef.current && sessionParam) {
      return;
    }

    if (pendingSessionClearRef.current && !sessionParam) {
      pendingSessionClearRef.current = false;
    }

    setSelectedSessionId(sessionParam);
    setMobileShowChat(Boolean(sessionParam));
  }, [sessionParam]);

  const activeSession = useMemo(
    () => sessions?.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const navigateToSession = useCallback(
    async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setMobileShowChat(true);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("project");
      params.delete("agent");
      params.set("session", sessionId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      await mutateSessions();
    },
    [searchParams, router, pathname, mutateSessions],
  );

  const selectSession = useCallback(
    async (session: ChatSessionExtended) => {
      await navigateToSession(session.id);
    },
    [navigateToSession],
  );

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await updateChatSession(id, { title });
      await mutateSessions();
    },
    [mutateSessions],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteChatSession(id);
      await mutateSessions();
      if (id === selectedSessionId) {
        setSelectedSessionId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("session");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        setMobileShowChat(false);
      }
    },
    [mutateSessions, pathname, router, searchParams, selectedSessionId],
  );

  const handleSwitchAgent = useCallback(
    async (agent: AgentDefinition) => {
      try {
        const agentSessions = (
          await fetchAllChatSessions({
            limit: 200,
            offset: 0,
            channelType: "chat",
          })
        )
          .filter((session) => session.agent_id === agent.id)
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );

        if (agentSessions[0]) {
          await navigateToSession(agentSessions[0].id);
          return;
        }

        const systemProject = await fetchSystemProject();
        const agentLabel = agent.display_name || agent.name;
        const newSession = await createChatSession({
          project_id: systemProject.id,
          agent_id: agent.id,
          title: `${agentLabel.charAt(0).toUpperCase() + agentLabel.slice(1)} #1`,
        });

        await mutateSessions();
        await navigateToSession(newSession.id);
      } catch (err) {
        console.error("Failed to switch mobile agent:", err);
      }
    },
    [mutateSessions, navigateToSession],
  );

  const handleCreateChat = useCallback(
    async (projectId: string, agentId: string, agentName: string) => {
      const existingCount =
        sessions?.filter(
          (session) => session.project_id === projectId && session.agent_id === agentId,
        ).length ?? 0;

      const newSession = await createChatSession({
        project_id: projectId,
        agent_id: agentId,
        title: `${agentName.charAt(0).toUpperCase() + agentName.slice(1)} #${existingCount + 1}`,
      });

      await mutateSessions();
      setShowNewChatSheet(false);
      await navigateToSession(newSession.id);
    },
    [sessions, mutateSessions, navigateToSession],
  );

  const handleBackToList = useCallback(() => {
    pendingSessionClearRef.current = true;
    setMobileShowChat(false);
    setSelectedSessionId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("session");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextUrl);
    }

    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <>
      <MobileChatShell
        sessions={sessions ?? []}
        activeSession={activeSession}
        sessionsLoading={sessionsLoading}
        mobileShowChat={mobileShowChat}
        onCreate={() => setShowNewChatSheet(true)}
        onSelectSession={selectSession}
        onBack={handleBackToList}
        onRename={handleRename}
        onDelete={handleDelete}
        onNavigateToSession={navigateToSession}
        onSessionCreated={async () => {
          await mutateSessions();
          await onSessionCreated?.();
        }}
        onSwitchAgent={handleSwitchAgent}
      />
      {!mobileShowChat && <MobileTabBar />}
      <MobileNewChatSheet
        open={showNewChatSheet}
        onClose={() => setShowNewChatSheet(false)}
        onCreate={handleCreateChat}
      />
    </>
  );
}
