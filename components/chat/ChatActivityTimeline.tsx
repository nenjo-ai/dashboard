"use client";

import { AssistantActivity } from "./AssistantActivity";
import type { ChatMessage } from "@/lib/types";

export function ChatActivityTimeline({
  message,
  compact,
  hasResponseContent,
  isLive,
}: {
  message: ChatMessage;
  compact?: boolean;
  hasResponseContent: boolean;
  isLive?: boolean;
}) {
  return (
    <AssistantActivity
      message={message}
      compact={compact}
      hasResponseContent={hasResponseContent}
      isLive={isLive}
    />
  );
}
