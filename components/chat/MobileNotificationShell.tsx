"use client";

import { motion, AnimatePresence } from "motion/react";
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
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-white dark:bg-gray-900">
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        {mobileShowNotification && activeSession ? (
          <>
            <MobileTouchButton
              onPress={onBack}
              className="flex items-center gap-1 rounded-lg p-1 text-gray-500 transition-colors active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </MobileTouchButton>

            <div className="min-w-0 px-2 text-center">
              <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {activeSession.agent_display_name ?? activeSession.agent_name}
              </span>
              <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                notifications
              </span>
            </div>

            <div className="w-7" />
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Notifications
                </span>
                <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                  persistent inbox
                </span>
              </div>
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
                      agentId={activeSession.agent_id}
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
