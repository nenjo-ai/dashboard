"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  authRequestHeaders,
  chatStreamsUrl,
  fetchChatMessages,
  deleteChatMessage,
  cancelChat,
  createDomainSession,
  completeDomainSession,
  cancelDomainSession,
  exitChatDomain,
  fetchActiveDomainSession,
  fetchChatSessions,
  createChatSession,
  updateChatSession,
  archiveChatSession,
  deleteChatSession,
  fetchQuotaStatus,
  notifyChatSessionDelete,
} from "./api";
import {
  decryptContentPayload,
  encryptContentPayload,
  loadStoredAccountContentKey,
  warmAccountContentKey,
} from "./cryptoContent";
import { syncCurrentUserAckToActiveWorkers } from "./workerAckSync";
import { useCurrentUser } from "./hooks";
import { toast } from "./toast";
import {
  clearChatStreamSnapshot,
  type ChatStreamClearSnapshot,
  type ChatStreamSnapshot,
  loadChatStreamSnapshot,
  notifyChatStreamSnapshot,
  persistChatStreamSnapshot,
} from "./chatStreamDurability";
import {
  chatStreamEventToLifecycleEvent,
  mergeAsyncOperationPayload,
} from "./agentRunTrace/adapters/chatStream";
import {
  appendEnvelopeEvent,
  deleteEnvelopeForInputMessage,
  deleteEnvelopesForSession,
  getEnvelopeLinksForInputMessages,
  linkEnvelopeToInputMessage,
  markEnvelopeOrphaned,
  runEnvelopeGc,
} from "./agentRunTrace/envelopeStore";
import { reduceRunTrace } from "./agentRunTrace/reducer";
import {
  assistantActivityInputMessageId,
  clearSnapshotAppliesToResponse,
  compactDuplicateChatMessages,
  createSerialChatWorkQueue,
  isTerminalChatRunTrace,
  lifecycleTraceBase,
  lifecycleRunIdentity,
  preferredChatRunTrace,
  resolveAssistantMessageIdentity,
  retainedLiveChatRunTrace,
  scheduledDraftBelongsToResponse,
  shouldPersistChatActivityEvent,
  upsertLiveAssistantDraft,
  withLiveChatActivityPreview,
} from "./chat/derivations";
import { normalizeToolCallArgs } from "./toolCallDisplay";
import type { AgentLifecycleEvent, RunTrace } from "./agentRunTrace/types";
import {
  ENCRYPTED_USER_MESSAGE_PLACEHOLDER,
  LOCAL_CHAT_SEED_KEY,
  STREAM_CHANNEL_NAME,
} from "./chat/constants";
import {
  lifecycleRunId,
  lifecycleSessionId,
  normalizeSseAgentEvent,
  subscribeToChatStream,
  type NormalizedStreamEvent,
} from "./chat/streaming";
import {
  appendPreview,
  hookToolDisplayName,
  isAbilityTool,
  isProviderTool,
  providerForTool,
  providerToolPreview,
  stringField,
  toolArgsSummary,
  upsertActiveTool,
  type LifecyclePayload,
  type ToolPreviewPayload,
  type ToolStreamData,
} from "./chat/toolCalls";
import {
  isTerminalAssistantStatus,
  terminalPhaseForStatus,
} from "./chat/terminal";
import {
  chatLifecycle,
  chatTurnReducer,
  createChatTurnState,
} from "./chat/state";
import {
  activeChatPhaseForRunStatus,
  type ActiveToolEntry,
  type ChatPhase,
} from "./chat/types";
import type {
  ChatMessage,
  ChatSession,
  ChatStreamRequest,
  DomainSession,
  EncryptedPayload,
  PersistedChatMessage,
} from "./types";

function persistedMessageCommand(
  message: Pick<PersistedChatMessage, "metadata">,
): string | undefined {
  const command = message.metadata?.command;
  return typeof command === "string" && command.trim().startsWith("/")
    ? command.trim()
    : undefined;
}

function isClearSnapshot(
  snapshot: ChatStreamSnapshot | ChatStreamClearSnapshot,
): snapshot is ChatStreamClearSnapshot {
  return "clear" in snapshot && snapshot.clear === true;
}

function generateId(): string {
  return crypto.randomUUID();
}

interface AgentCache {
  messages: ChatMessage[];
  hasMore: boolean;
}

function findLastIndexCompat<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => boolean,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index, items)) {
      return index;
    }
  }
  return -1;
}

function findLastCompat<T>(
  items: T[],
  predicate: (item: T, index: number, array: T[]) => boolean,
): T | undefined {
  const index = findLastIndexCompat(items, predicate);
  return index >= 0 ? items[index] : undefined;
}

function mergeLoadedMessages(
  loaded: ChatMessage[],
  current: ChatMessage[],
): ChatMessage[] {
  const merged = loaded.map((loadedMessage) => {
    const loadedKey = loadedMessage.persistedId ?? loadedMessage.id;
    const localMatch = current.find(
      (message) =>
        (message.persistedId ?? message.id) === loadedKey ||
        (message.role === loadedMessage.role &&
          message.content === loadedMessage.content &&
          isRecentMatch(message, loadedMessage.timestamp)),
    );
    if (localMatch?.status === "cancelled") {
      return {
        ...loadedMessage,
        id: localMatch.id,
        persistedId: loadedKey,
        status: "cancelled" as const,
        runEnvelopeId: loadedMessage.runEnvelopeId ?? localMatch.runEnvelopeId,
        runTrace: loadedMessage.runTrace ?? localMatch.runTrace,
      };
    }
    if (localMatch) {
      return {
        ...loadedMessage,
        id: localMatch.id,
        persistedId: loadedKey,
        status: loadedMessage.status ?? localMatch.status,
        runEnvelopeId: loadedMessage.runEnvelopeId ?? localMatch.runEnvelopeId,
        runTrace: loadedMessage.runTrace ?? localMatch.runTrace,
      };
    }
    return loadedMessage;
  });
  const seen = new Set(
    loaded.map((message) => message.persistedId ?? message.id),
  );

  for (const message of current) {
    const key = message.persistedId ?? message.id;
    if (seen.has(key)) continue;
    const duplicateLoadedMessage = loaded.find((loadedMessage) => {
      if (loadedMessage.role !== message.role) return false;
      if (loadedMessage.content !== message.content) return false;

      const loadedTime = new Date(loadedMessage.timestamp).getTime();
      const currentTime = new Date(message.timestamp).getTime();
      return Math.abs(loadedTime - currentTime) < 120_000;
    });
    if (duplicateLoadedMessage) continue;
    merged.push(message);
    seen.add(key);
  }

  return compactDuplicateChatMessages(merged).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

async function hydrateRunEnvelopeLinks(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const inputMessageIds = messages.reduce<string[]>((ids, message) => {
    const inputMessageId = assistantActivityInputMessageId(message);
    if (inputMessageId) ids.push(inputMessageId);
    return ids;
  }, []);
  const links = await getEnvelopeLinksForInputMessages(inputMessageIds);
  if (links.size === 0) return messages;
  return messages.map((message) => {
    const inputMessageId = assistantActivityInputMessageId(message);
    const link = inputMessageId ? links.get(inputMessageId) : undefined;
    return link ? { ...message, runEnvelopeId: link.envelopeId } : message;
  });
}

async function gcSessionRunEnvelopes(
  sessionId: string,
  orgId?: string | null,
): Promise<void> {
  if (!orgId) return;
  try {
    const quota = await fetchQuotaStatus(orgId);
    await runEnvelopeGc({
      sessionId,
      keepRecent: quota.retention.chat_messages,
    });
  } catch (error) {
    console.warn("Failed to run agent envelope GC", error);
  }
}

function isRecentMatch(
  a: ChatMessage,
  bTimestamp: string,
  windowMs = 120_000,
): boolean {
  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(bTimestamp).getTime();
  return Math.abs(aTime - bTime) < windowMs;
}

function isLikelySameAssistantContent(
  existing: string,
  incoming: string,
): boolean {
  if (existing === incoming) return true;
  if (!existing || !incoming) return false;
  return incoming.startsWith(existing) || existing.startsWith(incoming);
}

function normalizeResolvedAssistantContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return content;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const finalOutput =
        record.final_output ?? record.message ?? record.text ?? record.output;
      if (typeof finalOutput === "string") {
        return finalOutput;
      }
    }
  } catch {
    // Keep the original plaintext if it is not JSON-encoded.
  }

  return content;
}

function isEncryptedUserMessagePlaceholder(content: string): boolean {
  return (
    content.trim().toLowerCase() ===
    ENCRYPTED_USER_MESSAGE_PLACEHOLDER.toLowerCase()
  );
}

async function resolvePersistedMessageContent(
  message: Pick<
    PersistedChatMessage,
    "content" | "metadata" | "encrypted_payload" | "artifact_ids"
  >,
): Promise<string> {
  const withAttachmentFallback = (content: string) => {
    if (content.trim() || !message.artifact_ids?.length) return content;
    const count = message.artifact_ids.length;
    return `Attached ${count} artifact${count === 1 ? "" : "s"}`;
  };
  const encryptedPayload =
    message.encrypted_payload ?? message.metadata?.encrypted_payload;
  if (!encryptedPayload) {
    return withAttachmentFallback(
      normalizeResolvedAssistantContent(message.content),
    );
  }

  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted !== null) {
      return withAttachmentFallback(
        normalizeResolvedAssistantContent(decrypted),
      );
    }
    console.warn("Persisted chat decrypt returned null", {
      hasAck: Boolean(storedAck),
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    await warmAccountContentKey();
    const retried = await decryptContentPayload(encryptedPayload);
    if (retried !== null) {
      return withAttachmentFallback(normalizeResolvedAssistantContent(retried));
    }
    return message.content.trim()
      ? normalizeResolvedAssistantContent(message.content)
      : "[Encrypted assistant message could not be decrypted]";
  } catch (error) {
    console.warn("Failed to decrypt persisted chat content", {
      error,
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    return message.content.trim()
      ? normalizeResolvedAssistantContent(message.content)
      : "[Encrypted assistant message could not be decrypted]";
  }
}

async function resolveEncryptedPreview(
  plaintext: string | undefined,
  encryptedPayload?: EncryptedPayload,
): Promise<string | undefined> {
  if (encryptedPayload) {
    try {
      const storedAck = await loadStoredAccountContentKey();
      const decrypted = await decryptContentPayload(encryptedPayload);
      if (decrypted) return normalizeResolvedAssistantContent(decrypted);
      console.warn("Live preview decrypt returned null", {
        hasAck: Boolean(storedAck),
        accountId: encryptedPayload.account_id,
        objectId: encryptedPayload.object_id,
        objectType: encryptedPayload.object_type,
        algorithm: encryptedPayload.algorithm,
        keyVersion: encryptedPayload.key_version,
      });
      await warmAccountContentKey();
      const retried = await decryptContentPayload(encryptedPayload);
      if (retried) return normalizeResolvedAssistantContent(retried);
    } catch (error) {
      console.warn("Failed to decrypt live preview", {
        error,
        accountId: encryptedPayload.account_id,
        objectId: encryptedPayload.object_id,
        objectType: encryptedPayload.object_type,
        algorithm: encryptedPayload.algorithm,
        keyVersion: encryptedPayload.key_version,
      });
    }
  }
  const trimmed = plaintext?.trim();
  return trimmed ? normalizeResolvedAssistantContent(trimmed) : undefined;
}

async function resolveEncryptedPayloadJson<T>(
  encryptedPayload?: EncryptedPayload,
): Promise<T | undefined> {
  if (!encryptedPayload) return undefined;
  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted) {
      return JSON.parse(decrypted) as T;
    }
    console.warn("Encrypted payload JSON decrypt returned null", {
      hasAck: Boolean(storedAck),
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
    await warmAccountContentKey();
    const retried = await decryptContentPayload(encryptedPayload);
    if (retried) {
      return JSON.parse(retried) as T;
    }
  } catch (error) {
    console.warn("Failed to decrypt encrypted payload JSON", {
      error,
      accountId: encryptedPayload.account_id,
      objectId: encryptedPayload.object_id,
      objectType: encryptedPayload.object_type,
      algorithm: encryptedPayload.algorithm,
      keyVersion: encryptedPayload.key_version,
    });
  }
  return undefined;
}

async function resolveLifecycleEventPayload(
  event: NormalizedStreamEvent,
): Promise<AgentLifecycleEvent | undefined> {
  const lifecycleEvent = chatStreamEventToLifecycleEvent(event);
  if (!lifecycleEvent) return undefined;
  const data = event.data as Record<string, unknown> & {
    payload?: LifecyclePayload;
    encrypted_payload?: EncryptedPayload;
  };
  const encryptedPayload = await resolveEncryptedPayloadJson<LifecyclePayload>(
    data.encrypted_payload,
  );
  const payload = encryptedPayload ?? data.payload ?? {};
  const toolData = data as ToolStreamData;
  const toolPayload = payload as ToolPreviewPayload;
  const providerNative = isProviderTool(toolData, toolPayload);
  const provider = providerForTool(toolData, toolPayload);
  const toolName =
    stringField(toolPayload.tool_name) ??
    stringField(toolData.tool_name) ??
    "tool";
  const toolFailed = toolData.success === false;
  const providerTextPreview =
    providerNative && event.event_type === "ToolCallStarted"
      ? providerToolPreview(toolName, provider, "started")
      : undefined;
  const providerOutputPreview =
    providerNative && event.event_type === "ToolCallCompleted"
      ? providerToolPreview(
          toolName,
          provider,
          toolFailed ? "failed" : "completed",
        )
      : undefined;
  const withPayloadData: Record<string, unknown> = {
    ...mergeAsyncOperationPayload(event.event_type, data, payload),
    message:
      typeof payload.message === "string"
        ? payload.message
        : typeof data.message === "string"
          ? data.message
          : undefined,
    delta: typeof payload.delta === "string" ? payload.delta : data.delta,
    checkpoint:
      typeof payload.checkpoint === "string"
        ? payload.checkpoint
        : data.checkpoint,
    status: typeof payload.status === "string" ? payload.status : data.status,
    tool_args:
      payload.tool_args !== undefined ? payload.tool_args : data.tool_args,
    tool_name:
      typeof payload.tool_name === "string"
        ? payload.tool_name
        : data.tool_name,
    details: payload.details !== undefined ? payload.details : data.details,
    args_summary:
      payload.tool_args !== undefined
        ? normalizeToolCallArgs(payload.tool_args)
        : data.args_summary,
    text_preview:
      typeof payload.text_preview === "string"
        ? payload.text_preview
        : typeof data.text_preview === "string"
          ? data.text_preview
          : providerTextPreview,
    output: payload.output !== undefined ? payload.output : data.output,
    output_preview:
      providerOutputPreview ??
      (typeof payload.output_preview === "string"
        ? payload.output_preview
        : data.output_preview),
    error_preview:
      typeof payload.error_preview === "string"
        ? payload.error_preview
        : data.error_preview,
    task_preview:
      typeof payload.task_preview === "string"
        ? payload.task_preview
        : data.task_preview,
    result_preview:
      typeof payload.result_preview === "string"
        ? payload.result_preview
        : data.result_preview,
    tool_origin:
      typeof toolPayload.tool_origin === "string"
        ? toolPayload.tool_origin
        : data.tool_origin,
    provider_native: providerNative ? true : data.provider_native,
    provider,
  };
  delete withPayloadData.payload;
  delete withPayloadData.encrypted_payload;
  return {
    event_type: lifecycleEvent.event_type,
    data: withPayloadData,
  } as AgentLifecycleEvent;
}

export function useChatController(
  projectId: string | null | undefined,
  agentId?: string,
  initialSessionId?: string,
  targetType: "agent" | "council" = "agent",
) {
  const { currentUser, userId } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRunTrace, setActiveRunTrace] = useState<RunTrace | undefined>();
  const activeRunTraceRef = useRef<RunTrace | undefined>(undefined);
  const lastRunTraceRef = useRef<RunTrace | undefined>(undefined);
  const activeRunEnvelopeIdRef = useRef<string | undefined>(undefined);
  const lastRunEnvelopeIdRef = useRef<string | undefined>(undefined);
  const finalizedRunEnvelopeIdsRef = useRef<Set<string>>(new Set());
  const suppressActiveRunTraceRef = useRef(false);
  const pendingFinalTraceTargetRef = useRef<
    { id?: string; content: string } | undefined
  >(undefined);
  const streamWorkQueueRef = useRef(
    createSerialChatWorkQueue((error) => {
      console.error("Failed to process ordered chat stream work", error);
    }),
  );
  const envelopeWorkQueueRef = useRef(
    createSerialChatWorkQueue((error) => {
      console.warn("Failed to persist chat run activity", error);
    }),
  );
  const status = "connected";
  const isAgentTarget = targetType === "agent";

  const [liveTurn, dispatchLiveTurn] = useReducer(
    chatTurnReducer,
    undefined,
    () => createChatTurnState(),
  );
  const lifecycle = useMemo(() => chatLifecycle(liveTurn), [liveTurn]);
  const isTyping = lifecycle.isTyping;
  const hasActiveChatRequest = lifecycle.isActive;
  const activeTools = liveTurn.activeTools;
  const livePreview = liveTurn.activityPreview;

  useEffect(() => {
    void warmAccountContentKey();
  }, []);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const workerAckSyncedRef = useRef(false);
  const [activeDomainSession, setActiveDomainSession] =
    useState<DomainSession | null>(null);
  const activeDomainSessionRef = useRef<DomainSession | null>(null);
  const [isDomainPending, setIsDomainPending] = useState(false);
  // Pending domain session — kept only while waiting for backend domain-session creation.
  const pendingDomainSessionRef = useRef<DomainSession | null>(null);
  // After a local exit/cancel succeeds, suppress backend "active domain" restore
  // for this project+agent until the user explicitly enters a domain again.
  const suppressedDomainRestoreRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeDomainSessionRef.current = activeDomainSession;
  }, [activeDomainSession]);

  useEffect(() => {
    return () => {
      if (clearTypingUiTimeoutRef.current) {
        clearTimeout(clearTypingUiTimeoutRef.current);
      }
    };
  }, []);

  // ── Session state ────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [internalSessionId, setInternalSessionId] = useState<string | null>(
    null,
  );
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // When initialSessionId is provided (consolidated chat view), use it directly
  // instead of going through async state updates. This avoids race conditions.
  const activeSessionId = initialSessionId ?? internalSessionId;
  const setActiveSessionId = setInternalSessionId;

  // Stable response ID set when the user sends a message so the final
  // assistant event targets the same message consistently.
  const responseIdRef = useRef<string | null>(null);
  const responsePersistedRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const lastSequenceRef = useRef(0);
  const draftContentRef = useRef("");
  const draftRafRef = useRef<number | null>(null);
  const activeRunStatusRef = useRef<ChatMessage["runStatus"]>("connecting");
  const cancelResponseInFlightRef = useRef(false);
  const clearTypingUiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Monotonic counter for history fetches — only the latest fetch can update state.
  // This handles React Strict Mode double-mount and rapid session switching.
  const historyFetchIdRef = useRef(0);

  // Role+session-keyed message cache to avoid re-fetching on every toggle
  const agentCacheRef = useRef<Map<string, AgentCache>>(new Map());

  // Track the previous agentId so we can save cache on switch
  const prevAgentIdRef = useRef<string | undefined>(undefined);
  const prevSessionIdRef = useRef<string | null>(null);

  // ── Stable subscriber via ref ──────────────────────────────────────────
  const handleIncomingRef = useRef<(raw: unknown) => void>(() => {});
  const optimisticUserMessageIdRef = useRef<string | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const activeChatRequestRef = useRef<ChatStreamRequest | undefined>(undefined);
  const awaitingDeliveryRef = useRef(false);
  const activeToolsRef = useRef<ActiveToolEntry[]>(activeTools);
  const livePreviewRef = useRef<string | undefined>(livePreview);

  const setActiveTools = useCallback(
    (
      update:
        | ActiveToolEntry[]
        | ((previous: ActiveToolEntry[]) => ActiveToolEntry[]),
    ) => {
      const next =
        typeof update === "function" ? update(activeToolsRef.current) : update;
      activeToolsRef.current = next;
      dispatchLiveTurn({ type: "tools_replaced", tools: next });
    },
    [],
  );

  const setLivePreview = useCallback(
    (
      update:
        | string
        | undefined
        | ((previous: string | undefined) => string | undefined),
    ) => {
      const next =
        typeof update === "function" ? update(livePreviewRef.current) : update;
      livePreviewRef.current = next;
      dispatchLiveTurn({ type: "preview_replaced", preview: next });
    },
    [],
  );

  const setIsTyping = useCallback((typing: boolean) => {
    if (!typing) {
      dispatchLiveTurn({ type: "phase_changed", phase: "finalizing" });
      return;
    }
    dispatchLiveTurn({
      type: "phase_changed",
      phase: activeChatPhaseForRunStatus(
        activeRunStatusRef.current,
        Boolean(draftContentRef.current.trim()),
      ),
    });
  }, []);

  const cancelDraftRender = useCallback(() => {
    if (draftRafRef.current === null) return;
    window.cancelAnimationFrame(draftRafRef.current);
    draftRafRef.current = null;
  }, []);

  const scheduleDraftRender = useCallback(() => {
    const scheduledResponseId = responseIdRef.current;
    if (!scheduledResponseId || draftRafRef.current !== null) return;
    draftRafRef.current = window.requestAnimationFrame(() => {
      draftRafRef.current = null;
      if (
        !scheduledDraftBelongsToResponse(
          scheduledResponseId,
          responseIdRef.current,
        )
      ) {
        return;
      }
      const content = draftContentRef.current;
      const runStatus = activeRunStatusRef.current ?? "connecting";
      const replyToMessageId = currentRequestIdRef.current ?? undefined;
      setMessages((previous) =>
        upsertLiveAssistantDraft(previous, {
          id: scheduledResponseId,
          content,
          runStatus,
          replyToMessageId,
          runTrace: activeRunTraceRef.current,
          runEnvelopeId:
            activeRunEnvelopeIdRef.current ?? lastRunEnvelopeIdRef.current,
          timestamp: new Date().toISOString(),
        }),
      );
    });
  }, []);

  useEffect(() => () => cancelDraftRender(), [cancelDraftRender]);

  const setTypingIfDelivered = useCallback(() => {
    if (!awaitingDeliveryRef.current) {
      setIsTyping(true);
    }
  }, [setIsTyping]);

  const persistCurrentStreamSnapshot = useCallback(() => {
    if (!activeSessionId) return;
    const requestId =
      currentRequestIdRef.current ??
      optimisticUserMessageIdRef.current ??
      responseIdRef.current;
    if (!requestId) return;
    const snapshot: ChatStreamSnapshot = {
      sessionId: activeSessionId,
      agentId,
      requestId,
      request: activeChatRequestRef.current,
      responseId: responseIdRef.current ?? undefined,
      runId: activeRunIdRef.current,
      lastSequence: lastSequenceRef.current,
      content: draftContentRef.current,
      activeTools: activeToolsRef.current,
      livePreview: livePreviewRef.current,
      activeRunTrace: activeRunTraceRef.current,
      status: activeRunStatusRef.current ?? "connecting",
      updatedAt: Date.now(),
    };
    void persistChatStreamSnapshot(snapshot);
  }, [activeSessionId, agentId]);

  const clearLiveTurnIndicators = useCallback(
    (
      options: {
        preserveRunTraceForFinalMessage?: boolean;
        broadcastClear?: boolean;
        terminalStatus?: "completed" | "failed" | "cancelled";
      } = {},
    ) => {
      const {
        preserveRunTraceForFinalMessage = false,
        broadcastClear = true,
        terminalStatus,
      } = options;
      const clearedResponseId = responseIdRef.current ?? undefined;
      cancelDraftRender();
      if (clearTypingUiTimeoutRef.current) {
        clearTimeout(clearTypingUiTimeoutRef.current);
      }
      activeToolsRef.current = [];
      livePreviewRef.current = undefined;
      dispatchLiveTurn({ type: "reset" });
      currentRequestIdRef.current = null;
      activeChatRequestRef.current = undefined;
      activeRunIdRef.current = undefined;
      lastSequenceRef.current = 0;
      draftContentRef.current = "";
      activeRunStatusRef.current = undefined;
      if (!preserveRunTraceForFinalMessage) {
        activeRunTraceRef.current = undefined;
      }
      setActiveRunTrace(undefined);
      clearTypingUiTimeoutRef.current = null;
      if (activeSessionId) {
        const updatedAt = Date.now();
        void clearChatStreamSnapshot(
          activeSessionId,
          clearedResponseId,
          terminalStatus,
          updatedAt,
        );
        if (broadcastClear) {
          notifyChatStreamSnapshot({
            sessionId: activeSessionId,
            clear: true,
            responseId: clearedResponseId,
            terminalStatus,
            updatedAt,
          });
        }
      }
    },
    [activeSessionId, cancelDraftRender],
  );

  const finishLiveTurn = useCallback(
    (
      status: Extract<
        NonNullable<ChatMessage["runStatus"]>,
        "completed" | "failed" | "cancelled"
      >,
    ) => {
      const finishedResponseId = responseIdRef.current ?? undefined;
      cancelDraftRender();
      activeChatRequestRef.current = undefined;
      currentRequestIdRef.current = null;
      responseIdRef.current = null;
      activeRunIdRef.current = undefined;
      lastSequenceRef.current = 0;
      draftContentRef.current = "";
      activeRunStatusRef.current = status;
      activeToolsRef.current = [];
      livePreviewRef.current = undefined;
      activeRunTraceRef.current = undefined;
      activeRunEnvelopeIdRef.current = undefined;
      const terminalPhase = terminalPhaseForStatus(status);
      dispatchLiveTurn(
        terminalPhase ? { type: terminalPhase } : { type: "reset" },
      );
      setActiveRunTrace(undefined);
      if (activeSessionId) {
        const updatedAt = Date.now();
        void clearChatStreamSnapshot(
          activeSessionId,
          finishedResponseId,
          status,
          updatedAt,
        );
        notifyChatStreamSnapshot({
          sessionId: activeSessionId,
          clear: true,
          responseId: finishedResponseId,
          terminalStatus: status,
          updatedAt,
        });
      }
    },
    [activeSessionId, cancelDraftRender],
  );

  const applyStreamSnapshot = useCallback(
    (snapshot: ChatStreamSnapshot | ChatStreamClearSnapshot) => {
      if (!activeSessionId || snapshot.sessionId !== activeSessionId) {
        return;
      }

      if (isClearSnapshot(snapshot)) {
        if (
          !clearSnapshotAppliesToResponse(
            snapshot.responseId,
            responseIdRef.current,
          )
        ) {
          return;
        }
        cancelDraftRender();
        currentRequestIdRef.current = null;
        responseIdRef.current = null;
        responsePersistedRef.current = false;
        suppressActiveRunTraceRef.current = true;
        activeToolsRef.current = [];
        livePreviewRef.current = undefined;
        activeRunTraceRef.current = undefined;
        dispatchLiveTurn({ type: "reset" });
        setActiveRunTrace(undefined);
        return;
      }

      const responseId = snapshot.responseId ?? snapshot.requestId;
      currentRequestIdRef.current = snapshot.requestId;
      activeChatRequestRef.current = snapshot.request
        ? { ...snapshot.request, after_sequence: snapshot.lastSequence }
        : undefined;
      responseIdRef.current = responseId;
      responsePersistedRef.current = false;
      activeRunIdRef.current = snapshot.runId;
      lastSequenceRef.current = snapshot.lastSequence ?? 0;
      draftContentRef.current = snapshot.content;
      suppressActiveRunTraceRef.current = false;
      activeToolsRef.current = snapshot.activeTools ?? [];
      livePreviewRef.current = snapshot.livePreview;
      dispatchLiveTurn({ type: "restored", snapshot });
      const restoredTrace = snapshot.activeRunTrace as RunTrace | undefined;
      activeRunTraceRef.current = restoredTrace;
      if (restoredTrace && !isTerminalChatRunTrace(restoredTrace)) {
        lastRunTraceRef.current = restoredTrace;
        setActiveRunTrace(restoredTrace);
      } else {
        setActiveRunTrace(undefined);
      }
      const isStreaming = ![
        "done",
        "error",
        "failed",
        "cancelled",
        "completed",
      ].includes(snapshot.status);
      activeRunStatusRef.current =
        snapshot.status === "streaming"
          ? "generating"
          : snapshot.status === "done"
            ? "completed"
            : snapshot.status === "error"
              ? "failed"
              : snapshot.status;
      setMessages((prev) => {
        const targetIndex = findLastIndexCompat(
          prev,
          (message) =>
            message.id === responseId ||
            message.persistedId === responseId ||
            (message.role === "assistant" && message.id === snapshot.requestId),
        );

        if (targetIndex >= 0) {
          return compactDuplicateChatMessages(
            prev.map((message, index) =>
              index === targetIndex
                ? {
                    ...message,
                    id: responseId,
                    content: snapshot.content,
                    runStatus: activeRunStatusRef.current,
                    runTrace: restoredTrace ?? message.runTrace,
                    runEnvelopeId: snapshot.runId ?? message.runEnvelopeId,
                    isLiveDraft: isStreaming,
                    timestamp: new Date(snapshot.updatedAt).toISOString(),
                  }
                : message,
            ),
          );
        }

        if (!snapshot.content.trim() && !isStreaming) {
          return prev;
        }

        return compactDuplicateChatMessages([
          ...prev,
          {
            id: responseId,
            role: "assistant",
            content: snapshot.content,
            timestamp: new Date(snapshot.updatedAt).toISOString(),
            runStatus: activeRunStatusRef.current,
            runTrace: restoredTrace,
            runEnvelopeId: snapshot.runId,
            isLiveDraft: isStreaming,
          },
        ]);
      });
    },
    [activeSessionId, cancelDraftRender],
  );

  // Cache key includes session ID
  const cacheKey = useCallback(
    (rId: string, sId?: string | null) => `${rId}:${sId ?? "none"}`,
    [],
  );
  const domainRestoreKey = useCallback(
    (pId: string | null | undefined, aId: string) => `${pId ?? "root"}:${aId}`,
    [],
  );
  const latestHistoryRef = useRef({ messages, hasMore });
  useEffect(() => {
    latestHistoryRef.current = { messages, hasMore };
  }, [messages, hasMore]);

  // ── Load sessions on mount / role change ──────────────────────────────
  useEffect(() => {
    if (!agentId) {
      setSessions([]);
      setActiveSessionId(null);
      return;
    }

    // When an initialSessionId is provided (e.g. from the consolidated chat
    // view), skip fetching sessions and auto-selection — activeSessionId is
    // already derived directly from the prop.
    if (initialSessionId) {
      return;
    }

    setIsLoadingSessions(true);
    fetchChatSessions(projectId, agentId, targetType)
      .then(async (fetched) => {
        setSessions(fetched);
        // Pick most recent non-archived session, or auto-create one
        const active = fetched.find((s) => !s.archived_at);
        if (active) {
          setActiveSessionId(active.id);
        } else {
          try {
            const session = await createChatSession({
              ...(projectId ? { project_id: projectId } : {}),
              ...(isAgentTarget ? { agent_id: agentId } : {}),
              target_type: targetType,
              target_id: agentId,
            });
            setSessions((prev) => [session, ...prev]);
            setActiveSessionId(session.id);
          } catch (err) {
            console.error("Failed to auto-create session:", err);
            setActiveSessionId(null);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load sessions:", err);
        setSessions([]);
        setActiveSessionId(null);
      })
      .finally(() => setIsLoadingSessions(false));
  }, [
    projectId,
    agentId,
    initialSessionId,
    targetType,
    isAgentTarget,
    setActiveSessionId,
  ]);

  // ── Load history on mount / role / session change ─────────────────────
  useEffect(() => {
    const previousAgentId = prevAgentIdRef.current;
    const previousSessionId = prevSessionIdRef.current;
    const sessionChanged =
      previousAgentId !== agentId || previousSessionId !== activeSessionId;

    // Save current messages to cache for the previous role+session
    if (previousAgentId) {
      const previousHistory = latestHistoryRef.current;
      agentCacheRef.current.set(cacheKey(previousAgentId, previousSessionId), {
        messages: compactDuplicateChatMessages(previousHistory.messages),
        hasMore: previousHistory.hasMore,
      });
    }
    prevAgentIdRef.current = agentId;
    prevSessionIdRef.current = activeSessionId;

    // Reset immediately; the per-session IndexedDB checkpoint below is the
    // only authority allowed to restore active work for the new conversation.
    dispatchLiveTurn({ type: "reset" });

    // Clear the response ref so stray tokens from the old role don't bleed in
    responseIdRef.current = null;
    currentRequestIdRef.current = null;
    activeToolsRef.current = [];
    livePreviewRef.current = undefined;
    activeRunEnvelopeIdRef.current = undefined;
    suppressActiveRunTraceRef.current = true;

    // Clear stale domain session only when the role or chat session actually changes.
    if (sessionChanged) {
      setActiveDomainSession(null);
      setMessages([]);
      setHasMore(false);
    }

    if (!agentId) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    // Check cache first
    const cached = agentCacheRef.current.get(
      cacheKey(agentId, activeSessionId),
    );
    if (cached) {
      setMessages(compactDuplicateChatMessages(cached.messages));
      setHasMore(cached.hasMore);
      return;
    }

    // Fetch from API
    setIsLoadingHistory(true);
    if (!activeSessionId) {
      setMessages([]);
      setHasMore(false);
      setIsLoadingHistory(false);
      return;
    }

    const fetchId = ++historyFetchIdRef.current;

    fetchChatMessages(
      projectId,
      agentId,
      {
        session_id: activeSessionId,
      },
      targetType,
    )
      .then(async (page) => {
        if (fetchId !== historyFetchIdRef.current) return;
        if (page.messages.length === 0) {
          setHasMore(false);
        } else {
          // API returns newest-first (DESC), reverse for oldest-first display
          const loaded: ChatMessage[] = await Promise.all(
            page.messages.reverse().map(async (m) => ({
              id: m.id,
              persistedId: m.id,
              replyToMessageId: m.reply_to_message_id ?? undefined,
              role: m.sender,
              content: await resolvePersistedMessageContent(m),
              command: persistedMessageCommand(m),
              timestamp: m.created_at,
              artifactIds: m.artifact_ids ?? [],
            })),
          );
          if (fetchId !== historyFetchIdRef.current) return;
          const loadedWithEnvelopes = await hydrateRunEnvelopeLinks(loaded);
          if (fetchId !== historyFetchIdRef.current) return;
          setMessages((current) =>
            mergeLoadedMessages(loadedWithEnvelopes, current),
          );
          setHasMore(page.has_more);
          void gcSessionRunEnvelopes(activeSessionId, currentUser?.org_id);
        }
      })
      .catch((err) => {
        if (fetchId !== historyFetchIdRef.current) return;
        console.error("Failed to load chat history:", err);
        setHasMore(false);
      })
      .finally(() => {
        if (fetchId !== historyFetchIdRef.current) return;
        setIsLoadingHistory(false);
      });
  }, [
    projectId,
    agentId,
    activeSessionId,
    currentUser?.org_id,
    targetType,
    cacheKey,
  ]);

  useEffect(() => {
    if (!activeSessionId || isLoadingHistory) return;

    try {
      const raw = sessionStorage.getItem(LOCAL_CHAT_SEED_KEY);
      if (!raw) return;

      const seeded = JSON.parse(raw) as {
        session_id: string;
        message: string;
        timestamp?: string;
      };
      if (seeded.session_id !== activeSessionId) return;

      setMessages((prev) => {
        const sessionCreatedAt = sessions.find(
          (session) => session.id === activeSessionId,
        )?.created_at;
        const seededTimestamp =
          seeded.timestamp ??
          sessionCreatedAt ??
          prev[prev.length - 1]?.timestamp ??
          new Date().toISOString();

        const existingSeedIndex = prev.findIndex(
          (m) => m.id === `local-seed-${activeSessionId}`,
        );
        if (existingSeedIndex >= 0) {
          return prev
            .map((m, index) =>
              index === existingSeedIndex
                ? {
                    ...m,
                    content: seeded.message,
                    timestamp: seededTimestamp,
                  }
                : m,
            )
            .sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime(),
            );
        }

        if (
          prev.some(
            (m) => m.role === "assistant" && m.content === seeded.message,
          )
        ) {
          return prev;
        }

        const seededMessage: ChatMessage = {
          id: `local-seed-${activeSessionId}`,
          role: "assistant",
          content: seeded.message,
          timestamp: seededTimestamp,
        };

        return [...prev, seededMessage].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      });
    } catch {
      // ignore malformed seed data
    }
  }, [activeSessionId, isLoadingHistory, sessions]);

  // Restore active domain session from backend on mount/role switch
  useEffect(() => {
    if (!agentId) return;
    const restoreKey = domainRestoreKey(projectId, agentId);

    if (suppressedDomainRestoreRef.current.has(restoreKey)) {
      setActiveDomainSession(null);
      return;
    }

    let cancelled = false;

    fetchActiveDomainSession(projectId, agentId)
      .then((session) => {
        if (
          !cancelled &&
          session &&
          session.status === "active" &&
          !suppressedDomainRestoreRef.current.has(restoreKey)
        ) {
          setActiveDomainSession(session);
        }
      })
      .catch(() => {
        /* ignore — no active session */
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, agentId, domainRestoreKey]);

  // Load older messages (scroll-up pagination)
  const loadMore = useCallback(async () => {
    if (!agentId || !hasMore || isLoadingMore) return;

    const oldest = messages[0];
    if (!oldest) return;

    setIsLoadingMore(true);
    try {
      if (!activeSessionId) return;
      const page = await fetchChatMessages(
        projectId,
        agentId,
        {
          before: oldest.timestamp,
          session_id: activeSessionId,
        },
        targetType,
      );
      if (page.messages.length > 0) {
        const older: ChatMessage[] = await Promise.all(
          page.messages.reverse().map(async (m) => ({
            id: m.id,
            persistedId: m.id,
            replyToMessageId: m.reply_to_message_id ?? undefined,
            role: m.sender,
            content: await resolvePersistedMessageContent(m),
            command: persistedMessageCommand(m),
            timestamp: m.created_at,
            artifactIds: m.artifact_ids ?? [],
          })),
        );
        const olderWithEnvelopes = await hydrateRunEnvelopeLinks(older);
        setMessages((prev) =>
          compactDuplicateChatMessages([...olderWithEnvelopes, ...prev]),
        );
      }
      setHasMore(page.has_more);
      void gcSessionRunEnvelopes(activeSessionId, currentUser?.org_id);
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    projectId,
    agentId,
    activeSessionId,
    currentUser?.org_id,
    hasMore,
    isLoadingMore,
    messages,
    targetType,
  ]);

  const handleIncoming = useCallback(
    (raw: unknown) => {
      // The backend wraps worker responses in an AgentEvent envelope:
      // { user_id, payload } where payload is the worker's AgentResponse.
      const outer = raw as {
        type?: string;
        user_id?: string;
        payload?: unknown;
      };
      const inner =
        outer.type === "agent_response"
          ? (outer as Record<string, unknown>)
          : ((outer.payload ?? raw) as Record<string, unknown>);

      // ── Handle persisted message from backend ────────────────────────────
      // The backend persists chat messages (user + assistant) and pushes the
      // DB row back. The user UUID remains stable; assistant rows reconcile
      // their worker-owned UUID through `persistedId`.
      if (inner.type === "chat.message_persisted") {
        const msg = inner.message as {
          id: string;
          sender: string;
          content: string;
          created_at: string;
          metadata?: PersistedChatMessage["metadata"];
          encrypted_payload?: EncryptedPayload | null;
          reply_to_message_id?: string | null;
          artifact_ids?: string[];
        };
        if (!msg?.id) return;
        streamWorkQueueRef.current.enqueue(async () => {
          const resolvedContent = await resolvePersistedMessageContent({
            content: msg.content,
            metadata: msg.metadata ?? null,
            encrypted_payload: msg.encrypted_payload ?? null,
            artifact_ids: msg.artifact_ids ?? [],
          });
          const persistedRunEnvelopeId = msg.reply_to_message_id
            ? (
                await getEnvelopeLinksForInputMessages([
                  msg.reply_to_message_id,
                ])
              ).get(msg.reply_to_message_id)?.envelopeId
            : undefined;
          const persistedCommand = persistedMessageCommand({
            metadata: msg.metadata ?? null,
          });

          setMessages((prev) => {
            const role = msg.sender as "user" | "assistant";
            if (role === "user" && optimisticUserMessageIdRef.current) {
              const optimisticIdx = prev.findIndex(
                (m) => m.id === optimisticUserMessageIdRef.current,
              );
              if (optimisticIdx >= 0) {
                optimisticUserMessageIdRef.current = null;
                awaitingDeliveryRef.current = false;
                setTypingIfDelivered();
                return compactDuplicateChatMessages(
                  prev.map((m, i) =>
                    i === optimisticIdx
                      ? {
                          ...m,
                          persistedId: msg.id,
                          replyToMessageId:
                            msg.reply_to_message_id ?? m.replyToMessageId,
                          content: isEncryptedUserMessagePlaceholder(
                            resolvedContent,
                          )
                            ? m.content
                            : resolvedContent,
                          command: persistedCommand ?? m.command,
                          artifactIds: msg.artifact_ids ?? m.artifactIds,
                          timestamp: msg.created_at,
                          status:
                            m.status === "cancelled"
                              ? "cancelled"
                              : "delivered",
                        }
                      : m,
                  ),
                );
              }
            }
            if (role === "assistant" && responseIdRef.current) {
              const responseIdx = prev.findIndex(
                (m) => m.id === responseIdRef.current,
              );
              if (responseIdx >= 0) {
                return compactDuplicateChatMessages(
                  prev.map((m, i) =>
                    i === responseIdx
                      ? {
                          ...m,
                          persistedId: msg.id,
                          replyToMessageId:
                            msg.reply_to_message_id ?? m.replyToMessageId,
                          content: resolvedContent,
                          command: persistedCommand ?? m.command,
                          timestamp: msg.created_at,
                          runEnvelopeId:
                            persistedRunEnvelopeId ?? m.runEnvelopeId,
                        }
                      : m,
                  ),
                );
              }
            }
            if (role === "assistant") {
              const partialIdx = findLastIndexCompat(
                prev,
                (m) =>
                  m.role === "assistant" &&
                  !m.persistedId &&
                  isLikelySameAssistantContent(m.content, resolvedContent) &&
                  isRecentMatch(m, msg.created_at),
              );
              if (partialIdx >= 0) {
                return compactDuplicateChatMessages(
                  prev.map((m, i) =>
                    i === partialIdx
                      ? {
                          ...m,
                          persistedId: msg.id,
                          replyToMessageId:
                            msg.reply_to_message_id ?? m.replyToMessageId,
                          content: resolvedContent,
                          timestamp: msg.created_at,
                          runEnvelopeId:
                            persistedRunEnvelopeId ?? m.runEnvelopeId,
                        }
                      : m,
                  ),
                );
              }
            }
            // Find the last message with this role and content that doesn't
            // already have a persistedId.
            const idx = findLastIndexCompat(
              prev,
              (m) =>
                m.role === role &&
                m.content === resolvedContent &&
                !m.persistedId,
            );
            if (idx >= 0) {
              if (
                role === "user" &&
                optimisticUserMessageIdRef.current === prev[idx].id
              ) {
                optimisticUserMessageIdRef.current = null;
              }
              return compactDuplicateChatMessages(
                prev.map((m, i) =>
                  i === idx
                    ? {
                        ...m,
                        persistedId: msg.id,
                        replyToMessageId:
                          msg.reply_to_message_id ?? m.replyToMessageId,
                        content: resolvedContent,
                        command: persistedCommand ?? m.command,
                        timestamp: msg.created_at,
                        runEnvelopeId:
                          role === "assistant"
                            ? (persistedRunEnvelopeId ?? m.runEnvelopeId)
                            : m.runEnvelopeId,
                        status:
                          role === "user"
                            ? m.status === "cancelled"
                              ? "cancelled"
                              : "delivered"
                            : m.status,
                      }
                    : m,
                ),
              );
            }

            // If there is no optimistic/local placeholder to reconcile against,
            // append the persisted row so assistant replies still appear when the
            // live worker stream event is delayed or missed.
            if (prev.some((m) => (m.persistedId ?? m.id) === msg.id)) {
              return prev;
            }

            return compactDuplicateChatMessages([
              ...prev,
              {
                id: msg.id,
                persistedId: msg.id,
                replyToMessageId: msg.reply_to_message_id ?? undefined,
                role,
                content: resolvedContent,
                command: persistedCommand,
                timestamp: msg.created_at,
                runEnvelopeId:
                  role === "assistant" ? persistedRunEnvelopeId : undefined,
              },
            ]);
          });
        });
        return;
      }

      // ── Handle message status updates (sent/delivered) ──────────────────
      if (inner.type === "message_status") {
        const { message_id, status } = inner as {
          message_id: string;
          status: string;
        };
        if (
          message_id === optimisticUserMessageIdRef.current &&
          status === "delivered"
        ) {
          awaitingDeliveryRef.current = false;
          setTypingIfDelivered();
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message_id
              ? {
                  ...m,
                  status:
                    m.status === "cancelled"
                      ? "cancelled"
                      : (status as ChatMessage["status"]),
                }
              : m,
          ),
        );
        return;
      }

      if (inner.type === "delivery_receipt") {
        const { message_id } = inner as { message_id: string };
        if (message_id === optimisticUserMessageIdRef.current) {
          awaitingDeliveryRef.current = false;
          setTypingIfDelivered();
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message_id
              ? {
                  ...m,
                  status: m.status === "cancelled" ? "cancelled" : "delivered",
                }
              : m,
          ),
        );
        return;
      }

      // ── Handle StreamEvent format (worker AgentResponse wrapper) ────────
      // Worker sends: { type: "agent_response", payload: { event_type, data } }
      if (inner.type === "agent_response" && inner.payload) {
        const streamEvent = inner.payload as {
          event_type: string;
          data: Record<string, unknown>;
        };
        const sequence = Number(streamEvent.data.__sequence ?? 0);
        if (Number.isFinite(sequence) && sequence > 0) {
          if (sequence <= lastSequenceRef.current) return;
          lastSequenceRef.current = sequence;
          if (activeChatRequestRef.current) {
            activeChatRequestRef.current = {
              ...activeChatRequestRef.current,
              after_sequence: sequence,
            };
          }
        }
        const frameRunId = stringField(streamEvent.data.__frame_run_id);
        if (frameRunId) activeRunIdRef.current = frameRunId;
        // Capture identity before terminal handlers clear the live refs. Some
        // providers omit run_id from lifecycle events, so the request/trace ID
        // is also the durable local envelope identity for that turn.
        const receivedRunId = lifecycleRunIdentity(
          activeRunEnvelopeIdRef.current,
          activeRunTraceRef.current?.id,
          currentRequestIdRef.current ?? undefined,
          responseIdRef.current ?? undefined,
          lastRunEnvelopeIdRef.current,
          lastRunTraceRef.current?.id,
        );
        const receivedTrace =
          activeRunTraceRef.current ??
          (lastRunTraceRef.current?.id === receivedRunId
            ? lastRunTraceRef.current
            : undefined);
        const receivedInputMessageId =
          streamEvent.event_type === "RunStarted" &&
          typeof streamEvent.data.input_message_id === "string"
            ? streamEvent.data.input_message_id
            : (currentRequestIdRef.current ?? undefined);
        const lifecycleEventPromise = resolveLifecycleEventPayload(streamEvent);

        streamWorkQueueRef.current.enqueue(async () => {
          const lifecycleEvent = await lifecycleEventPromise;
          if (!lifecycleEvent) return;
          const eventRunId = lifecycleRunId(lifecycleEvent);
          const eventSessionId = lifecycleSessionId(lifecycleEvent);
          const envelopeId = lifecycleRunIdentity(
            eventRunId,
            activeRunEnvelopeIdRef.current,
            receivedRunId,
            lastRunEnvelopeIdRef.current,
          );
          const envelopeSessionId = eventSessionId ?? activeSessionId;
          if (lifecycleEvent.event_type === "RunStarted") {
            activeRunEnvelopeIdRef.current = lifecycleEvent.data.run_id;
            lastRunEnvelopeIdRef.current = lifecycleEvent.data.run_id;
            finalizedRunEnvelopeIdsRef.current.delete(
              lifecycleEvent.data.run_id,
            );
          } else if (envelopeId) {
            activeRunEnvelopeIdRef.current ??= envelopeId;
            lastRunEnvelopeIdRef.current = envelopeId;
          }
          if (
            envelopeId &&
            envelopeSessionId &&
            shouldPersistChatActivityEvent(lifecycleEvent)
          ) {
            envelopeWorkQueueRef.current.enqueue(async () => {
              await appendEnvelopeEvent({
                envelopeId,
                runId: envelopeId,
                sessionId: envelopeSessionId,
                event: lifecycleEvent,
              });
              if (
                lifecycleEvent.event_type === "RunStarted" &&
                receivedInputMessageId
              ) {
                await linkEnvelopeToInputMessage({
                  sessionId: envelopeSessionId,
                  inputMessageId: receivedInputMessageId,
                  messageCreatedAt: new Date().toISOString(),
                  envelopeId,
                });
              }
            });
          }
          const traceLifecycleEvent = withLiveChatActivityPreview(
            lifecycleEvent,
            draftContentRef.current,
            activeRunTraceRef.current,
          );
          const next = reduceRunTrace(
            lifecycleTraceBase({
              activeTrace: activeRunTraceRef.current,
              receivedTrace,
              lastTrace: lastRunTraceRef.current,
              eventRunId: eventRunId ?? envelopeId,
            }),
            traceLifecycleEvent,
            {
              defaultRunId:
                activeRunEnvelopeIdRef.current ??
                lastRunEnvelopeIdRef.current ??
                currentRequestIdRef.current ??
                responseIdRef.current ??
                undefined,
              defaultSessionId: activeSessionId ?? undefined,
              source: "chat",
            },
          );
          if (next) {
            lastRunTraceRef.current = next;
            const pendingTarget = pendingFinalTraceTargetRef.current;
            if (pendingTarget && isTerminalChatRunTrace(next)) {
              setMessages((prev) => {
                let attached = false;
                const updated = prev.map((message) => {
                  const matches =
                    message.role === "assistant" &&
                    ((pendingTarget.id && message.id === pendingTarget.id) ||
                      message.content === pendingTarget.content);
                  if (!matches) return message;
                  attached = true;
                  return {
                    ...message,
                    runTrace: preferredChatRunTrace(message.runTrace, next),
                  };
                });
                if (attached) {
                  pendingFinalTraceTargetRef.current = undefined;
                }
                return attached ? compactDuplicateChatMessages(updated) : prev;
              });
            }
          }
          const isFinalizedRun =
            envelopeId != null &&
            finalizedRunEnvelopeIdsRef.current.has(envelopeId);
          const retainedTrace = retainedLiveChatRunTrace({
            trace: next,
            suppressed: suppressActiveRunTraceRef.current,
            finalized: isFinalizedRun,
          });
          if (retainedTrace) {
            activeRunTraceRef.current = retainedTrace;
            setActiveRunTrace(retainedTrace);
            scheduleDraftRender();
            if (shouldPersistChatActivityEvent(lifecycleEvent)) {
              persistCurrentStreamSnapshot();
            }
          } else {
            activeRunTraceRef.current = undefined;
            setActiveRunTrace(undefined);
            if (activeSessionId) {
              const clearedResponseId = responseIdRef.current ?? undefined;
              const terminalStatus =
                activeRunStatusRef.current === "completed" ||
                activeRunStatusRef.current === "failed" ||
                activeRunStatusRef.current === "cancelled"
                  ? activeRunStatusRef.current
                  : undefined;
              const shouldBroadcastClear =
                suppressActiveRunTraceRef.current || isFinalizedRun;
              const updatedAt = Date.now();
              void clearChatStreamSnapshot(
                activeSessionId,
                clearedResponseId,
                shouldBroadcastClear ? terminalStatus : undefined,
                updatedAt,
              );
              if (shouldBroadcastClear) {
                notifyChatStreamSnapshot({
                  sessionId: activeSessionId,
                  clear: true,
                  responseId: clearedResponseId,
                  terminalStatus,
                  updatedAt,
                });
              }
            }
          }
        });

        switch (streamEvent.event_type) {
          case "ChatRunSnapshot": {
            const data = streamEvent.data as {
              run_id?: string;
              status?: ChatStreamSnapshot["status"] | "running";
              checkpoint_sequence?: number;
              encrypted_checkpoint?: EncryptedPayload;
              error_code?: string;
              error_message?: string;
              error_retryable?: boolean;
            };
            if (data.run_id) activeRunIdRef.current = data.run_id;
            const checkpointSequence = data.checkpoint_sequence ?? 0;
            const shouldApplyCheckpoint =
              checkpointSequence > lastSequenceRef.current;
            if (shouldApplyCheckpoint) {
              // The rolling checkpoint is the reconnect baseline. Live frames
              // at or before it are dropped while decryption remains ordered.
              lastSequenceRef.current = checkpointSequence;
              if (activeChatRequestRef.current) {
                activeChatRequestRef.current = {
                  ...activeChatRequestRef.current,
                  after_sequence: checkpointSequence,
                };
              }
            }
            streamWorkQueueRef.current.enqueue(async () => {
              const checkpoint = await resolveEncryptedPayloadJson<{
                checkpoint?: string;
                delta?: string;
              }>(data.encrypted_checkpoint);
              if (checkpoint?.checkpoint && shouldApplyCheckpoint) {
                draftContentRef.current = checkpoint.checkpoint;
                scheduleDraftRender();
              }
              const normalizedStatus =
                data.status === "running"
                  ? draftContentRef.current
                    ? "generating"
                    : "connecting"
                  : data.status;
              if (
                normalizedStatus &&
                normalizedStatus !== "streaming" &&
                normalizedStatus !== "done" &&
                normalizedStatus !== "error"
              ) {
                activeRunStatusRef.current = normalizedStatus;
              }
              if (data.status === "failed") {
                const id = responseIdRef.current ?? data.run_id ?? generateId();
                responseIdRef.current = id;
                setMessages((previous) => {
                  const index = previous.findIndex(
                    (message) => message.id === id,
                  );
                  const fields = {
                    content: draftContentRef.current,
                    runStatus: "failed" as const,
                    errorCode: data.error_code,
                    errorMessage:
                      data.error_message ??
                      "The model provider could not complete the response.",
                    retryable: data.error_retryable === true,
                    isLiveDraft: false,
                  };
                  return index < 0
                    ? [
                        ...previous,
                        {
                          id,
                          role: "assistant" as const,
                          timestamp: new Date().toISOString(),
                          replyToMessageId:
                            currentRequestIdRef.current ?? undefined,
                          ...fields,
                        },
                      ]
                    : previous.map((message, messageIndex) =>
                        messageIndex === index
                          ? { ...message, ...fields }
                          : message,
                      );
                });
              }
              persistCurrentStreamSnapshot();
            });
            break;
          }

          case "RunStarted": {
            const runId = stringField(streamEvent.data.run_id) ?? frameRunId;
            if (runId) activeRunIdRef.current = runId;
            activeRunStatusRef.current = "generating";
            dispatchLiveTurn({ type: "phase_changed", phase: "thinking" });
            setTypingIfDelivered();
            scheduleDraftRender();
            persistCurrentStreamSnapshot();
            break;
          }

          case "AssistantTextDelta": {
            streamWorkQueueRef.current.enqueue(async () => {
              const lifecycleEvent = await lifecycleEventPromise;
              if (lifecycleEvent?.event_type !== "AssistantTextDelta") return;
              if (typeof lifecycleEvent.data.checkpoint === "string") {
                draftContentRef.current = lifecycleEvent.data.checkpoint;
                dispatchLiveTurn({
                  type: "content_replaced",
                  content: lifecycleEvent.data.checkpoint,
                });
              } else if (typeof lifecycleEvent.data.delta === "string") {
                draftContentRef.current += lifecycleEvent.data.delta;
                dispatchLiveTurn({
                  type: "text_delta",
                  delta: lifecycleEvent.data.delta,
                });
              }
              if (!draftContentRef.current) return;
              activeRunStatusRef.current = "generating";
              setTypingIfDelivered();
              scheduleDraftRender();
              persistCurrentStreamSnapshot();
            });
            break;
          }

          case "ProviderRetryScheduled": {
            streamWorkQueueRef.current.enqueue(async () => {
              activeRunStatusRef.current = "retrying";
              dispatchLiveTurn({ type: "phase_changed", phase: "waiting" });
              scheduleDraftRender();
              persistCurrentStreamSnapshot();
            });
            break;
          }

          case "AssistantMessageFinalized": {
            const data = streamEvent.data as {
              message_id?: string;
              input_message_id?: string;
              payload?:
                | { final_output?: string; message?: string; text?: string }
                | string;
              encrypted_payload?: EncryptedPayload;
              total_input_tokens?: number;
              total_output_tokens?: number;
            };
            streamWorkQueueRef.current.enqueue(async () => {
              dispatchLiveTurn({ type: "phase_changed", phase: "finalizing" });
              const decrypted = await resolveEncryptedPayloadJson<
                | { final_output?: string; message?: string; text?: string }
                | string
              >(data.encrypted_payload);
              const payload = decrypted ?? data.payload;
              const finalContent =
                typeof payload === "string"
                  ? payload
                  : (payload?.final_output ??
                    payload?.message ??
                    payload?.text ??
                    draftContentRef.current);
              const localId = responseIdRef.current;
              const messageId =
                data.message_id ??
                data.encrypted_payload?.object_id ??
                localId ??
                generateId();
              const trace =
                activeRunTraceRef.current ?? lastRunTraceRef.current;
              const envelopeId =
                activeRunIdRef.current ?? activeRunEnvelopeIdRef.current;
              draftContentRef.current = finalContent;
              activeRunStatusRef.current = "completed";
              setMessages((previous) => {
                const index = findLastIndexCompat(
                  previous,
                  (message) =>
                    message.role === "assistant" &&
                    (message.id === localId ||
                      message.id === messageId ||
                      message.persistedId === messageId),
                );
                const finalized: ChatMessage = {
                  id: index >= 0 ? previous[index].id : (localId ?? messageId),
                  persistedId: messageId,
                  replyToMessageId:
                    data.input_message_id ??
                    currentRequestIdRef.current ??
                    previous[index]?.replyToMessageId,
                  role: "assistant",
                  content: finalContent,
                  timestamp:
                    previous[index]?.timestamp ?? new Date().toISOString(),
                  runTrace: preferredChatRunTrace(
                    previous[index]?.runTrace,
                    trace,
                  ),
                  runEnvelopeId: previous[index]?.runEnvelopeId ?? envelopeId,
                  runStatus: "completed",
                  inputTokens: data.total_input_tokens,
                  outputTokens: data.total_output_tokens,
                  isLiveDraft: false,
                };
                if (index < 0)
                  return compactDuplicateChatMessages([...previous, finalized]);
                return compactDuplicateChatMessages(
                  previous.map((message, messageIndex) =>
                    messageIndex === index
                      ? { ...message, ...finalized }
                      : message,
                  ),
                );
              });
              responseIdRef.current = localId ?? messageId;
              suppressActiveRunTraceRef.current = true;
              finishLiveTurn("completed");
            });
            break;
          }

          case "RunFailed": {
            const data = streamEvent.data as {
              code?: string;
              message?: string;
              retryable?: boolean;
            };
            streamWorkQueueRef.current.enqueue(async () => {
              cancelDraftRender();
              const id =
                responseIdRef.current ?? activeRunIdRef.current ?? generateId();
              const message =
                data.message ??
                "The model provider could not complete the response.";
              activeRunStatusRef.current = "failed";
              setMessages((previous) => {
                const index = previous.findIndex((item) => item.id === id);
                const failed: ChatMessage = {
                  id,
                  role: "assistant",
                  content: draftContentRef.current,
                  timestamp: new Date().toISOString(),
                  replyToMessageId: currentRequestIdRef.current ?? undefined,
                  runStatus: "failed",
                  errorCode: data.code,
                  errorMessage: message,
                  retryable: data.retryable === true,
                  isLiveDraft: false,
                };
                return index < 0
                  ? [...previous, failed]
                  : previous.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, ...failed } : item,
                    );
              });
              dispatchLiveTurn({
                type: "failed",
                error: {
                  code: data.code,
                  message,
                  retryable: data.retryable,
                },
              });
              persistCurrentStreamSnapshot();
            });
            break;
          }

          case "RunCancelled": {
            streamWorkQueueRef.current.enqueue(async () => {
              cancelDraftRender();
              activeRunStatusRef.current = "cancelled";
              const id =
                responseIdRef.current ?? activeRunIdRef.current ?? generateId();
              setMessages((previous) => {
                const index = previous.findIndex(
                  (message) => message.id === id,
                );
                const cancelled: ChatMessage = {
                  id,
                  role: "assistant",
                  content: draftContentRef.current,
                  timestamp: new Date().toISOString(),
                  replyToMessageId: currentRequestIdRef.current ?? undefined,
                  runStatus: "cancelled",
                  isLiveDraft: false,
                };
                return index < 0
                  ? [...previous, cancelled]
                  : previous.map((message, messageIndex) =>
                      messageIndex === index
                        ? { ...message, ...cancelled }
                        : message,
                    );
              });
              dispatchLiveTurn({ type: "cancelled" });
              persistCurrentStreamSnapshot();
            });
            break;
          }

          case "RunCompleted": {
            streamWorkQueueRef.current.enqueue(async () => {
              activeRunStatusRef.current = "completed";
              dispatchLiveTurn({ type: "phase_changed", phase: "finalizing" });
            });
            break;
          }

          case "Done": {
            optimisticUserMessageIdRef.current = null;
            const {
              payload,
              encrypted_payload,
              session_id,
              run_id,
              input_message_id,
            } = streamEvent.data as {
              payload?: string;
              encrypted_payload?: EncryptedPayload;
              session_id?: string;
              run_id?: string;
              input_message_id?: string;
            };
            if (
              session_id &&
              activeSessionId &&
              session_id !== activeSessionId
            ) {
              break;
            }
            streamWorkQueueRef.current.enqueue(async () => {
              const finalizingEnvelopeId =
                run_id ??
                activeRunEnvelopeIdRef.current ??
                lastRunEnvelopeIdRef.current;
              if (finalizingEnvelopeId) {
                finalizedRunEnvelopeIdsRef.current.add(finalizingEnvelopeId);
              }
              suppressActiveRunTraceRef.current = true;
              clearLiveTurnIndicators({
                preserveRunTraceForFinalMessage: true,
                broadcastClear: false,
              });
              const resolvedFinalOutput = encrypted_payload
                ? await resolvePersistedMessageContent({
                    content: payload ?? "",
                    metadata: { encrypted_payload },
                  })
                : (payload ?? "");
              const traceForFinal =
                activeRunTraceRef.current ?? lastRunTraceRef.current;
              const envelopeIdForFinal =
                run_id ??
                activeRunEnvelopeIdRef.current ??
                lastRunEnvelopeIdRef.current;
              const replyToMessageId =
                input_message_id ?? currentRequestIdRef.current ?? undefined;
              const localResponseId = responseIdRef.current;
              const messageIdentity = resolveAssistantMessageIdentity({
                localResponseId: localResponseId ?? undefined,
                workerMessageId: encrypted_payload?.object_id,
                fallbackId: generateId(),
              });
              const id = messageIdentity.renderId;
              const persistedAssistantId = messageIdentity.persistedId;
              responseIdRef.current = null;
              pendingFinalTraceTargetRef.current = {
                id,
                content: resolvedFinalOutput,
              };
              setMessages((prev) => {
                const existing = prev.find(
                  (m) =>
                    m.id === id ||
                    (persistedAssistantId != null &&
                      m.persistedId === persistedAssistantId) ||
                    (localResponseId != null && m.id === localResponseId),
                );
                if (existing) {
                  return compactDuplicateChatMessages(
                    prev.map((m) =>
                      m.id === existing.id
                        ? {
                            ...m,
                            content: resolvedFinalOutput,
                            persistedId: persistedAssistantId ?? m.persistedId,
                            replyToMessageId:
                              replyToMessageId ?? m.replyToMessageId,
                            runTrace: traceForFinal,
                            runEnvelopeId: envelopeIdForFinal,
                          }
                        : m,
                    ),
                  );
                }
                const partialIdx = findLastIndexCompat(
                  prev,
                  (m) =>
                    m.role === "assistant" &&
                    !m.persistedId &&
                    isLikelySameAssistantContent(
                      m.content,
                      resolvedFinalOutput,
                    ),
                );
                if (partialIdx >= 0) {
                  return compactDuplicateChatMessages(
                    prev.map((m, i) =>
                      i === partialIdx
                        ? {
                            ...m,
                            content: resolvedFinalOutput,
                            persistedId: persistedAssistantId ?? m.persistedId,
                            replyToMessageId:
                              replyToMessageId ?? m.replyToMessageId,
                            runTrace: traceForFinal,
                            runEnvelopeId: envelopeIdForFinal,
                          }
                        : m,
                    ),
                  );
                }
                const existingPersisted = findLastCompat(
                  prev,
                  (m) =>
                    m.role === "assistant" && m.content === resolvedFinalOutput,
                );
                if (existingPersisted) {
                  return compactDuplicateChatMessages(
                    prev.map((m) =>
                      m.id === existingPersisted.id
                        ? {
                            ...m,
                            persistedId: persistedAssistantId ?? m.persistedId,
                            replyToMessageId:
                              replyToMessageId ?? m.replyToMessageId,
                            runTrace: preferredChatRunTrace(
                              m.runTrace,
                              traceForFinal,
                            ),
                            runEnvelopeId:
                              m.runEnvelopeId ?? envelopeIdForFinal,
                          }
                        : m,
                    ),
                  );
                }
                return compactDuplicateChatMessages([
                  ...prev,
                  {
                    id: id!,
                    persistedId: persistedAssistantId,
                    replyToMessageId,
                    role: "assistant" as const,
                    content: resolvedFinalOutput,
                    timestamp: new Date().toISOString(),
                    runTrace: traceForFinal,
                    runEnvelopeId: envelopeIdForFinal,
                  },
                ]);
              });
              if (isTerminalChatRunTrace(traceForFinal)) {
                pendingFinalTraceTargetRef.current = undefined;
              }
              finishLiveTurn("completed");
            });
            break;
          }

          case "Error": {
            const inputMessageId = currentRequestIdRef.current ?? undefined;
            optimisticUserMessageIdRef.current = null;
            responsePersistedRef.current = false;
            const { message, payload, encrypted_payload } =
              streamEvent.data as {
                message: string;
                payload?: { message?: string };
                encrypted_payload?: EncryptedPayload;
              };
            streamWorkQueueRef.current.enqueue(async () => {
              const encryptedData = await resolveEncryptedPayloadJson<{
                message?: string;
              }>(encrypted_payload);
              const resolvedErrorMessage = encryptedData?.message
                ? String(encryptedData.message)
                : payload?.message
                  ? String(payload.message)
                  : await resolveEncryptedPreview(message, encrypted_payload);
              const displayError = resolvedErrorMessage ?? message;
              const content =
                displayError === "Request cancelled"
                  ? displayError
                  : `Error: ${displayError}`;
              const id = responseIdRef.current ?? generateId();
              const timestamp = new Date().toISOString();
              const envelopeIdForFinal =
                activeRunEnvelopeIdRef.current ?? lastRunEnvelopeIdRef.current;
              const traceForFinal =
                activeRunTraceRef.current ?? lastRunTraceRef.current;
              if (envelopeIdForFinal) {
                finalizedRunEnvelopeIdsRef.current.add(envelopeIdForFinal);
              }
              setMessages((prev) =>
                compactDuplicateChatMessages([
                  ...prev,
                  {
                    id,
                    role: "assistant" as const,
                    replyToMessageId: inputMessageId,
                    content,
                    timestamp,
                    runTrace: traceForFinal,
                    runEnvelopeId: envelopeIdForFinal,
                    runStatus: "failed",
                    isLiveDraft: false,
                  },
                ]),
              );
              pendingFinalTraceTargetRef.current = undefined;
              suppressActiveRunTraceRef.current = true;
              clearLiveTurnIndicators({
                preserveRunTraceForFinalMessage: true,
              });
              responseIdRef.current = null;
              finishLiveTurn("failed");
            });
            break;
          }

          case "DomainEntered": {
            // Domain is activated from the backend createDomainSession response.
            // Keep this as a no-op fallback in case older workers still emit it.
            setIsDomainPending(false);
            if (pendingDomainSessionRef.current) {
              setActiveDomainSession(pendingDomainSessionRef.current);
              pendingDomainSessionRef.current = null;
            }
            break;
          }

          case "DomainExited": {
            const { session_id } = streamEvent.data as { session_id: string };
            const currentActiveDomainSession = activeDomainSessionRef.current;

            if (pendingDomainSessionRef.current?.id === session_id) {
              pendingDomainSessionRef.current = null;
            }

            if (
              !currentActiveDomainSession?.id ||
              currentActiveDomainSession.id !== session_id
            ) {
              break;
            }

            setActiveDomainSession(null);
            break;
          }

          case "ToolCallStarted": {
            const data = streamEvent.data as ToolStreamData;
            activeRunStatusRef.current = "using_tool";
            dispatchLiveTurn({ type: "phase_changed", phase: "using_tool" });
            setTypingIfDelivered();
            scheduleDraftRender();
            streamWorkQueueRef.current.enqueue(async () => {
              const encryptedData =
                await resolveEncryptedPayloadJson<ToolPreviewPayload>(
                  data.encrypted_payload,
                );
              const payload = encryptedData ?? data.payload ?? {};
              const toolName =
                stringField(payload.tool_name) ??
                stringField(data.tool_name) ??
                "tool";
              const providerNative = isProviderTool(data, payload);
              const provider = providerForTool(data, payload);
              const textPreview =
                stringField(payload.text_preview) ??
                stringField(data.text_preview) ??
                (providerNative
                  ? providerToolPreview(toolName, provider, "started")
                  : undefined);
              setActiveTools((prev) =>
                upsertActiveTool(prev, {
                  callId: stringField(data.call_id),
                  parentCallId: stringField(data.parent_call_id),
                  name: toolName,
                  args: toolArgsSummary(data, payload),
                  textPreview,
                  status: "running",
                  providerNative,
                  provider,
                  children: [],
                }),
              );
            });
            break;
          }

          case "ToolCallCompleted": {
            const data = streamEvent.data as ToolStreamData;
            streamWorkQueueRef.current.enqueue(async () => {
              const encryptedData =
                await resolveEncryptedPayloadJson<ToolPreviewPayload>(
                  data.encrypted_payload,
                );
              const payload = encryptedData ?? data.payload ?? {};
              const toolName =
                stringField(payload.tool_name) ??
                stringField(data.tool_name) ??
                "tool";
              const providerNative = isProviderTool(data, payload);
              const provider = providerForTool(data, payload);
              const status = data.success === false ? "failed" : "completed";
              const providerPreview = providerNative
                ? providerToolPreview(toolName, provider, status)
                : undefined;
              const outputPreview =
                providerPreview ??
                stringField(payload.output_preview) ??
                stringField(data.output_preview);
              const errorPreview =
                stringField(payload.error_preview) ??
                stringField(data.error_preview);
              activeRunStatusRef.current = "generating";
              setTypingIfDelivered();
              if (providerPreview) {
                setLivePreview((prev) => appendPreview(prev, providerPreview));
              }
              setActiveTools((prev) =>
                upsertActiveTool(prev, {
                  callId: stringField(data.call_id),
                  parentCallId: stringField(data.parent_call_id),
                  name: toolName,
                  args: toolArgsSummary(data, payload),
                  textPreview: providerPreview,
                  status,
                  outputPreview,
                  errorPreview,
                  providerNative,
                  provider,
                  children: [],
                }),
              );
            });
            break;
          }

          case "HookStarted": {
            const { hook, hook_event, hook_type, source } =
              streamEvent.data as {
                hook: string;
                hook_event: string;
                hook_type: string;
                source: string;
              };
            const hookToolName = hookToolDisplayName(hook, hook_event);
            const hookArgs = normalizeToolCallArgs({
              event: hook_event,
              type: hook_type,
              source,
            });
            setTypingIfDelivered();
            setActiveTools((prev) => {
              const existing = prev.find((tool) => tool.name === hookToolName);
              if (!existing) {
                return [
                  ...prev,
                  {
                    name: hookToolName,
                    args: hookArgs,
                    status: "running" as const,
                    children: [],
                  },
                ];
              }
              return prev.map((tool) =>
                tool.name === hookToolName
                  ? {
                      ...tool,
                      args: hookArgs || tool.args,
                      status: "running" as const,
                      outputPreview: undefined,
                      errorPreview: undefined,
                    }
                  : tool,
              );
            });
            break;
          }

          case "HookCompleted": {
            const {
              hook,
              hook_event,
              hook_type,
              source,
              success,
              blocked,
              payload,
              encrypted_payload,
            } = streamEvent.data as {
              hook: string;
              hook_event: string;
              hook_type: string;
              source: string;
              success: boolean;
              blocked: boolean;
              payload?: {
                exit_code?: number | null;
                output_preview?: string | null;
                error_preview?: string | null;
                reason?: string | null;
              };
              encrypted_payload?: EncryptedPayload;
            };
            void (async () => {
              const encryptedData = await resolveEncryptedPayloadJson<{
                exit_code?: number | null;
                output_preview?: string | null;
                error_preview?: string | null;
                reason?: string | null;
              }>(encrypted_payload);
              const resolvedPayload = encryptedData ?? payload;
              const hookToolName = hookToolDisplayName(hook, hook_event);
              const outputPreview =
                resolvedPayload?.reason ??
                resolvedPayload?.output_preview ??
                undefined;
              const errorPreview =
                resolvedPayload?.error_preview ??
                (!success || blocked ? resolvedPayload?.reason : undefined) ??
                undefined;
              const hookArgs = normalizeToolCallArgs({
                event: hook_event,
                type: hook_type,
                source,
                exit_code: resolvedPayload?.exit_code,
                blocked,
              });
              setTypingIfDelivered();
              setLivePreview((prev) => appendPreview(prev, outputPreview));
              setActiveTools((prev) => {
                const existing = prev.find(
                  (tool) => tool.name === hookToolName,
                );
                if (!existing) {
                  return [
                    ...prev,
                    {
                      name: hookToolName,
                      args: hookArgs,
                      status: success && !blocked ? "completed" : "failed",
                      outputPreview,
                      errorPreview,
                      children: [],
                    },
                  ];
                }
                return prev.map((tool) =>
                  tool.name === hookToolName
                    ? {
                        ...tool,
                        args: hookArgs || tool.args,
                        status: success && !blocked ? "completed" : "failed",
                        outputPreview,
                        errorPreview,
                      }
                    : tool,
                );
              });
            })();
            break;
          }

          default:
            break;
        }
        return;
      }

      // Legacy chat.response / chat.response.chunk / chat.error formats
      // are no longer sent by the worker. All responses use the
      // agent_response envelope handled above.
    },
    [
      activeSessionId,
      clearLiveTurnIndicators,
      cancelDraftRender,
      finishLiveTurn,
      persistCurrentStreamSnapshot,
      scheduleDraftRender,
      setActiveTools,
      setLivePreview,
      setTypingIfDelivered,
    ],
  );

  // Keep the ref in sync with the latest handleIncoming
  useEffect(() => {
    handleIncomingRef.current = handleIncoming;
  }, [handleIncoming]);

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    let restoreController: AbortController | undefined;

    void loadChatStreamSnapshot(activeSessionId).then(async (snapshot) => {
      if (cancelled) return;
      if (!snapshot) return;
      applyStreamSnapshot(snapshot);
      if (snapshot.status === "completed" || snapshot.status === "done") return;

      // The worker may have completed while this view was unmounted. Confirm
      // history before opening a new core-NATS subscription, whose events are
      // intentionally not retained for late subscribers.
      if (agentId) {
        try {
          const page = await fetchChatMessages(
            projectId,
            agentId,
            { session_id: activeSessionId },
            targetType,
          );
          if (cancelled) return;
          const hasPersistedResponse = page.messages.some(
            (message) =>
              message.sender === "assistant" &&
              new Date(message.created_at).getTime() >= snapshot.updatedAt,
          );
          if (hasPersistedResponse) {
            const loaded: ChatMessage[] = await Promise.all(
              page.messages.reverse().map(async (message) => ({
                id: message.id,
                persistedId: message.id,
                replyToMessageId: message.reply_to_message_id ?? undefined,
                role: message.sender,
                content: await resolvePersistedMessageContent(message),
                command: persistedMessageCommand(message),
                timestamp: message.created_at,
                status: message.sender === "user" ? "delivered" : undefined,
                artifactIds: message.artifact_ids ?? [],
              })),
            );
            if (cancelled) return;
            const loadedWithEnvelopes = await hydrateRunEnvelopeLinks(loaded);
            if (cancelled) return;
            setMessages((prev) =>
              mergeLoadedMessages(loadedWithEnvelopes, prev),
            );
            setHasMore(page.has_more);
            clearLiveTurnIndicators({ terminalStatus: "completed" });
            return;
          }
        } catch (error) {
          console.warn(
            "Failed to check chat history during stream restore",
            error,
          );
        }
      }

      if (!snapshot.request) {
        // Snapshots written by older dashboard builds still restore the active
        // card, but do not contain enough encrypted data to reconnect.
        return;
      }

      restoreController = new AbortController();
      streamAbortRef.current = restoreController;
      const handleStreamEvent = (event: { event: string; data: unknown }) => {
        if (
          event.event === "message_persisted" ||
          event.event === "delivery_receipt"
        ) {
          handleIncomingRef.current(event.data);
          return;
        }
        const normalized = normalizeSseAgentEvent(event);
        if (normalized) {
          handleIncomingRef.current({
            type: "agent_response",
            payload: normalized,
          });
        }
      };

      void subscribeToChatStream({
        request: snapshot.request,
        afterSequence: lastSequenceRef.current || snapshot.lastSequence,
        signal: restoreController.signal,
        onEvent: handleStreamEvent,
      }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Failed to restore chat stream after navigation", error);
        }
      });
    });

    return () => {
      cancelled = true;
      restoreController?.abort();
      if (streamAbortRef.current === restoreController) {
        streamAbortRef.current = null;
      }
    };
  }, [
    activeSessionId,
    agentId,
    applyStreamSnapshot,
    clearLiveTurnIndicators,
    projectId,
    targetType,
  ]);

  useEffect(() => {
    if (!activeSessionId) return;

    let channel: BroadcastChannel | null = null;

    const handleSnapshotMessage = (data: unknown) => {
      const snapshot = data as
        | ChatStreamSnapshot
        | ChatStreamClearSnapshot
        | undefined;
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        !("sessionId" in snapshot)
      ) {
        return;
      }
      applyStreamSnapshot(snapshot);
    };

    try {
      channel = new BroadcastChannel(STREAM_CHANNEL_NAME);
      channel.addEventListener("message", (event) =>
        handleSnapshotMessage(event.data),
      );
    } catch {
      channel = null;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; snapshot?: unknown }
        | undefined;
      if (data?.type !== "chat-stream-snapshot") return;
      handleSnapshotMessage(data.snapshot);
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    }

    return () => {
      channel?.close();
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage,
        );
      }
    };
  }, [activeSessionId, applyStreamSnapshot]);

  useEffect(() => {
    activeToolsRef.current = activeTools;
    persistCurrentStreamSnapshot();
  }, [activeTools, persistCurrentStreamSnapshot]);

  useEffect(() => {
    livePreviewRef.current = livePreview;
    persistCurrentStreamSnapshot();
  }, [livePreview, persistCurrentStreamSnapshot]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: {
        domainActivation?: {
          domain_session_id: string;
          domain_command: string;
        };
        commandInvocation?: {
          command: string;
        };
        artifactIds?: string[];
      },
    ) => {
      const trimmed = text.trim();
      const artifactIds = options?.artifactIds ?? [];
      if ((!trimmed && artifactIds.length === 0) || !activeSessionId) return;

      const msgId = generateId();
      const queueIntoActiveTurn =
        !!currentRequestIdRef.current ||
        !!responseIdRef.current ||
        activeToolsRef.current.length > 0 ||
        !!livePreviewRef.current?.trim() ||
        (!!activeRunTraceRef.current &&
          !isTerminalChatRunTrace(activeRunTraceRef.current));
      if (!queueIntoActiveTurn) {
        suppressActiveRunTraceRef.current = false;
      }
      const userMsg: ChatMessage = {
        id: msgId,
        role: "user",
        content:
          trimmed ||
          `Attached ${artifactIds.length} artifact${artifactIds.length === 1 ? "" : "s"}`,
        command: options?.commandInvocation?.command,
        timestamp: new Date().toISOString(),
        status: queueIntoActiveTurn ? "queued" : "sending",
        artifactIds,
      };
      if (!queueIntoActiveTurn) {
        optimisticUserMessageIdRef.current = msgId;
        awaitingDeliveryRef.current = true;
      }
      let optimisticResponseId: string | undefined;
      if (!queueIntoActiveTurn) {
        const responseId = generateId();
        optimisticResponseId = responseId;
        const optimisticTrace: RunTrace = {
          id: responseId,
          sessionId: activeSessionId,
          source: "chat",
          phase: "queued",
          startedAt: new Date().toISOString(),
          spans: [],
        };
        responsePersistedRef.current = false;
        responseIdRef.current = responseId;
        currentRequestIdRef.current = msgId;
        activeRunIdRef.current = undefined;
        lastSequenceRef.current = 0;
        draftContentRef.current = "";
        activeRunStatusRef.current = "connecting";
        livePreviewRef.current = undefined;
        pendingFinalTraceTargetRef.current = undefined;
        suppressActiveRunTraceRef.current = false;
        activeRunTraceRef.current = optimisticTrace;
        activeRunEnvelopeIdRef.current = undefined;
        lastRunTraceRef.current = undefined;
        lastRunEnvelopeIdRef.current = undefined;
        setActiveRunTrace(optimisticTrace);
        dispatchLiveTurn({
          type: "prompt_submitted",
          requestId: msgId,
          responseId,
          runTrace: optimisticTrace,
        });
        setMessages((previous) =>
          upsertLiveAssistantDraft([...previous, userMsg], {
            id: responseId,
            content: "",
            runStatus: "connecting",
            replyToMessageId: msgId,
            runTrace: optimisticTrace,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        setMessages((previous) => [...previous, userMsg]);
      }

      const failOptimisticMessage = () => {
        if (!queueIntoActiveTurn) {
          optimisticUserMessageIdRef.current = null;
          currentRequestIdRef.current = null;
          awaitingDeliveryRef.current = false;
          dispatchLiveTurn({
            type: "failed",
            error: {
              code: "message_preparation_failed",
              message: "The message could not be prepared for the worker.",
            },
          });
          pendingFinalTraceTargetRef.current = undefined;
          suppressActiveRunTraceRef.current = true;
          if (activeRunEnvelopeIdRef.current) {
            void markEnvelopeOrphaned(activeRunEnvelopeIdRef.current);
          }
          activeRunTraceRef.current = undefined;
          activeRunEnvelopeIdRef.current = undefined;
          responseIdRef.current = null;
          cancelDraftRender();
          draftContentRef.current = "";
          setActiveRunTrace(undefined);
        }
        setMessages((prev) =>
          prev
            .filter(
              (message) =>
                !optimisticResponseId || message.id !== optimisticResponseId,
            )
            .map((message) =>
              message.id === msgId ? { ...message, status: "failed" } : message,
            ),
        );
      };

      if (!userId) {
        failOptimisticMessage();
        toast.error("This device is not ready to encrypt messages yet.");
        return;
      }

      let controller: AbortController;
      let streamPromise: Promise<void>;

      try {
        const storedAck = await loadStoredAccountContentKey();
        if (!storedAck) {
          failOptimisticMessage();
          toast.error(
            "Generate a local account content key in Settings before sending encrypted messages.",
          );
          return;
        }

        if (!workerAckSyncedRef.current) {
          try {
            await syncCurrentUserAckToActiveWorkers();
            workerAckSyncedRef.current = true;
          } catch (error) {
            console.error(
              "Failed to sync current user ACK to active workers",
              error,
            );
            failOptimisticMessage();
            toast.error(
              "This device could not sync its chat encryption access to the worker yet.",
            );
            return;
          }
        }

        const encryptedMessage = await encryptContentPayload({
          accountId: userId,
          objectId: msgId,
          objectType: "chat.message",
          plaintext: trimmed,
        });
        if (!encryptedMessage) {
          failOptimisticMessage();
          toast.error("Failed to encrypt this message on the current device.");
          return;
        }

        controller = new AbortController();
        if (!queueIntoActiveTurn) {
          streamAbortRef.current = controller;
        }

        const streamBody: ChatStreamRequest = {
          id: msgId,
          message: "[Encrypted message]",
          encrypted_message: encryptedMessage,
          ...(options?.commandInvocation
            ? { command: options.commandInvocation.command }
            : {}),
          session_id: activeSessionId,
          ...(options?.domainActivation
            ? {
                domain_session_id: options.domainActivation.domain_session_id,
                domain_activation: options.domainActivation,
              }
            : activeDomainSession
              ? { domain_session_id: activeDomainSession.id }
              : {}),
          ...(isAgentTarget ? { agent_id: agentId! } : {}),
          target_type: targetType,
          target_id: agentId!,
          ...(projectId ? { project_id: projectId } : {}),
          ...(options?.artifactIds?.length
            ? { artifact_ids: options.artifactIds }
            : {}),
        };
        activeChatRequestRef.current = streamBody;

        if (!queueIntoActiveTurn && activeSessionId) {
          const snapshot: ChatStreamSnapshot = {
            sessionId: activeSessionId,
            agentId,
            requestId: msgId,
            request: streamBody,
            responseId: responseIdRef.current ?? undefined,
            content: "",
            activeTools: activeToolsRef.current,
            livePreview: livePreviewRef.current,
            activeRunTrace: activeRunTraceRef.current,
            status: "connecting",
            updatedAt: Date.now(),
          };
          void persistChatStreamSnapshot(snapshot);
          notifyChatStreamSnapshot(snapshot);
        }

        const handleStreamEvent = (event: { event: string; data: unknown }) => {
          if (event.event === "message_persisted") {
            handleIncomingRef.current(event.data);
            return;
          }
          if (event.event === "delivery_receipt") {
            handleIncomingRef.current(event.data);
            return;
          }
          const normalized = normalizeSseAgentEvent(event);
          if (!normalized) {
            return;
          }
          handleIncomingRef.current({
            type: "agent_response",
            payload: normalized,
          });
        };

        streamPromise = subscribeToChatStream({
          request: streamBody,
          afterSequence: lastSequenceRef.current,
          signal: controller.signal,
          onEvent: handleStreamEvent,
        });
      } catch (error) {
        console.error("Failed to prepare chat stream:", error);
        failOptimisticMessage();
        toast.error("Failed to prepare this message on the current device.");
        if (activeSessionId && !queueIntoActiveTurn) {
          const updatedAt = Date.now();
          void clearChatStreamSnapshot(
            activeSessionId,
            optimisticResponseId,
            "failed",
            updatedAt,
          );
          notifyChatStreamSnapshot({
            sessionId: activeSessionId,
            clear: true,
            responseId: optimisticResponseId,
            terminalStatus: "failed",
            updatedAt,
          });
        }
        return;
      }

      void streamPromise
        .then(async () => {
          await streamWorkQueueRef.current.drain();
          await envelopeWorkQueueRef.current.drain();
          const sessionId = activeSessionId;
          const resolvedAgentId = agentId;
          if (!sessionId || !resolvedAgentId) return;
          const page = await fetchChatMessages(
            projectId,
            resolvedAgentId,
            {
              session_id: sessionId,
            },
            targetType,
          );
          const loaded: ChatMessage[] = await Promise.all(
            page.messages.reverse().map(async (message) => ({
              id: message.id,
              persistedId: message.id,
              replyToMessageId: message.reply_to_message_id ?? undefined,
              role: message.sender,
              content: await resolvePersistedMessageContent(message),
              command: persistedMessageCommand(message),
              timestamp: message.created_at,
              status: message.sender === "user" ? "delivered" : undefined,
              artifactIds: message.artifact_ids ?? [],
            })),
          );
          const loadedWithEnvelopes = await hydrateRunEnvelopeLinks(loaded);
          setMessages((prev) => mergeLoadedMessages(loadedWithEnvelopes, prev));
          setHasMore(page.has_more);
          void gcSessionRunEnvelopes(sessionId, currentUser?.org_id);
        })
        .catch(async (err) => {
          await streamWorkQueueRef.current.drain();
          console.error("Failed to stream chat:", err);
          const wasCancelled =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.name === "AbortError");
          const failedResponseId = optimisticResponseId;
          const ownsLiveTurn =
            !queueIntoActiveTurn &&
            scheduledDraftBelongsToResponse(
              optimisticResponseId ?? null,
              responseIdRef.current,
            );
          if (!queueIntoActiveTurn && !ownsLiveTurn) return;
          cancelDraftRender();
          if (!queueIntoActiveTurn) {
            optimisticUserMessageIdRef.current = null;
          }
          if (activeSessionId && !queueIntoActiveTurn && wasCancelled) {
            const updatedAt = Date.now();
            void clearChatStreamSnapshot(
              activeSessionId,
              optimisticResponseId,
              "cancelled",
              updatedAt,
            );
            notifyChatStreamSnapshot({
              sessionId: activeSessionId,
              clear: true,
              responseId: optimisticResponseId,
              terminalStatus: "cancelled",
              updatedAt,
            });
          }
          if (wasCancelled) {
            dispatchLiveTurn({ type: "cancelled" });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, status: "cancelled" } : m,
              ),
            );
          } else if (!queueIntoActiveTurn) {
            activeRunStatusRef.current = "failed";
            dispatchLiveTurn({
              type: "failed",
              error: {
                code: "stream_disconnected",
                message:
                  "The live connection was interrupted. You can retry while the saved run remains recoverable.",
                retryable: true,
              },
            });
            const id =
              failedResponseId ?? activeRunIdRef.current ?? generateId();
            setMessages((previous) => {
              const index = previous.findIndex((message) => message.id === id);
              const failed: ChatMessage = {
                id,
                role: "assistant",
                content: draftContentRef.current,
                timestamp: new Date().toISOString(),
                replyToMessageId: currentRequestIdRef.current ?? msgId,
                runStatus: "failed",
                errorCode: "stream_disconnected",
                errorMessage:
                  "The live connection was interrupted. You can retry while the saved run remains recoverable.",
                retryable: true,
                isLiveDraft: false,
                runTrace: activeRunTraceRef.current,
              };
              return index < 0
                ? [...previous, failed]
                : previous.map((message, messageIndex) =>
                    messageIndex === index
                      ? { ...message, ...failed }
                      : message,
                  );
            });
            persistCurrentStreamSnapshot();
          }
        })
        .finally(() => {
          if (streamAbortRef.current === controller) {
            streamAbortRef.current = null;
          }
          if (queueIntoActiveTurn) {
            return;
          }
          if (clearTypingUiTimeoutRef.current) {
            clearTimeout(clearTypingUiTimeoutRef.current);
          }
          clearTypingUiTimeoutRef.current = setTimeout(() => {
            if (
              responseIdRef.current !== null &&
              responseIdRef.current !== optimisticResponseId
            ) {
              clearTypingUiTimeoutRef.current = null;
              return;
            }
            cancelDraftRender();
            activeToolsRef.current = [];
            livePreviewRef.current = undefined;
            dispatchLiveTurn({ type: "reset" });
            currentRequestIdRef.current = null;
            responseIdRef.current = null;
            activeRunTraceRef.current = undefined;
            activeRunEnvelopeIdRef.current = undefined;
            setActiveRunTrace(undefined);
            clearTypingUiTimeoutRef.current = null;
          }, 0);
        });
    },
    [
      projectId,
      agentId,
      activeDomainSession,
      activeSessionId,
      currentUser?.org_id,
      userId,
      targetType,
      isAgentTarget,
      cancelDraftRender,
      persistCurrentStreamSnapshot,
    ],
  );

  const retryMessage = useCallback(
    async (assistantMessageId: string) => {
      const failed = messages.find(
        (message) => message.id === assistantMessageId,
      );
      if (!failed?.retryable || !failed.replyToMessageId) return;
      const input = messages.find(
        (message) =>
          message.role === "user" &&
          (message.id === failed.replyToMessageId ||
            message.persistedId === failed.replyToMessageId),
      );
      if (!input) return;
      await sendMessage(input.content, {
        ...(input.command
          ? { commandInvocation: { command: input.command } }
          : {}),
        artifactIds: input.artifactIds,
      });
    },
    [messages, sendMessage],
  );

  // Enter a domain by command (e.g. "#creator")
  const enterDomain = useCallback(
    async (
      domainId: string,
      domainCommand: string,
      overrideRoleId?: string,
      userMessage?: string,
      artifactIds?: string[],
    ) => {
      const effectiveRoleId = overrideRoleId ?? agentId;
      if (!effectiveRoleId || activeDomainSession) return;
      const message = userMessage?.trim();
      if (!message) return;

      try {
        suppressedDomainRestoreRef.current.delete(
          domainRestoreKey(projectId, effectiveRoleId),
        );
        setIsDomainPending(true);
        const session = await createDomainSession(
          domainId,
          projectId,
          effectiveRoleId,
        );
        pendingDomainSessionRef.current = session;
        setActiveDomainSession(session);
        setIsDomainPending(false);
        pendingDomainSessionRef.current = null;

        await sendMessage(message, {
          domainActivation: {
            domain_session_id: session.id,
            domain_command: domainCommand,
          },
          artifactIds,
        });
      } catch (err) {
        pendingDomainSessionRef.current = null;
        setIsDomainPending(false);
        console.error("Failed to enter domain:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "assistant" as const,
            content: `Failed to enter domain: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    },
    [projectId, agentId, activeDomainSession, domainRestoreKey, sendMessage],
  );

  // Exit the active domain
  const exitDomain = useCallback(async () => {
    if (!isAgentTarget || !activeDomainSession || !agentId) return;

    try {
      const restoreKey = domainRestoreKey(projectId, agentId);
      suppressedDomainRestoreRef.current.add(restoreKey);
      await completeDomainSession(activeDomainSession.id);
      pendingDomainSessionRef.current = null;
      setActiveDomainSession(null);

      await exitChatDomain({
        project_id: projectId ?? null,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
        chat_session_id: activeSessionId ?? null,
      });
    } catch (err) {
      suppressedDomainRestoreRef.current.delete(
        domainRestoreKey(projectId, agentId),
      );
      console.error("Failed to exit domain:", err);
    }
  }, [
    projectId,
    agentId,
    activeSessionId,
    activeDomainSession,
    domainRestoreKey,
    isAgentTarget,
  ]);

  // Cancel the active domain (discard artifact)
  const cancelDomain = useCallback(async () => {
    if (!isAgentTarget || !activeDomainSession || !agentId) return;

    try {
      const restoreKey = domainRestoreKey(projectId, agentId);
      suppressedDomainRestoreRef.current.add(restoreKey);
      await cancelDomainSession(activeDomainSession.id);
      pendingDomainSessionRef.current = null;
      setActiveDomainSession(null);

      await exitChatDomain({
        project_id: projectId ?? null,
        agent_id: agentId,
        domain_session_id: activeDomainSession.id,
        chat_session_id: activeSessionId ?? null,
      });
    } catch (err) {
      suppressedDomainRestoreRef.current.delete(
        domainRestoreKey(projectId, agentId),
      );
      console.error("Failed to cancel domain:", err);
    }
  }, [
    projectId,
    agentId,
    activeSessionId,
    activeDomainSession,
    domainRestoreKey,
    isAgentTarget,
  ]);

  const deleteMessage = useCallback(
    (messageId: string) => {
      // Look up the persistedId (server UUID) before removing from state.
      // Messages now keep their client-generated ID in `id` and store the
      // server UUID in `persistedId`.
      const target = messages.find((m) => m.id === messageId);
      const dbId = target?.persistedId;

      // Optimistically remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Evict from role cache so the deletion persists across role switches
      if (agentId) {
        agentCacheRef.current.delete(cacheKey(agentId, activeSessionId));
      }

      // Delete from the database using the server-generated UUID.
      // Fall back to messageId itself for messages loaded from the API
      // (which already use the server UUID as their id).
      const deleteId = dbId ?? messageId;
      const envelopeInputMessageId =
        target?.replyToMessageId ??
        (target?.role === "user" ? deleteId : undefined);
      if (envelopeInputMessageId) {
        void deleteEnvelopeForInputMessage(envelopeInputMessageId);
      }
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          deleteId,
        );
      if (isUuid) {
        deleteChatMessage(deleteId).catch((err) =>
          console.error("Failed to delete chat message:", err),
        );
      }
    },
    [agentId, activeSessionId, cacheKey, messages],
  );

  // Archive the current session instead of bulk-deleting all messages
  const clearMessages = useCallback(() => {
    if (!agentId) return;
    setMessages([]);
    setHasMore(false);
    if (agentId) {
      agentCacheRef.current.delete(cacheKey(agentId, activeSessionId));
    }
    if (activeSessionId) {
      void deleteEnvelopesForSession(activeSessionId);
      archiveChatSession(activeSessionId)
        .then(async () => {
          setSessions((prev) => prev.filter((s) => s.id !== activeSessionId));
          // Auto-create a new session to replace the archived one
          try {
            const session = await createChatSession({
              ...(projectId ? { project_id: projectId } : {}),
              ...(isAgentTarget ? { agent_id: agentId } : {}),
              target_type: targetType,
              target_id: agentId,
            });
            setSessions((prev) => [session, ...prev]);
            setActiveSessionId(session.id);
          } catch (err) {
            console.error("Failed to auto-create session:", err);
            setActiveSessionId(null);
          }
        })
        .catch((err) => console.error("Failed to archive session:", err));
    }
  }, [
    projectId,
    agentId,
    activeSessionId,
    cacheKey,
    isAgentTarget,
    targetType,
    setActiveSessionId,
  ]);

  const cancelResponse = useCallback(() => {
    const activeTrace = activeRunTraceRef.current;
    const cancelledResponseId = responseIdRef.current ?? undefined;
    const hasCancelableResponse =
      isTyping ||
      hasActiveChatRequest ||
      !!streamAbortRef.current ||
      !!currentRequestIdRef.current ||
      !!responseIdRef.current ||
      Boolean(activeTrace && !isTerminalChatRunTrace(activeTrace));
    if (!hasCancelableResponse || cancelResponseInFlightRef.current) return;
    cancelResponseInFlightRef.current = true;

    const cancelRequest =
      isAgentTarget && activeSessionId
        ? {
            ...(agentId ? { agent_id: agentId } : {}),
            session_id: activeSessionId,
          }
        : undefined;

    // Hide the typing affordance immediately, but keep the stream open until
    // the cancel command has been sent to the platform.
    dispatchLiveTurn({ type: "cancelled" });

    const finishLocalCancel = () => {
      const completedAt = new Date().toISOString();
      const cancelledTrace = reduceRunTrace(
        activeTrace,
        { event_type: "RunCancelled", data: {} },
        { now: completedAt },
      );
      if (cancelledTrace) {
        lastRunTraceRef.current = cancelledTrace;
      }
      if (cancelledResponseId) {
        setMessages((previous) =>
          previous.map((message) =>
            message.role === "assistant" &&
            (message.id === cancelledResponseId ||
              message.persistedId === cancelledResponseId)
              ? {
                  ...message,
                  runStatus: "cancelled",
                  runTrace: cancelledTrace ?? message.runTrace,
                  isLiveDraft: false,
                }
              : message,
          ),
        );
      }
      cancelDraftRender();
      responseIdRef.current = null;
      currentRequestIdRef.current = null;
      pendingFinalTraceTargetRef.current = undefined;
      suppressActiveRunTraceRef.current = true;
      activeRunStatusRef.current = "cancelled";
      if (activeRunEnvelopeIdRef.current) {
        void markEnvelopeOrphaned(activeRunEnvelopeIdRef.current);
      }
      activeRunTraceRef.current = undefined;
      activeRunEnvelopeIdRef.current = undefined;
      setActiveRunTrace(undefined);
      dispatchLiveTurn({ type: "reset" });
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (activeSessionId) {
        const updatedAt = Date.now();
        void clearChatStreamSnapshot(
          activeSessionId,
          cancelledResponseId,
          "cancelled",
          updatedAt,
        );
        notifyChatStreamSnapshot({
          sessionId: activeSessionId,
          clear: true,
          responseId: cancelledResponseId,
          terminalStatus: "cancelled",
          updatedAt,
        });
      }
      cancelResponseInFlightRef.current = false;
    };

    if (!cancelRequest) {
      finishLocalCancel();
      return;
    }

    void cancelChat(cancelRequest)
      .catch((err) => {
        console.error("Failed to cancel chat:", err);
      })
      .finally(finishLocalCancel);
  }, [
    agentId,
    activeSessionId,
    isTyping,
    hasActiveChatRequest,
    isAgentTarget,
    cancelDraftRender,
  ]);

  // ── Session management callbacks ─────────────────────────────────────
  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      // Save current to cache
      if (agentId) {
        agentCacheRef.current.set(cacheKey(agentId, activeSessionId), {
          messages: compactDuplicateChatMessages(messages),
          hasMore,
        });
      }
      setActiveSessionId(sessionId);
    },
    [agentId, activeSessionId, messages, hasMore, cacheKey, setActiveSessionId],
  );

  const createNewSession = useCallback(async () => {
    if (!agentId) return;
    try {
      const session = await createChatSession({
        ...(projectId ? { project_id: projectId } : {}),
        ...(isAgentTarget ? { agent_id: agentId } : {}),
        target_type: targetType,
        target_id: agentId,
      });
      setSessions((prev) => [session, ...prev]);
      switchSession(session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [projectId, agentId, switchSession, isAgentTarget, targetType]);

  const renameSession = useCallback(async (id: string, title: string) => {
    try {
      await updateChatSession(id, { title });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  }, []);

  // Notify the worker to delete the chat history file for a session
  const notifyWorkerSessionDelete = useCallback(
    (sessionId: string) => {
      if (!isAgentTarget || !agentId) return;
      if (projectId) {
        void notifyChatSessionDelete({
          project_id: projectId,
          agent_id: agentId,
          session_id: sessionId,
        }).catch((err) => {
          console.error("Failed to notify worker of session delete:", err);
        });
      }
    },
    [projectId, agentId, isAgentTarget],
  );

  const archiveSession = useCallback(
    async (id: string) => {
      try {
        await archiveChatSession(id);
        notifyWorkerSessionDelete(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (agentId) {
          agentCacheRef.current.delete(cacheKey(agentId, id));
        }
        if (id === activeSessionId) {
          const next = sessions.find((s) => s.id !== id && !s.archived_at);
          if (next) {
            setActiveSessionId(next.id);
          } else {
            // Auto-create a new session
            try {
              const session = await createChatSession({
                ...(projectId ? { project_id: projectId } : {}),
                ...(isAgentTarget ? { agent_id: agentId! } : {}),
                target_type: targetType,
                target_id: agentId!,
              });
              setSessions((prev) => [session, ...prev]);
              setActiveSessionId(session.id);
            } catch (err) {
              console.error("Failed to auto-create session:", err);
              setActiveSessionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to archive session:", err);
      }
    },
    [
      activeSessionId,
      sessions,
      agentId,
      projectId,
      cacheKey,
      notifyWorkerSessionDelete,
      isAgentTarget,
      targetType,
      setActiveSessionId,
    ],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteChatSession(id);
        notifyWorkerSessionDelete(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (agentId) {
          agentCacheRef.current.delete(cacheKey(agentId, id));
        }
        if (id === activeSessionId) {
          const next = sessions.find((s) => s.id !== id && !s.archived_at);
          if (next) {
            setActiveSessionId(next.id);
          } else {
            try {
              const session = await createChatSession({
                ...(projectId ? { project_id: projectId } : {}),
                ...(isAgentTarget ? { agent_id: agentId! } : {}),
                target_type: targetType,
                target_id: agentId!,
              });
              setSessions((prev) => [session, ...prev]);
              setActiveSessionId(session.id);
            } catch (err) {
              console.error("Failed to auto-create session:", err);
              setActiveSessionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [
      activeSessionId,
      sessions,
      agentId,
      projectId,
      cacheKey,
      notifyWorkerSessionDelete,
      isAgentTarget,
      targetType,
      setActiveSessionId,
    ],
  );

  // Keep the render boundary consistent even if Fast Refresh or an older
  // local snapshot supplied multiple identities for one assistant turn.
  const renderedMessages = useMemo(
    () => compactDuplicateChatMessages(messages),
    [messages],
  );

  return {
    messages: renderedMessages,
    livePreview,
    activeRunTrace,
    sendMessage,
    retryMessage,
    deleteMessage,
    clearMessages,
    isTyping,
    hasActiveChatRequest,
    lifecycle,
    activeTools,
    status,
    isLoadingHistory,
    hasMore,
    isLoadingMore,
    loadMore,
    activeDomainSession,
    isDomainPending,
    enterDomain,
    exitDomain,
    cancelDomain,
    cancelResponse,
    // Session management
    activeSessionId,
    sessions,
    isLoadingSessions,
    switchSession,
    createNewSession,
    renameSession,
    archiveSession,
    deleteSession,
  };
}
