"use client";

import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import type { ChatSessionIndicatorStatus } from "@/lib/chat/sessionIndicators";
import type { ChatSessionExtended } from "@/lib/types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

const TERMINAL_LABEL: Partial<Record<ChatSessionIndicatorStatus, string>> = {
  completed: "Complete",
  failed: "Needs attention",
  cancelled: "Stopped",
};

export function ChatConversationHeader({
  session,
  agentColor,
  status,
  notificationView = false,
}: {
  session: ChatSessionExtended;
  agentColor?: string;
  status?: ChatSessionIndicatorStatus;
  notificationView?: boolean;
}) {
  const targetName =
    session.target_type === "council"
      ? (session.council_name ?? session.title)
      : session.agent_name;
  const context = session.project_id ? session.project_name : "General";

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/70 px-5 py-3 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#080b11]/75">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-black/[0.06] bg-gray-50 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
        <RoleIdenticon
          roleId={
            session.target_agent_id ??
            session.agent_id ??
            session.target_council_id
          }
          color={agentColor}
          size={30}
          name={targetName}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-gray-950 dark:text-white">
          {session.title || targetName}
        </h2>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">{targetName}</span>
          {!notificationView ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{context}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/80 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">
        <SessionStatusIndicator status={status} />
        {status === "running" ? null : (
          <span>{status ? TERMINAL_LABEL[status] : "Ready"}</span>
        )}
      </div>
    </header>
  );
}
