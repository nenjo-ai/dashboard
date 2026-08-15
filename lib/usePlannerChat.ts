"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  authRequestHeaders,
  chatStreamsUrl,
  fetchChatMessages,
  deleteChatMessage,
  createChatStream,
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
import { consumeSseStream } from "./chatStream";
import { consumeChatStreamWithRetry } from "./chatStreamRetry";
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
  type ChatStreamSnapshot,
  type ChatStreamToolSnapshot,
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
  createSerialChatWorkQueue,
  lifecycleTraceBase,
  lifecycleRunIdentity,
  resolveAssistantMessageIdentity,
  retainedLiveChatRunTrace,
} from "./chatInterfaceState";
import { normalizeToolCallArgs } from "./toolCallDisplay";
import type { AgentLifecycleEvent, RunTrace } from "./agentRunTrace/types";
import type {
  ChatMessage,
  ChatSession,
  ChatStreamRequest,
  DomainSession,
  EncryptedPayload,
  PersistedChatMessage,
} from "./types";

type NormalizedStreamEvent = {
  event_type: string;
  data: Record<string, unknown>;
};

type LifecyclePayload = {
  label?: string;
  summary?: string;
  event?: Record<string, unknown>;
  message?: string;
  delta?: string;
  status?: string;
  details?: unknown;
  tool_name?: string;
  tool_args?: unknown;
  text_preview?: string;
  output?: unknown;
  output_preview?: string;
  error_preview?: string;
  task_preview?: string;
  result_preview?: string;
};

type ActiveToolEntry = ChatStreamToolSnapshot;

function isAbilityTool(name: string): boolean {
  return name === "use_ability" || name.startsWith("ability/");
}

function hookToolDisplayName(
  hook: string | undefined,
  hookEvent: string | undefined,
): string {
  const label = hook?.trim() || "hook";
  const event = hookEvent?.trim();
  return event ? `hook/${label}:${event}` : `hook/${label}`;
}

function appendPreview(
  existing?: string,
  incoming?: string,
): string | undefined {
  const next = incoming?.trim();
  if (!next) return existing;
  const prev = existing?.trim();
  return prev ? `${prev}\n\n${next}` : next;
}

type ToolPreviewPayload = LifecyclePayload & {
  provider_native?: boolean;
  provider?: string;
  tool_origin?: string;
};

type ToolStreamData = Record<string, unknown> & {
  batch_id?: string;
  call_id?: string;
  parent_call_id?: string;
  tool_name?: string;
  success?: boolean;
  payload?: ToolPreviewPayload;
  encrypted_payload?: EncryptedPayload;
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function providerDisplayName(provider?: string): string {
  if (!provider) return "provider";
  if (provider.toLowerCase() === "xai") return "xAI";
  return provider;
}

function toolDisplayName(toolName: string): string {
  return toolName.replaceAll("_", " ");
}

function providerToolPreview(
  toolName: string,
  provider: string | undefined,
  status: "started" | "completed" | "failed",
): string {
  const providerName = providerDisplayName(provider);
  if (toolName === "web_search") {
    if (status === "started") return `Searching the web with ${providerName}`;
    if (status === "failed") return `Web search failed`;
    return `Web search completed`;
  }
  if (toolName === "x_search") {
    if (status === "started") return `Searching X with ${providerName}`;
    if (status === "failed") return `X search failed`;
    return `X search completed`;
  }
  const label = toolDisplayName(toolName);
  if (status === "started") return `Running ${label} with ${providerName}`;
  if (status === "failed") return `${label} failed`;
  return `${label} completed`;
}

function isProviderTool(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): boolean {
  return (
    data.provider_native === true ||
    data.tool_origin === "provider" ||
    payload?.provider_native === true ||
    payload?.tool_origin === "provider"
  );
}

function providerForTool(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): string | undefined {
  return stringField(payload?.provider) ?? stringField(data.provider);
}

function toolArgsSummary(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): string {
  const args =
    payload?.tool_args !== undefined ? payload.tool_args : data.tool_args;
  if (args !== undefined) return normalizeToolCallArgs(args);
  return stringField(data.args_summary) ?? "";
}

function upsertActiveTool(
  tools: ActiveToolEntry[],
  next: ActiveToolEntry,
): ActiveToolEntry[] {
  const matches = (tool: ActiveToolEntry) =>
    next.callId ? tool.callId === next.callId : tool.name === next.name;
  const update = (tool: ActiveToolEntry): ActiveToolEntry =>
    matches(tool)
      ? {
          ...tool,
          ...next,
          args: next.args || tool.args,
          textPreview: next.textPreview ?? tool.textPreview,
          outputPreview: next.outputPreview ?? tool.outputPreview,
          errorPreview: next.errorPreview ?? tool.errorPreview,
        }
      : {
          ...tool,
          children: tool.children?.map(update),
        };

  if (tools.some(matches)) return tools.map(update);
  return [...tools.map(update), next];
}

const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
const PENDING_AGENT_KEY = "nenjo:pendingAgentId";
const TOOLS_KEY = "nenjo:activeTools";
const LIVE_PREVIEW_KEY = "nenjo:livePreview";
const STREAM_CHANNEL_NAME = "nenjo-chat-stream";
const ENCRYPTED_USER_MESSAGE_PLACEHOLDER = "[Encrypted message]";

function persistedMessageCommand(
  message: Pick<PersistedChatMessage, "metadata">,
): string | undefined {
  const command = message.metadata?.command;
  return typeof command === "string" && command.trim().startsWith("/")
    ? command.trim()
    : undefined;
}

function isClearSnapshot(
  snapshot: ChatStreamSnapshot | { sessionId: string; clear: true },
): snapshot is { sessionId: string; clear: true } {
  return "clear" in snapshot && snapshot.clear === true;
}

function generateId(): string {
  return crypto.randomUUID();
}

function readPendingAgentId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_AGENT_KEY);
  } catch {
    return null;
  }
}

function writePendingAgentId(agentId: string | null): void {
  try {
    if (agentId) {
      sessionStorage.setItem(PENDING_AGENT_KEY, agentId);
    } else {
      sessionStorage.removeItem(PENDING_AGENT_KEY);
    }
  } catch {
    // ignore
  }
}

function isBrowserReload(): boolean {
  if (typeof performance === "undefined") return false;
  const [navigation] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  return navigation?.type === "reload";
}

function readPersistedTools() {
  try {
    const raw = sessionStorage.getItem(TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePersistedTools(tools: unknown[]): void {
  try {
    if (tools.length > 0) {
      sessionStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
    } else {
      sessionStorage.removeItem(TOOLS_KEY);
    }
  } catch {
    // ignore
  }
}

function readPersistedLivePreview(): string | undefined {
  try {
    return sessionStorage.getItem(LIVE_PREVIEW_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writePersistedLivePreview(preview?: string): void {
  try {
    const next = preview?.trim();
    if (next) {
      sessionStorage.setItem(LIVE_PREVIEW_KEY, next);
    } else {
      sessionStorage.removeItem(LIVE_PREVIEW_KEY);
    }
  } catch {
    // ignore
  }
}

function normalizeSseAgentEvent(event: {
  event: string;
  data: unknown;
}): NormalizedStreamEvent | null {
  if (typeof event.data === "object" && event.data !== null) {
    const maybeWrapped = event.data as { event_type?: unknown; data?: unknown };
    if (typeof maybeWrapped.event_type === "string") {
      return {
        event_type: maybeWrapped.event_type,
        data: (maybeWrapped.data as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  const eventTypeMap: Record<string, string> = {
    hook_started: "HookStarted",
    hook_completed: "HookCompleted",
    run_started: "RunStarted",
    run_completed: "RunCompleted",
    run_failed: "RunFailed",
    run_cancelled: "RunCancelled",
    model_request_started: "ModelRequestStarted",
    assistant_text_delta: "AssistantTextDelta",
    assistant_response: "AssistantResponse",
    model_request_completed: "ModelRequestCompleted",
    tool_call_started: "ToolCallStarted",
    tool_output_delta: "ToolOutputDelta",
    tool_call_completed: "ToolCallCompleted",
    async_operation_event: "AsyncOperationEvent",
    async_operation_transcript: "AsyncOperationTranscript",
    done: "Done",
    error: "Error",
    domain_entered: "DomainEntered",
    domain_exited: "DomainExited",
    message_compacted: "MessageCompacted",
    paused: "Paused",
    resumed: "Resumed",
  };

  const event_type = eventTypeMap[event.event];
  if (!event_type || typeof event.data !== "object" || event.data === null) {
    return null;
  }

  return {
    event_type,
    data: event.data as Record<string, unknown>,
  };
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
    const link = inputMessageId
      ? links.get(inputMessageId)
      : undefined;
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

function chatMessageIdentityMatches(
  existing: ChatMessage,
  incoming: ChatMessage,
): boolean {
  if (existing.id === incoming.id) return true;
  if (incoming.persistedId) {
    return (
      existing.id === incoming.persistedId ||
      existing.persistedId === incoming.persistedId
    );
  }
  if (existing.persistedId) {
    return existing.persistedId === incoming.id;
  }
  return false;
}

function mergeChatMessageIdentity(
  existing: ChatMessage,
  incoming: ChatMessage,
): ChatMessage {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    persistedId:
      incoming.persistedId ??
      existing.persistedId ??
      (existing.id !== incoming.id ? incoming.id : undefined),
    replyToMessageId:
      incoming.replyToMessageId ?? existing.replyToMessageId,
    content: incoming.content || existing.content,
    timestamp: incoming.timestamp || existing.timestamp,
    status: incoming.status ?? existing.status,
    runEnvelopeId: incoming.runEnvelopeId ?? existing.runEnvelopeId,
    runTrace: incoming.runTrace ?? existing.runTrace,
  };
}

function compactDuplicateChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const compacted: ChatMessage[] = [];
  for (const message of messages) {
    const duplicateIndex = compacted.findIndex((existing) =>
      chatMessageIdentityMatches(existing, message),
    );
    if (duplicateIndex === -1) {
      compacted.push(message);
      continue;
    }
    compacted[duplicateIndex] = mergeChatMessageIdentity(
      compacted[duplicateIndex],
      message,
    );
  }
  return compacted;
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
    return withAttachmentFallback(normalizeResolvedAssistantContent(message.content));
  }

  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted !== null) {
      return withAttachmentFallback(normalizeResolvedAssistantContent(decrypted));
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

async function resolveEncryptedPayloadJson<T extends Record<string, unknown>>(
  encryptedPayload?: EncryptedPayload,
): Promise<Partial<T> | undefined> {
  if (!encryptedPayload) return undefined;
  try {
    const storedAck = await loadStoredAccountContentKey();
    const decrypted = await decryptContentPayload(encryptedPayload);
    if (decrypted) {
      return JSON.parse(decrypted) as Partial<T>;
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
      return JSON.parse(retried) as Partial<T>;
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

function lifecycleRunId(event: AgentLifecycleEvent): string | undefined {
  return "run_id" in event.data ? event.data.run_id : undefined;
}

function lifecycleSessionId(event: AgentLifecycleEvent): string | undefined {
  return "session_id" in event.data ? event.data.session_id : undefined;
}

function isTerminalRunTrace(trace: RunTrace | undefined): boolean {
  return (
    trace?.phase === "completed" ||
    trace?.phase === "failed" ||
    trace?.phase === "cancelled"
  );
}

function isTerminalAssistantStatus(status: string | undefined): boolean {
  return Boolean(status && status !== "in_progress");
}

function hasRestorableStreamProgress(snapshot: ChatStreamSnapshot): boolean {
  return snapshot.status === "streaming";
}

export function usePlannerChat(
  projectId: string | null | undefined,
  agentId?: string,
  initialSessionId?: string,
  targetType: "agent" | "council" = "agent",
) {
  const { currentUser, userId } = useCurrentUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [livePreview, setLivePreview] = useState<string | undefined>(undefined);
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
  const status = "connected";
  const isAgentTarget = targetType === "agent";

  // Initialize from pendingAgentId so the typing indicator is correct on the
  // very first render after remount — no useEffect delay.
  // Only show typing if THIS role is the one with a pending response.
  const [isTyping, setIsTyping] = useState(
    () => !isBrowserReload() && !!agentId && readPendingAgentId() === agentId,
  );

  useEffect(() => {
    void warmAccountContentKey();
  }, []);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isReloadRef = useRef(isBrowserReload());
  const workerAckSyncedRef = useRef(false);
  const [activeTools, setActiveTools] = useState<ActiveToolEntry[]>(() =>
    !isBrowserReload() && !!agentId && readPendingAgentId() === agentId
      ? (readPersistedTools() as ActiveToolEntry[])
      : [],
  );
  const [hasActiveChatRequest, setHasActiveChatRequest] = useState(false);
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

  const setTypingIfDelivered = useCallback(() => {
    if (!awaitingDeliveryRef.current) {
      setIsTyping(true);
    }
  }, []);

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
      content: "",
      activeTools: activeToolsRef.current,
      livePreview: livePreviewRef.current,
      activeRunTrace: activeRunTraceRef.current,
      status: "streaming",
      updatedAt: Date.now(),
    };
    void persistChatStreamSnapshot(snapshot);
  }, [activeSessionId, agentId]);

  const clearLiveTurnIndicators = useCallback(
    (
      options: {
        preserveRunTraceForFinalMessage?: boolean;
        broadcastClear?: boolean;
      } = {},
    ) => {
      const {
        preserveRunTraceForFinalMessage = false,
        broadcastClear = true,
      } = options;
      if (clearTypingUiTimeoutRef.current) {
        clearTimeout(clearTypingUiTimeoutRef.current);
      }
      activeToolsRef.current = [];
      livePreviewRef.current = undefined;
      setActiveTools([]);
      setLivePreview(undefined);
      setIsTyping(false);
      setHasActiveChatRequest(false);
      currentRequestIdRef.current = null;
      activeChatRequestRef.current = undefined;
      if (!preserveRunTraceForFinalMessage) {
        activeRunTraceRef.current = undefined;
      }
      setActiveRunTrace(undefined);
      clearTypingUiTimeoutRef.current = null;
      if (activeSessionId) {
        void clearChatStreamSnapshot(activeSessionId);
        if (broadcastClear) {
          notifyChatStreamSnapshot({
            sessionId: activeSessionId,
            clear: true,
          });
        }
      }
    },
    [activeSessionId],
  );

  const finishFinalizedLiveTurn = useCallback(() => {
    activeChatRequestRef.current = undefined;
    activeRunTraceRef.current = undefined;
    activeRunEnvelopeIdRef.current = undefined;
    setActiveRunTrace(undefined);
    if (activeSessionId) {
      void clearChatStreamSnapshot(activeSessionId);
      notifyChatStreamSnapshot({
        sessionId: activeSessionId,
        clear: true,
      });
    }
  }, [activeSessionId]);

  const applyStreamSnapshot = useCallback(
    (snapshot: ChatStreamSnapshot | { sessionId: string; clear: true }) => {
      if (!activeSessionId || snapshot.sessionId !== activeSessionId) {
        return;
      }

      if (isClearSnapshot(snapshot)) {
        currentRequestIdRef.current = null;
        responseIdRef.current = null;
        responsePersistedRef.current = false;
        suppressActiveRunTraceRef.current = true;
        activeToolsRef.current = [];
        livePreviewRef.current = undefined;
        activeRunTraceRef.current = undefined;
        setActiveTools([]);
        setLivePreview(undefined);
        setIsTyping(false);
        setActiveRunTrace(undefined);
        return;
      }

      const responseId = snapshot.responseId ?? snapshot.requestId;
      currentRequestIdRef.current = snapshot.requestId;
      activeChatRequestRef.current = snapshot.request;
      responseIdRef.current = responseId;
      responsePersistedRef.current = false;
      suppressActiveRunTraceRef.current = false;
      activeToolsRef.current = snapshot.activeTools ?? [];
      livePreviewRef.current = snapshot.livePreview;
      setActiveTools(snapshot.activeTools ?? []);
      setLivePreview(snapshot.livePreview);
      const restoredTrace = snapshot.activeRunTrace as RunTrace | undefined;
      activeRunTraceRef.current = restoredTrace;
      if (restoredTrace && !isTerminalRunTrace(restoredTrace)) {
        lastRunTraceRef.current = restoredTrace;
        setActiveRunTrace(restoredTrace);
      } else {
        setActiveRunTrace(undefined);
      }
      const isStreaming = snapshot.status === "streaming";
      setHasActiveChatRequest(isStreaming);
      setIsTyping(isStreaming && hasRestorableStreamProgress(snapshot));
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
                    timestamp: new Date(snapshot.updatedAt).toISOString(),
                  }
                : message,
            ),
          );
        }

        if (!snapshot.content.trim()) {
          return prev;
        }

        return compactDuplicateChatMessages([
          ...prev,
          {
            id: responseId,
            role: "assistant",
            content: snapshot.content,
            timestamp: new Date(snapshot.updatedAt).toISOString(),
          },
        ]);
      });
    },
    [activeSessionId],
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
  }, [projectId, agentId, initialSessionId, targetType, isAgentTarget, setActiveSessionId]);

  // ── Load history on mount / role / session change ─────────────────────
  useEffect(() => {
    const previousAgentId = prevAgentIdRef.current;
    const previousSessionId = prevSessionIdRef.current;
    const sessionChanged =
      previousAgentId !== agentId || previousSessionId !== activeSessionId;
    const pendingAgentId = readPendingAgentId();
    const persistedActiveTools = readPersistedTools() as ActiveToolEntry[];
    const persistedLivePreview = readPersistedLivePreview();

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

    // Reset typing state: only show if the NEW role has a pending response
    const isPending =
      !isReloadRef.current && !!agentId && pendingAgentId === agentId;
    setIsTyping(isPending);
    setActiveTools(isPending ? persistedActiveTools : []);
    setLivePreview(isPending ? persistedLivePreview : undefined);

    // Clear the response ref so stray tokens from the old role don't bleed in
    responseIdRef.current = null;
    currentRequestIdRef.current = null;
    activeToolsRef.current = isPending ? persistedActiveTools : [];
    livePreviewRef.current = isPending ? persistedLivePreview : undefined;
    activeRunEnvelopeIdRef.current = undefined;
    suppressActiveRunTraceRef.current = !isPending;

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
        const storedAck = await loadStoredAccountContentKey().catch(() => null);
        console.warn("Chat history fetch", {
          sessionId: activeSessionId,
          totalMessages: page.messages.length,
          assistantMessages: page.messages
            .filter((message) => message.sender === "assistant")
            .map((message) => ({
              id: message.id,
              content: message.content,
              hasEncryptedPayload: Boolean(
                message.encrypted_payload ??
                message.metadata?.encrypted_payload,
              ),
              objectId: (
                message.encrypted_payload ?? message.metadata?.encrypted_payload
              )?.object_id,
              objectType: (
                message.encrypted_payload ?? message.metadata?.encrypted_payload
              )?.object_type,
            })),
          hasAck: Boolean(storedAck),
        });
        if (page.messages.length === 0) {
          setMessages([]);
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
          setMessages(
            compactDuplicateChatMessages(await hydrateRunEnvelopeLinks(loaded)),
          );
          setHasMore(page.has_more);
          void gcSessionRunEnvelopes(activeSessionId, currentUser?.org_id);
        }
      })
      .catch((err) => {
        if (fetchId !== historyFetchIdRef.current) return;
        console.error("Failed to load chat history:", err);
        setMessages([]);
        setHasMore(false);
      })
      .finally(() => {
        if (fetchId !== historyFetchIdRef.current) return;
        setIsLoadingHistory(false);
      });
  }, [projectId, agentId, activeSessionId, currentUser?.org_id, targetType, cacheKey]);

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
      const storedAck = await loadStoredAccountContentKey().catch(() => null);
      console.warn("Chat history pagination fetch", {
        sessionId: activeSessionId,
        totalMessages: page.messages.length,
        assistantMessages: page.messages
          .filter((message) => message.sender === "assistant")
          .map((message) => ({
            id: message.id,
            content: message.content,
            hasEncryptedPayload: Boolean(
              message.encrypted_payload ?? message.metadata?.encrypted_payload,
            ),
            objectId: (
              message.encrypted_payload ?? message.metadata?.encrypted_payload
            )?.object_id,
            objectType: (
              message.encrypted_payload ?? message.metadata?.encrypted_payload
            )?.object_type,
          })),
        hasAck: Boolean(storedAck),
      });
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

        streamWorkQueueRef.current.enqueue(async () => {
          const lifecycleEvent =
            await resolveLifecycleEventPayload(streamEvent);
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
          if (envelopeId && envelopeSessionId) {
            await appendEnvelopeEvent({
              envelopeId,
              runId: envelopeId,
              sessionId: envelopeSessionId,
              event: lifecycleEvent,
            }).catch((error) => {
              console.warn("Failed to append agent run envelope event", error);
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
              }).catch((error) => {
                console.warn(
                  "Failed to link agent run envelope to its input message",
                  error,
                );
              });
            }
          }
          const next = reduceRunTrace(
            lifecycleTraceBase({
              activeTrace: activeRunTraceRef.current,
              receivedTrace,
              lastTrace: lastRunTraceRef.current,
              eventRunId: eventRunId ?? envelopeId,
            }),
            lifecycleEvent,
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
            if (pendingTarget) {
              setMessages((prev) => {
                let attached = false;
                const updated = prev.map((message) => {
                  const matches =
                    message.role === "assistant" &&
                    ((pendingTarget.id && message.id === pendingTarget.id) ||
                      message.content === pendingTarget.content);
                  if (!matches) return message;
                  attached = true;
                  return { ...message, runTrace: message.runTrace ?? next };
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
            persistCurrentStreamSnapshot();
          } else {
            activeRunTraceRef.current = undefined;
            setActiveRunTrace(undefined);
            if (activeSessionId) {
              void clearChatStreamSnapshot(activeSessionId);
              if (suppressActiveRunTraceRef.current || isFinalizedRun) {
                notifyChatStreamSnapshot({
                  sessionId: activeSessionId,
                  clear: true,
                });
              }
            }
          }
        });

        switch (streamEvent.event_type) {
          case "AssistantResponse": {
            const inputMessageId = currentRequestIdRef.current ?? undefined;
            const data = streamEvent.data as {
              payload?: {
                message?: string;
                status?: string;
                message_id?: string;
                input_message_id?: string;
              };
              encrypted_payload?: EncryptedPayload;
              message?: string;
              status?: string;
            };
            streamWorkQueueRef.current.enqueue(async () => {
              const encryptedData = await resolveEncryptedPayloadJson<{
                message?: string;
                status?: string;
                message_id?: string;
                input_message_id?: string;
              }>(data.encrypted_payload);
              const payload = encryptedData ?? data.payload ?? {};
              const message =
                typeof payload.message === "string"
                  ? payload.message
                  : typeof data.message === "string"
                    ? data.message
                    : "";
              const status =
                typeof payload.status === "string"
                  ? payload.status
                  : typeof data.status === "string"
                    ? data.status
                    : "completed";
              const terminal = isTerminalAssistantStatus(status);
              const eventMessageId = typeof payload.message_id === "string"
                ? payload.message_id
                : undefined;
              const responseInputMessageId = typeof payload.input_message_id === "string"
                ? payload.input_message_id
                : inputMessageId;
              if (!message.trim()) {
                if (terminal) {
                  const finalizingEnvelopeId =
                    activeRunEnvelopeIdRef.current ??
                    lastRunEnvelopeIdRef.current;
                  if (finalizingEnvelopeId) {
                    finalizedRunEnvelopeIdsRef.current.add(
                      finalizingEnvelopeId,
                    );
                  }
                  suppressActiveRunTraceRef.current = true;
                  clearLiveTurnIndicators();
                }
                return;
              }
              let id = terminal ? responseIdRef.current : eventMessageId;
              if (!id) id = generateId();
              if (terminal) {
                responseIdRef.current = id;
              }
              const now = new Date().toISOString();
              setTypingIfDelivered();
              setMessages((prev) => {
                const existing = prev.find((m) => m.id === id);
                if (existing) {
                  return compactDuplicateChatMessages(
                    prev.map((m) =>
                      m.id === id
                        ? {
                            ...m,
                            replyToMessageId:
                              responseInputMessageId ?? m.replyToMessageId,
                            content: message,
                          }
                        : m,
                    ),
                  );
                }
                return compactDuplicateChatMessages([
                  ...prev,
                  {
                    id,
                    role: "assistant" as const,
                    replyToMessageId: responseInputMessageId,
                    content: message,
                    timestamp: now,
                  },
                ]);
              });
              if (terminal) {
                const finalizingEnvelopeId =
                  activeRunEnvelopeIdRef.current ??
                  lastRunEnvelopeIdRef.current;
                if (finalizingEnvelopeId) {
                  finalizedRunEnvelopeIdsRef.current.add(finalizingEnvelopeId);
                }
                suppressActiveRunTraceRef.current = true;
                pendingFinalTraceTargetRef.current = {
                  id,
                  content: message,
                };
                clearLiveTurnIndicators({
                  preserveRunTraceForFinalMessage: true,
                  broadcastClear: false,
                });
                const traceForFinal =
                  activeRunTraceRef.current ?? lastRunTraceRef.current;
                const envelopeIdForFinal =
                  activeRunEnvelopeIdRef.current ??
                  lastRunEnvelopeIdRef.current;
                setMessages((prev) => {
                  const existing = prev.find((m) => m.id === id);
                  if (!existing) return prev;
                  return compactDuplicateChatMessages(
                    prev.map((m) =>
                      m.id === id
                        ? {
                            ...m,
                            replyToMessageId:
                              responseInputMessageId ?? m.replyToMessageId,
                            runTrace: m.runTrace ?? traceForFinal,
                            runEnvelopeId: m.runEnvelopeId ?? envelopeIdForFinal,
                          }
                        : m,
                    ),
                  );
                });
                pendingFinalTraceTargetRef.current = undefined;
                finishFinalizedLiveTurn();
              }
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
                            persistedId:
                              persistedAssistantId ?? m.persistedId,
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
                            persistedId:
                              persistedAssistantId ?? m.persistedId,
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
                            persistedId:
                              persistedAssistantId ?? m.persistedId,
                            replyToMessageId:
                              replyToMessageId ?? m.replyToMessageId,
                            runTrace: m.runTrace ?? traceForFinal,
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
              if (traceForFinal) {
                pendingFinalTraceTargetRef.current = undefined;
              }
              finishFinalizedLiveTurn();
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
              setMessages((prev) => [
                ...prev,
                {
                  id,
                  role: "assistant" as const,
                  replyToMessageId: inputMessageId,
                  content,
                  timestamp,
                  runTrace: traceForFinal,
                  runEnvelopeId: envelopeIdForFinal,
                },
              ]);
              pendingFinalTraceTargetRef.current = undefined;
              suppressActiveRunTraceRef.current = true;
              clearLiveTurnIndicators({
                preserveRunTraceForFinalMessage: true,
              });
              responseIdRef.current = null;
              finishFinalizedLiveTurn();
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
            void (async () => {
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
              setTypingIfDelivered();
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
            })();
            break;
          }

          case "ToolCallCompleted": {
            const data = streamEvent.data as ToolStreamData;
            void (async () => {
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
            })();
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
      finishFinalizedLiveTurn,
      persistCurrentStreamSnapshot,
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
      if (
        !snapshot ||
        snapshot.status !== "streaming"
      ) {
        return;
      }
      applyStreamSnapshot(snapshot);

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
                replyToMessageId:
                  message.reply_to_message_id ?? undefined,
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
            setMessages((prev) => mergeLoadedMessages(loadedWithEnvelopes, prev));
            setHasMore(page.has_more);
            clearLiveTurnIndicators();
            return;
          }
        } catch (error) {
          console.warn("Failed to check chat history during stream restore", error);
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
        if (event.event === "message_persisted" || event.event === "delivery_receipt") {
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

      void consumeChatStreamWithRetry(
        () => createChatStream(snapshot.request!, restoreController!.signal),
        (response) => consumeSseStream(response, handleStreamEvent),
        restoreController.signal,
      ).catch((error) => {
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
        | { sessionId: string; clear: true }
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
    writePendingAgentId(isTyping && agentId ? agentId : null);
  }, [agentId, isTyping]);

  useEffect(() => {
    writePersistedTools(activeTools);
    activeToolsRef.current = activeTools;
    persistCurrentStreamSnapshot();
  }, [activeTools, persistCurrentStreamSnapshot]);

  useEffect(() => {
    writePersistedLivePreview(livePreview);
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
          !isTerminalRunTrace(activeRunTraceRef.current));
      if (!queueIntoActiveTurn) {
        suppressActiveRunTraceRef.current = false;
      }
      const userMsg: ChatMessage = {
        id: msgId,
        role: "user",
        content: trimmed || `Attached ${artifactIds.length} artifact${artifactIds.length === 1 ? "" : "s"}`,
        command: options?.commandInvocation?.command,
        timestamp: new Date().toISOString(),
        status: queueIntoActiveTurn ? "queued" : "sending",
        artifactIds,
      };
      if (!queueIntoActiveTurn) {
        optimisticUserMessageIdRef.current = msgId;
        awaitingDeliveryRef.current = true;
        setHasActiveChatRequest(true);
      }
      setMessages((prev) => [...prev, userMsg]);

      const failOptimisticMessage = () => {
        if (!queueIntoActiveTurn) {
          optimisticUserMessageIdRef.current = null;
          currentRequestIdRef.current = null;
          awaitingDeliveryRef.current = false;
          setHasActiveChatRequest(false);
          setIsTyping(false);
          pendingFinalTraceTargetRef.current = undefined;
          suppressActiveRunTraceRef.current = true;
          if (activeRunEnvelopeIdRef.current) {
            void markEnvelopeOrphaned(activeRunEnvelopeIdRef.current);
          }
          activeRunTraceRef.current = undefined;
          activeRunEnvelopeIdRef.current = undefined;
          setActiveRunTrace(undefined);
        }
        setMessages((prev) =>
          prev.map((message) =>
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

        if (!queueIntoActiveTurn) {
          // Pre-allocate a response ID so the final response targets the same message
          responsePersistedRef.current = false;
          responseIdRef.current = generateId();
          currentRequestIdRef.current = msgId;
          setHasActiveChatRequest(true);
          setLivePreview(undefined);
          pendingFinalTraceTargetRef.current = undefined;
          suppressActiveRunTraceRef.current = false;
          activeRunTraceRef.current = undefined;
          activeRunEnvelopeIdRef.current = undefined;
          lastRunTraceRef.current = undefined;
          lastRunEnvelopeIdRef.current = undefined;
          setActiveRunTrace(undefined);
          setIsTyping(false);

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
          ...(options?.artifactIds?.length ? { artifact_ids: options.artifactIds } : {}),
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
            status: "streaming",
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

        streamPromise = consumeChatStreamWithRetry(
          () => createChatStream(streamBody, controller.signal),
          (response) => consumeSseStream(response, handleStreamEvent),
          controller.signal,
        );
      } catch (error) {
        console.error("Failed to prepare chat stream:", error);
        failOptimisticMessage();
        toast.error("Failed to prepare this message on the current device.");
        if (activeSessionId && !queueIntoActiveTurn) {
          void clearChatStreamSnapshot(activeSessionId);
          notifyChatStreamSnapshot({
            sessionId: activeSessionId,
            clear: true,
          });
        }
        return;
      }

      void streamPromise
        .then(async () => {
          await streamWorkQueueRef.current.drain();
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
          if (!queueIntoActiveTurn) {
            optimisticUserMessageIdRef.current = null;
            responseIdRef.current = null;
            currentRequestIdRef.current = null;
            setIsTyping(false);
          }
          if (activeSessionId && !queueIntoActiveTurn) {
            void clearChatStreamSnapshot(activeSessionId);
            notifyChatStreamSnapshot({
              sessionId: activeSessionId,
              clear: true,
            });
          }
          const wasCancelled =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.name === "AbortError");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, status: wasCancelled ? "cancelled" : "failed" }
                : m,
            ),
          );
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
            setActiveTools([]);
            setLivePreview(undefined);
            setIsTyping(false);
            setHasActiveChatRequest(false);
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
    ],
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
    const hasCancelableResponse =
      isTyping ||
      hasActiveChatRequest ||
      !!streamAbortRef.current ||
      !!currentRequestIdRef.current ||
      !!responseIdRef.current ||
      Boolean(activeTrace && !isTerminalRunTrace(activeTrace));
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
    setIsTyping(false);

    const finishLocalCancel = () => {
      responseIdRef.current = null;
      currentRequestIdRef.current = null;
      pendingFinalTraceTargetRef.current = undefined;
      if (activeRunEnvelopeIdRef.current) {
        void markEnvelopeOrphaned(activeRunEnvelopeIdRef.current);
      }
      activeRunTraceRef.current = undefined;
      activeRunEnvelopeIdRef.current = undefined;
      setActiveRunTrace(undefined);
      setHasActiveChatRequest(false);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (activeSessionId) {
        void clearChatStreamSnapshot(activeSessionId);
        notifyChatStreamSnapshot({ sessionId: activeSessionId, clear: true });
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

  return {
    messages,
    livePreview,
    activeRunTrace,
    sendMessage,
    deleteMessage,
    clearMessages,
    isTyping,
    hasActiveChatRequest,
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
