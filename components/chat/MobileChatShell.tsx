"use client";

import { useMemo } from "react";
import type { ChatSessionExtended, AgentDefinition } from "@/lib/types";
import { useAgents } from "@/lib/hooks";
import {
  MOBILE_HERO_BAR_OFFSET,
  MobileHeroBar,
} from "@/components/layout/MobileHeroBar";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import GlobalSessionList from "./GlobalSessionList";
import { ChatArea } from "./ChatArea";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileChatShellProps {
  sessions: ChatSessionExtended[];
  activeSession: ChatSessionExtended | null;
  sessionsLoading: boolean;
  mobileShowChat: boolean;
  onCreate: () => void;
  onSelectSession: (session: ChatSessionExtended) => void;
  onBack: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onNavigateToSession?: (sessionId: string) => void;
  onSessionCreated?: () => void;
  onSwitchAgent?: (agent: AgentDefinition) => void;
}

export function MobileChatShell({
  sessions,
  activeSession,
  sessionsLoading,
  mobileShowChat,
  onCreate,
  onSelectSession,
  onBack,
  onRename,
  onDelete,
  onNavigateToSession,
  onSessionCreated,
  onSwitchAgent,
}: MobileChatShellProps) {
  const { agents: allAgents } = useAgents();

  const activeAgent = useMemo(() => {
    if (!activeSession || !allAgents) return undefined;
    if (activeSession.target_type !== "agent" || !activeSession.agent_id)
      return undefined;
    return allAgents.find(
      (a: AgentDefinition) => a.id === activeSession.agent_id && a.model_id,
    );
  }, [activeSession, allAgents]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-[#f5f7fb] dark:bg-[#05070b]">
      <div className="fixed inset-x-0 top-0 z-30">
        <MobileHeroBar
          title={
            mobileShowChat && activeSession
              ? activeSession.title ||
                (activeSession.target_type === "council"
                  ? (activeSession.council_name ?? "Council")
                  : activeSession.agent_name)
              : "Chat"
          }
          leading={
            mobileShowChat && activeSession ? (
              <MobileTouchButton
                onPress={onBack}
                title="Back to conversations"
                className="flex h-11 min-w-0 shrink-0 items-center gap-2.5 rounded-full border border-black/10 bg-transparent px-3 py-2.5 text-gray-900 active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:text-white"
              >
                <svg
                  className="h-5 w-5 shrink-0 text-gray-600 dark:text-gray-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.25}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
                {activeAgent ? (
                  <RoleIdenticon
                    roleId={activeAgent.id}
                    color={activeAgent.color}
                    size={28}
                    className="shrink-0"
                    name={activeAgent.name}
                  />
                ) : (
                  <NenjoLogoMark className="h-7 w-7" />
                )}
              </MobileTouchButton>
            ) : (
              <NenjoLogoMark />
            )
          }
          trailing={
            <MobileTouchButton
              onPress={onCreate}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-transparent text-gray-700 transition-colors active:scale-[0.98] dark:border-white/10 dark:bg-transparent dark:text-gray-100"
              title="New chat"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.9}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 3.75h-9A2.25 2.25 0 005.25 6v12A2.25 2.25 0 007.5 20.25h9A2.25 2.25 0 0018.75 18V8.25L16.5 3.75Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.25 3.75V8.25H18.75"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 11.25v4.5M9.75 13.5h4.5"
                />
              </svg>
            </MobileTouchButton>
          }
        />
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {!mobileShowChat ? (
          <div
            className="absolute inset-x-0 bottom-0 min-h-0"
            style={{ top: MOBILE_HERO_BAR_OFFSET }}
          >
            <GlobalSessionList
              sessions={sessions}
              activeSessionId={activeSession?.id ?? null}
              isLoading={sessionsLoading}
              onSelect={onSelectSession}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              channelType="chat"
              hideHeaderControls={true}
              mobile={true}
            />
          </div>
        ) : (
          <div
            className="absolute inset-x-0 bottom-0 min-h-0"
            style={{ top: MOBILE_HERO_BAR_OFFSET }}
          >
            {activeSession ? (
              <div className="flex h-full min-h-0 flex-col">
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
                    onNavigateToSession={onNavigateToSession}
                    onSessionCreated={onSessionCreated}
                    onSwitchAgent={onSwitchAgent}
                    variant="mobile"
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
