"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ChatSessionExtended, AgentDefinition } from "@/lib/types";
import { useAgents } from "@/lib/hooks";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import GlobalSessionList from "./GlobalSessionList";
import { ChatArea } from "./ChatArea";
import { NotificationArea } from "./NotificationArea";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileChatShellProps {
  sessions: ChatSessionExtended[];
  activeSession: ChatSessionExtended | null;
  sessionsLoading: boolean;
  mobileShowChat: boolean;
  onSelectSession: (session: ChatSessionExtended) => void;
  onBack: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  isNotificationView: boolean;
  onNavigateToSession?: (sessionId: string) => void;
  onSessionCreated?: () => void;
  onSwitchAgent?: (agent: AgentDefinition) => void;
}

export function MobileChatShell({
  sessions,
  activeSession,
  sessionsLoading,
  mobileShowChat,
  onSelectSession,
  onBack,
  onRename,
  onDelete,
  isNotificationView,
  onNavigateToSession,
  onSessionCreated,
  onSwitchAgent,
}: MobileChatShellProps) {
  const { agents: allAgents } = useAgents();

  const activeAgent = useMemo(() => {
    if (!activeSession || !allAgents) return undefined;
    return allAgents.find((a: AgentDefinition) => a.id === activeSession.agent_id && a.model_id);
  }, [activeSession, allAgents]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        {mobileShowChat && activeSession ? (
          <>
            {/* Back button */}
            <MobileTouchButton
              onPress={onBack}
              className="flex items-center gap-1 rounded-lg p-1 text-gray-500 transition-colors active:bg-gray-100 dark:text-gray-400 dark:active:bg-gray-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </MobileTouchButton>

            {/* Agent identity — centered */}
            <div className="flex items-center gap-2">
              {activeAgent ? (
                <RoleIdenticon roleId={activeAgent.id} color={activeAgent.color} size={20} className="shrink-0" roleName={activeAgent.name} />
              ) : null}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {activeSession.agent_display_name ?? activeSession.agent_name}
              </span>
            </div>

            <div className="w-7" />
          </>
        ) : (
          <>
            {/* Logo / brand */}
            <div className="flex items-center gap-2">
              <img
                src="/nenjo-logo-dark.png"
                alt="nenjo"
                className="h-6 w-6 dark:hidden"
              />
              <img
                src="/nenjo-logo-white.png"
                alt="nenjo"
                className="hidden h-6 w-6 dark:block"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                nenjo
              </span>
            </div>
            <div className="w-7" />
          </>
        )}
      </div>

      {/* Content — animated panel swap */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {!mobileShowChat ? (
            <motion.div
              key="session-list"
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
                onCreate={undefined}
                onRename={isNotificationView ? undefined : onRename}
                onDelete={onDelete}
                channelType={isNotificationView ? "notification" : "chat"}
                hideHeaderControls={true}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat-area"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0 min-h-0"
            >
              {activeSession ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex-1 min-h-0">
                    {isNotificationView ? (
                      <NotificationArea
                        agentId={activeSession.agent_id}
                        sessionId={activeSession.id}
                        agentName={activeSession.agent_display_name ?? activeSession.agent_name}
                      />
                    ) : (
                      <ChatArea
                        key={`${activeSession.id}:${activeSession.agent_id}`}
                        projectId={activeSession.project_id!}
                        agentId={activeSession.agent_id}
                        sessionId={activeSession.id}
                        onNavigateToSession={onNavigateToSession}
                        onSessionCreated={onSessionCreated}
                        onSwitchAgent={onSwitchAgent}
                        variant="mobile"
                      />
                    )}
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
