"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { ChatSessionExtended } from "@/lib/types";
import {
  allChatSessionsUrl,
  deleteChatSession,
  fetcher,
  updateChatSession,
} from "@/lib/api";
import { useSafeRouter } from "@/lib/safeRouter";
import { MobileNotificationShell } from "./MobileNotificationShell";

export function MobileNotificationContainer() {
  const router = useSafeRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => sessionParam);
  const [mobileShowNotification, setMobileShowNotification] = useState(() => Boolean(sessionParam));

  const {
    data: sessions,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionExtended[]>(
    allChatSessionsUrl(200, 0, "notification"),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  useEffect(() => {
    setSelectedSessionId(sessionParam);
    setMobileShowNotification(Boolean(sessionParam));
  }, [sessionParam]);

  const activeSession = useMemo(
    () => sessions?.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const navigateToSession = useCallback(
    async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setMobileShowNotification(true);

      const params = new URLSearchParams(searchParams.toString());
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
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setMobileShowNotification(false);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("session");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
      await mutateSessions();
    },
    [mutateSessions, pathname, router, searchParams, selectedSessionId],
  );

  return (
    <MobileNotificationShell
      sessions={sessions ?? []}
      activeSession={activeSession}
      sessionsLoading={sessionsLoading}
      mobileShowNotification={mobileShowNotification}
      onSelectSession={selectSession}
      onBack={() => setMobileShowNotification(false)}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );
}
