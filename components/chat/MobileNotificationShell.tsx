"use client";

import { motion, AnimatePresence } from "motion/react";
import { Bell } from "lucide-react";
import type { ChatSessionExtended } from "@/lib/types";
import GlobalSessionList from "./GlobalSessionList";
import { NotificationArea } from "./NotificationArea";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileNotificationShellProps {
  sessions: ChatSessionExtended[];
  activeSession: ChatSessionExtended | null;
  sessionsLoading: boolean;
  mobileShowNotification: boolean;
  onSelectSession: (session: ChatSessionExtended) => void;
  onBack: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function MobileNotificationShell({
  sessions,
  activeSession,
  sessionsLoading,
  mobileShowNotification,
  onSelectSession,
  onBack,
  onRename,
  onDelete,
}: MobileNotificationShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-[#f5f7fb] dark:bg-[#05070b]">
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        {mobileShowNotification && activeSession ? (
          <>
            <MobileTouchButton
              onPress={onBack}
              className="flex min-w-0 items-center gap-2.5 rounded-full border border-black/10 bg-transparent px-3 py-2.5 text-gray-900 active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              <span className="block min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]">
                {activeSession.agent_display_name ?? activeSession.agent_name}
              </span>
            </MobileTouchButton>

            <div className="w-7" />
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 text-gray-700 dark:border-white/10 dark:text-gray-100">
                <Bell className="h-5 w-5" />
              </span>
              <span className="block truncate text-[1.55rem] font-semibold tracking-[-0.03em] text-gray-950 dark:text-gray-50">
                Notifications
              </span>
            </div>
            <div className="w-7" />
          </>
        )}
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {!mobileShowNotification ? (
            <motion.div
              key="notification-list"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0 min-h-0"
            >
              <GlobalSessionList
                sessions={sessions}
                activeSessionId={activeSession?.id ?? null}
                isLoading={sessionsLoading}
                onSelect={onSelectSession}
                onDelete={onDelete}
                onRename={onRename}
                channelType="notification"
                hideHeaderControls={true}
                mobile={true}
              />
            </motion.div>
          ) : (
            <motion.div
              key="notification-area"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0 min-h-0"
            >
              {activeSession ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex-1 min-h-0">
                    <NotificationArea
                      agentId={activeSession.agent_id!}
                      sessionId={activeSession.id}
                      agentName={activeSession.agent_display_name ?? activeSession.agent_name}
                      variant="mobile"
                    />
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
