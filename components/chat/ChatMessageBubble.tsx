"use client";

import Image from "next/image";
import { memo } from "react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { visibleLiveAssistantContent } from "@/lib/chat/derivations";
import { traceActivitySummary } from "@/lib/agentRunTrace/presentation";
import type { ChatPhase } from "@/lib/chat/types";
import type { AgentDefinition, ChatMessage } from "@/lib/types";
import { AssistantResponseContent } from "./AssistantResponseContent";
import { ChatActivityTimeline } from "./ChatActivityTimeline";
import { ChatErrorState } from "./ChatErrorState";
import {
  ChatProgressIndicator,
  MessageDeliveryStatus,
} from "./ChatProgressIndicator";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function messageCommandDisplay(
  message: ChatMessage,
  content: string,
): { command: string; content: string } | null {
  if (message.role !== "user") return null;
  const command = message.command?.trim();
  if (command?.startsWith("/")) {
    const body =
      content === command
        ? ""
        : content.startsWith(`${command} `)
          ? content.slice(command.length).trimStart()
          : content;
    return { command, content: body };
  }
  const match = content.match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
  return match
    ? { command: match[1], content: match[2]?.trimStart() ?? "" }
    : null;
}

function UserAvatar({
  imageUrl,
  initials,
}: {
  imageUrl?: string | null;
  initials: string;
}) {
  return imageUrl ? (
    <Image
      src={imageUrl}
      alt="You"
      width={32}
      height={32}
      unoptimized
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-deep-space-blue-100 text-xs font-bold text-deep-space-blue-700">
      {initials}
    </div>
  );
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
  activeAgent,
  userImageUrl,
  userInitials,
  onDelete,
  onRetry,
  compact,
  livePhase,
}: {
  message: ChatMessage;
  activeAgent?: AgentDefinition;
  userImageUrl?: string | null;
  userInitials: string;
  onDelete?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  compact?: boolean;
  livePhase?: ChatPhase;
}) {
  const isUser = message.role === "user";
  const rawContent = compact
    ? message.content.replace(UUID_RE, (match) => `${match.slice(0, 8)}…`)
    : message.content;
  const commandDisplay = messageCommandDisplay(message, rawContent);
  const displayContent = commandDisplay?.content ?? rawContent;
  const isLiveResponse =
    message.isLiveDraft === true && livePhase !== undefined;
  const assistantContent = isLiveResponse
    ? visibleLiveAssistantContent(displayContent, message.runTrace)
    : displayContent;
  const isStreamingResponse =
    isLiveResponse && Boolean(assistantContent.trim());
  const progressLabel =
    livePhase === "using_tool" && message.runTrace
      ? traceActivitySummary(message.runTrace).status
      : undefined;

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3.5",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div className="hidden md:block">
        {isUser ? (
          <UserAvatar imageUrl={userImageUrl} initials={userInitials} />
        ) : activeAgent ? (
          <RoleIdenticon
            roleId={activeAgent.id}
            color={activeAgent.color}
            size={30}
            className="shrink-0"
            name={activeAgent.name}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-tangerine-100 text-xs font-bold text-vivid-tangerine-700">
            AI
          </div>
        )}
      </div>
      <div
        className={cn(
          "overflow-hidden break-normal text-[15px] leading-7 md:break-words md:text-[15px] md:leading-7",
          isUser
            ? "max-w-[84%] rounded-2xl rounded-tr-md border border-deep-space-blue-700/10 bg-deep-space-blue-600 px-4 py-3 text-white shadow-[0_8px_22px_rgba(37,55,105,0.12)] md:max-w-[68%] dark:border-white/5 dark:bg-deep-space-blue-500 dark:text-white"
            : "w-full max-w-full bg-transparent px-0 py-0.5 text-gray-800 md:max-w-[44rem] dark:text-gray-200",
        )}
      >
        {isUser ? (
          <div className="space-y-2">
            {commandDisplay ? (
              <div className="flex min-w-0">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-gray-300 bg-white/60 px-2 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300 md:border-white/25 md:bg-white/10 md:text-deep-space-blue-50">
                  <span className="shrink-0 text-[10px] uppercase text-gray-400 md:text-deep-space-blue-100">
                    Command
                  </span>
                  <span className="min-w-0 truncate font-mono">
                    {commandDisplay.command}
                  </span>
                </span>
              </div>
            ) : null}
            {displayContent.trim() ? (
              <p className="whitespace-pre-wrap">{displayContent}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3.5">
            {isLiveResponse && !isStreamingResponse ? (
              <ChatProgressIndicator
                phase={livePhase}
                label={progressLabel}
                agentName={activeAgent?.name}
              />
            ) : null}
            <AssistantResponseContent
              content={assistantContent}
              streaming={isStreamingResponse}
            />
            <ChatActivityTimeline
              message={message}
              compact={compact}
              hasResponseContent={Boolean(assistantContent.trim())}
              isLive={isLiveResponse}
            />
            <ChatErrorState message={message} onRetry={onRetry} />
          </div>
        )}
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1.5",
            isUser && "justify-end",
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              isUser ? "text-deep-space-blue-100" : "text-gray-400",
            )}
            suppressHydrationWarning
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isUser ? (
            <AnimatePresence mode="wait">
              <MessageDeliveryStatus status={message.status} />
            </AnimatePresence>
          ) : null}
          {!isUser &&
          (message.inputTokens !== undefined ||
            message.outputTokens !== undefined) ? (
            <span className="text-[10px] text-gray-400 tabular-nums">
              {message.inputTokens?.toLocaleString() ?? 0} in ·{" "}
              {message.outputTokens?.toLocaleString() ?? 0} out
            </span>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 text-gray-400 hover:text-flag-red-500 dark:hover:text-flag-red-400"
              title="Delete message"
              aria-label="Delete message"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
