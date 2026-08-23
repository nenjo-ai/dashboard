"use client";

import { useChatController } from "./useChatController";
import type { ChatTargetType } from "./chat/types";

/** Small public boundary; implementation details live in cohesive chat modules. */
export function useChat(
  projectId: string | null | undefined,
  agentId?: string,
  initialSessionId?: string,
  targetType: ChatTargetType = "agent",
) {
  return useChatController(projectId, agentId, initialSessionId, targetType);
}

export type UseChatResult = ReturnType<typeof useChat>;
