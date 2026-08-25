"use client";

import { cn } from "@/lib/cn";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import type {
  AgentDefinition,
  ChatCommand,
  ChatSessionExtended,
  Domain,
  EncryptedPayload,
  VoiceInputJob,
} from "@/lib/types";
import {
  useAgent,
  useAgents,
  useAgentDomains,
  useChatCommands,
  useProjects,
} from "@/lib/hooks";
import {
  allChatSessionsUrl,
  createChatSession,
  createVoiceInputJob,
  fetchVoiceInputJob,
  fetcher,
} from "@/lib/api";
import { useChat } from "@/lib/useChat";
import { decryptContentPayload } from "@/lib/cryptoContent";
import { toast } from "@/lib/toast";
import { useAppAuth } from "@/components/auth/AppAuth";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { DomainSlashCommandDropdown } from "@/components/project/DomainSlashCommandDropdown";
import {
  ArtifactAttachmentComposer,
  ArtifactAttachmentList,
  useArtifactAttachments,
} from "@/components/artifacts/ArtifactAttachmentComposer";
import { SessionArtifactAttachments } from "@/components/artifacts/ChatArtifactAttachments";
import { useChatArtifactSupport } from "@/lib/useChatArtifactSupport";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { MobileInputBar } from "./MobileInputBar";
import { MobileEmptyState } from "./MobileEmptyState";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatComposer } from "./ChatComposer";
import {
  isVoiceInputDisabled,
  livePhaseForChatMessage,
  shouldDisplayChatMessage,
  shouldShowChatHistoryLoader,
  shouldShowChatCancelControl,
  visibleLiveChatRunTrace,
} from "@/lib/chat/derivations";

interface ChatAreaProps {
  projectId: string | null;
  agentId: string;
  targetType?: "agent" | "council";
  sessionId: string | null;
  /** Navigate to a different session (from @mention agent→session picker). */
  onNavigateToSession?: (sessionId: string) => void;
  /** Called after creating a new session via @mention → new chat flow. */
  onSessionCreated?: () => void | Promise<unknown>;
  /** Render variant — "mobile" uses MobileInputBar and MobileEmptyState */
  variant?: "desktop" | "mobile";
  /** Switch to a different agent's general chat (handled at ChatView level). */
  onSwitchAgent?: (agent: AgentDefinition) => void;
}

type ChatProjectOption = {
  id: string | null;
  name: string;
};

type ChatCommandOption = {
  id?: string;
  name?: string;
  path?: string;
  command: string;
  description: string;
  source: "builtin" | "native" | "package";
  sourcePath?: string;
  hooks?: string[];
  updatedAt?: string;
};

type ChatCommandPickerEntry =
  | {
      type: "folder";
      name: string;
      path: string;
      commandCount: number;
    }
  | {
      type: "command";
      command: ChatCommandOption;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NEW_SESSION_COMMAND = "/new-session";
const CHAT_COMMANDS: ChatCommandOption[] = [
  {
    command: NEW_SESSION_COMMAND,
    description: "Create a fresh chat with this agent and project.",
    source: "builtin",
  },
];
const VOICE_INPUT_MAX_BYTES = 320 * 1024;
const VOICE_INPUT_MAX_DURATION_MS = 60_000;
const VOICE_INPUT_POLL_INTERVAL_MS = 800;
const VOICE_INPUT_POLL_TIMEOUT_MS = 45_000;

type VoiceInputState = "idle" | "requesting" | "recording" | "processing";

function voiceInputSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

async function queryMicrophonePermission(): Promise<PermissionState | null> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.permissions?.query !== "function"
  ) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

function voiceInputStartErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone access is blocked. Allow microphone permissions in your browser settings and try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone was found.";
      case "NotReadableError":
      case "TrackStartError":
        return "The microphone is already in use or could not be started.";
      case "SecurityError":
        return "Microphone access requires a secure browser context.";
      default:
        break;
    }
  }

  return "Microphone access is required to record audio.";
}

async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!voiceInputSupported()) {
    throw new Error("Audio recording is unavailable in this browser.");
  }

  const permission = await queryMicrophonePermission();
  if (permission === "denied") {
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

function selectVoiceInputMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;

  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<EncryptedPayload>;
  return (
    typeof payload.account_id === "string" &&
    typeof payload.object_id === "string" &&
    typeof payload.object_type === "string" &&
    typeof payload.algorithm === "string" &&
    typeof payload.key_version === "number" &&
    typeof payload.nonce === "string" &&
    typeof payload.ciphertext === "string"
  );
}

function encryptedVoiceTranscript(job: VoiceInputJob): EncryptedPayload | null {
  const transcript = job.metadata?.encrypted_transcript;
  return isEncryptedPayload(transcript) ? transcript : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function voiceInputErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return "Audio transcription failed.";
  }

  try {
    const parsed = JSON.parse(error.message) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const detail = parsed as Record<string, unknown>;
      if (typeof detail.message === "string") return detail.message;
      if (typeof detail.error === "string") return detail.error;
    }
  } catch {
    // The platform sometimes returns plain text errors.
  }

  return error.message;
}

function metadataText(
  metadata: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = metadata;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function commandSourcePath(command: ChatCommand): string | undefined {
  return (
    metadataText(command.metadata, ["install", "source_path"]) ??
    metadataText(command.metadata, ["package", "module_path"]) ??
    metadataText(command.metadata, ["claude", "command", "source_path"]) ??
    undefined
  );
}

function cleanCommandPath(path?: string): string {
  return (path ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function splitCommandPath(path?: string): string[] {
  const cleaned = cleanCommandPath(path);
  return cleaned ? cleaned.split("/") : [];
}

function commandGroupLabel(command: ChatCommandOption): string {
  if (command.source === "builtin") return "Built in";
  const path = cleanCommandPath(command.path);
  return path || "Root commands";
}

function commandGroupSortRank(command: ChatCommandOption): number {
  if (command.source === "builtin") return 0;
  return cleanCommandPath(command.path) ? 2 : 1;
}

function compareCommandOptions(
  left: ChatCommandOption,
  right: ChatCommandOption,
): number {
  if (left.source === "builtin" && right.source !== "builtin") return -1;
  if (left.source !== "builtin" && right.source === "builtin") return 1;

  const rank = commandGroupSortRank(left) - commandGroupSortRank(right);
  if (rank !== 0) return rank;

  const group = commandGroupLabel(left).localeCompare(commandGroupLabel(right));
  if (group !== 0) return group;
  return left.command.localeCompare(right.command);
}

function commandMatchesFilter(
  command: ChatCommandOption,
  lowerFilter: string,
): boolean {
  if (!lowerFilter) return true;
  const path = cleanCommandPath(command.path);
  return (
    command.command.slice(1).toLowerCase().includes(lowerFilter) ||
    command.description.toLowerCase().includes(lowerFilter) ||
    command.name?.toLowerCase().includes(lowerFilter) ||
    path.toLowerCase().includes(lowerFilter)
  );
}

function commandChildPath(
  commandPath: string,
  currentPath: string,
): { childPath: string; childName: string } | null {
  const commandParts = splitCommandPath(commandPath);
  const currentParts = splitCommandPath(currentPath);
  if (commandParts.length <= currentParts.length) return null;
  for (let index = 0; index < currentParts.length; index += 1) {
    if (commandParts[index] !== currentParts[index]) return null;
  }
  const childParts = commandParts.slice(0, currentParts.length + 1);
  const childPath = childParts.join("/");
  return {
    childPath,
    childName: childParts[childParts.length - 1],
  };
}

function buildCommandPickerEntries(
  commands: ChatCommandOption[],
  currentPath: string,
  filter: string,
): ChatCommandPickerEntry[] {
  const path = cleanCommandPath(currentPath);
  const lowerFilter = filter.toLowerCase();
  const folders = new Map<
    string,
    { name: string; path: string; commandCount: number; matchesFilter: boolean }
  >();
  const commandEntries: ChatCommandPickerEntry[] = [];

  for (const command of commands) {
    const commandPath = cleanCommandPath(command.path);
    if (commandPath === path) {
      if (commandMatchesFilter(command, lowerFilter)) {
        commandEntries.push({ type: "command", command });
      }
      continue;
    }

    const child = commandChildPath(commandPath, path);
    if (!child) continue;

    const existing = folders.get(child.childPath) ?? {
      name: child.childName,
      path: child.childPath,
      commandCount: 0,
      matchesFilter: false,
    };
    existing.commandCount += 1;
    existing.matchesFilter =
      existing.matchesFilter ||
      !lowerFilter ||
      child.childName.toLowerCase().includes(lowerFilter) ||
      child.childPath.toLowerCase().includes(lowerFilter) ||
      commandMatchesFilter(command, lowerFilter);
    folders.set(child.childPath, existing);
  }

  const folderEntries: ChatCommandPickerEntry[] = Array.from(folders.values())
    .filter((folder) => folder.matchesFilter)
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((folder) => ({
      type: "folder" as const,
      name: folder.name,
      path: folder.path,
      commandCount: folder.commandCount,
    }));

  commandEntries.sort((left, right) =>
    left.type === "command" && right.type === "command"
      ? compareCommandOptions(left.command, right.command)
      : 0,
  );

  return [...folderEntries, ...commandEntries];
}

function platformCommandOption(
  commandRecord: ChatCommand,
): ChatCommandOption | null {
  const command = commandRecord.command.trim();
  if (!command.startsWith("/")) return null;
  return {
    id: commandRecord.id,
    name: commandRecord.name,
    path: commandRecord.path,
    command,
    description:
      commandRecord.description ??
      metadataText(commandRecord.metadata, ["source", "package"]) ??
      commandRecord.name,
    source: commandRecord.source_type,
    sourcePath: commandSourcePath(commandRecord),
    hooks: commandRecord.hooks,
    updatedAt: commandRecord.updated_at,
  };
}

function platformCommands(
  commandRecords: ChatCommand[] | undefined,
): ChatCommandOption[] {
  if (!commandRecords?.length) return [];
  const seen = new Set(CHAT_COMMANDS.map((command) => command.command));
  const commands = new Map<string, ChatCommandOption>();
  for (const record of commandRecords) {
    const option = platformCommandOption(record);
    if (!option || seen.has(option.command)) continue;
    const existing = commands.get(option.command);
    if (
      !existing ||
      new Date(option.updatedAt ?? 0).getTime() >
        new Date(existing.updatedAt ?? 0).getTime()
    ) {
      commands.set(option.command, option);
    }
  }
  return Array.from(commands.values()).sort(compareCommandOptions);
}

function matchRuntimeCommand(
  text: string,
  commands: ChatCommandOption[],
): ChatCommandOption | null {
  const trimmed = text.trim();
  const lowerText = trimmed.toLowerCase();
  return (
    commands
      .filter((command) => command.source !== "builtin")
      .sort((left, right) => right.command.length - left.command.length)
      .find((command) => {
        const lowerCommand = command.command.toLowerCase();
        return (
          lowerText === lowerCommand || lowerText.startsWith(`${lowerCommand} `)
        );
      }) ?? null
  );
}

function ChatCommandDropdown({
  entries,
  currentPath,
  selectedIndex,
  onSelect,
  onNavigate,
  onBack,
  onClose,
  anchorRef,
}: {
  entries: ChatCommandPickerEntry[];
  currentPath: string;
  selectedIndex: number;
  onSelect: (command: ChatCommandOption) => void;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    bottom: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(380, Math.max(0, window.innerWidth - 32));
      const left = Math.min(
        Math.max(rect.left, 16),
        Math.max(16, window.innerWidth - width - 16),
      );
      setPosition({
        bottom: Math.max(window.innerHeight - rect.top + 8, 8),
        left,
        width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [anchorRef, onClose]);

  if (entries.length === 0 || !position || typeof document === "undefined") {
    return null;
  }

  const normalizedPath = cleanCommandPath(currentPath);
  const pathParts = splitCommandPath(normalizedPath);

  return createPortal(
    <div
      ref={dropdownRef}
      className="theme-border fixed isolate z-[9999] max-h-72 overflow-y-auto rounded-lg border bg-white shadow-2xl ring-1 ring-black/5 dark:bg-gray-950 dark:ring-white/10"
      style={{
        bottom: position.bottom,
        left: position.left,
        width: position.width,
      }}
    >
      <div className="theme-border flex min-w-0 items-center gap-2 border-b px-3 py-1.5">
        {normalizedPath ? (
          <button
            type="button"
            className="theme-text-muted hover:theme-text flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:[background:var(--app-hover)]"
            onClick={onBack}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Back to parent command group"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 text-xs font-medium text-gray-400 dark:text-gray-500">
          {normalizedPath ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {pathParts.map((part, index) => (
                <span
                  key={`${normalizedPath}:${index}`}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  {index > 0 ? (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  ) : null}
                  <span className="truncate">{part}</span>
                </span>
              ))}
            </div>
          ) : (
            "Available Commands"
          )}
        </div>
      </div>
      {entries.map((entry, index) => {
        if (entry.type === "folder") {
          const selected = index === selectedIndex;
          return (
            <button
              key={`folder:${entry.path}`}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "bg-deep-space-blue-500 text-white"
                  : "text-gray-700 hover:[background:var(--app-hover)] dark:text-gray-300",
              )}
              onClick={() => onNavigate(entry.path)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-sm",
                  selected
                    ? "bg-white/15 text-white"
                    : "theme-surface-muted theme-text-muted",
                )}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{entry.name}</span>
                <span
                  className={cn(
                    "block truncate text-xs",
                    selected
                      ? "text-deep-space-blue-100"
                      : "text-gray-500 dark:text-gray-400",
                  )}
                >
                  Open command group · {entry.commandCount}{" "}
                  {entry.commandCount === 1 ? "command" : "commands"}
                </span>
              </span>
            </button>
          );
        }

        const { command } = entry;
        return (
          <button
            key={`${command.source}:${command.command}`}
            type="button"
            className={cn(
              "flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors",
              index === selectedIndex
                ? "bg-deep-space-blue-500 text-white"
                : "text-gray-700 hover:[background:var(--app-hover)] dark:text-gray-300",
            )}
            onClick={() => onSelect(command)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm text-xs font-medium",
                index === selectedIndex
                  ? "bg-white/15 text-white"
                  : "theme-surface-muted theme-text-muted",
              )}
            >
              /
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-medium">
                  {command.command}
                </span>
                {command.source !== "builtin" ? (
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none",
                      index === selectedIndex
                        ? "border-white/20 text-deep-space-blue-100"
                        : "theme-border theme-text-muted",
                    )}
                  >
                    {command.source}
                  </span>
                ) : null}
              </span>
              {command.path ? (
                <span
                  className={cn(
                    "block truncate text-[11px]",
                    index === selectedIndex
                      ? "text-deep-space-blue-100"
                      : "text-gray-400 dark:text-gray-500",
                  )}
                >
                  {cleanCommandPath(command.path)}
                </span>
              ) : null}
              <span
                className={cn(
                  "block truncate text-xs",
                  index === selectedIndex
                    ? "text-deep-space-blue-100"
                    : "text-gray-500 dark:text-gray-400",
                )}
              >
                {command.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Session picker dropdown (step 2 of @mention navigation)
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function displayProjectName(projectName: string | null | undefined): string {
  return projectName === "No project" ? "General" : (projectName ?? "General");
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChatArea({
  projectId,
  agentId,
  targetType = "agent",
  sessionId,
  onNavigateToSession,
  onSessionCreated,
  variant = "desktop",
  onSwitchAgent,
}: ChatAreaProps) {
  const isMobile = variant === "mobile";
  const reduceMotion = useReducedMotion();
  const isAgentTarget = targetType === "agent";
  const { user } = useAppAuth();
  const userImageUrl = user?.imageUrl;
  const userInitials = user?.firstName?.[0] ?? "U";

  // @mention navigation state: three-step flow
  // Step 1: agent picker, Step 2: session picker, Step 3: project picker (new chat)
  type MentionStep = "agent" | "session" | "project";
  const [mentionStep, setMentionStep] = useState<MentionStep>("agent");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(0);
  const [selectedMentionAgent, setSelectedMentionAgent] =
    useState<AgentDefinition | null>(null);
  const [sessionPickerIndex, setSessionPickerIndex] = useState(0);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedDomainIndex, setSelectedDomainIndex] = useState(0);
  const [pendingDomain, setPendingDomain] = useState<Domain | null>(null);
  const [pendingCommand, setPendingCommand] =
    useState<ChatCommandOption | null>(null);
  const [showCommandDropdown, setShowCommandDropdown] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [commandPickerPath, setCommandPickerPath] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const { agents: allAgents } = useAgents();
  const { agent: activeAgentDetail } = useAgent(
    isAgentTarget ? agentId : undefined,
  );
  const { agentDomains } = useAgentDomains(isAgentTarget ? agentId : undefined);
  const { projects } = useProjects();
  const { commands: platformCommandRecords } = useChatCommands();
  const chatCommands = useMemo(
    () => [...CHAT_COMMANDS, ...platformCommands(platformCommandRecords)],
    [platformCommandRecords],
  );
  useEffect(() => {
    if (!pendingCommand) return;
    if (
      chatCommands.some((command) => command.command === pendingCommand.command)
    )
      return;
    setPendingCommand(null);
  }, [chatCommands, pendingCommand]);

  // Projectless "General" chats run in the worker's root workspace.
  const userProjects = useMemo<ChatProjectOption[]>(() => {
    const list: ChatProjectOption[] = [{ id: null, name: "General" }];
    if (projects) {
      list.push(
        ...projects.map((project) => ({ id: project.id, name: project.name })),
      );
    }
    return list;
  }, [projects]);

  // All sessions (for the session picker after @mention agent selection)
  const { data: allSessions, mutate: mutateSessions } = useSWR<
    ChatSessionExtended[]
  >(
    selectedMentionAgent
      ? allChatSessionsUrl(isMobile ? 50 : 200, 0, "chat")
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  const availableAgents = useMemo(
    () => allAgents?.filter((a: AgentDefinition) => a.model_id) ?? [],
    [allAgents],
  );

  const filteredAgents = useMemo(() => {
    if (!mentionFilter) return availableAgents;
    const lower = mentionFilter.toLowerCase();
    return availableAgents.filter((a: AgentDefinition) =>
      a.name.toLowerCase().includes(lower),
    );
  }, [availableAgents, mentionFilter]);

  // Sessions for the selected @mention agent, sorted by most recent
  const mentionAgentSessions = useMemo(() => {
    if (!selectedMentionAgent || !allSessions) return [];
    return allSessions.filter((s) => s.agent_id === selectedMentionAgent.id);
  }, [selectedMentionAgent, allSessions]);

  const activeAgent = useMemo(
    () =>
      activeAgentDetail ??
      (isAgentTarget
        ? allAgents?.find((a: AgentDefinition) => a.id === agentId)
        : undefined),
    [activeAgentDetail, allAgents, agentId, isAgentTarget],
  );

  useEffect(() => {
    setSelectedDropdownIndex(0);
  }, [filteredAgents]);

  const {
    messages,
    sendMessage,
    retryMessage,
    deleteMessage,
    isTyping,
    hasActiveChatRequest,
    lifecycle,
    activeRunTrace,
    isLoadingHistory,
    hasMore,
    isLoadingMore,
    loadMore,
    activeDomainSession,
    isDomainPending,
    enterDomain,
    exitDomain,
    cancelResponse,
  } = useChat(projectId, agentId, sessionId ?? undefined, targetType);
  const artifactAttachments = useArtifactAttachments();
  const artifactSupport = useChatArtifactSupport(
    isAgentTarget ? activeAgent : undefined,
  );
  const attachmentDisabled =
    isDomainPending || artifactSupport.isLoading || !artifactSupport.canAttach;
  const attachmentDisabledReason = isDomainPending
    ? "Wait for the domain to finish activating before attaching a file"
    : artifactSupport.isLoading
      ? "Checking the agent's file analysis capabilities"
      : "Assign an Analyze document or Analyze image model capability to this agent";
  const visibleRunTrace = visibleLiveChatRunTrace(activeRunTrace);
  const hasActiveRunTrace = Boolean(visibleRunTrace);
  const hasActiveTurn = shouldShowChatCancelControl({
    isTyping: isTyping || hasActiveChatRequest,
    activeRunTrace,
  });
  const displayMessages = useMemo(
    () =>
      messages.filter((message) =>
        shouldDisplayChatMessage(message, lifecycle),
      ),
    [lifecycle, messages],
  );

  // Domains
  const agentDomainsList: Domain[] = useMemo(
    () =>
      (agentDomains ?? [])
        .filter((rm) => rm.enabled && rm.domain)
        .map((rm) => rm.domain!),
    [agentDomains],
  );
  // Only show domains assigned to the current agent
  const availableDomains: Domain[] = useMemo(
    () => (isAgentTarget ? agentDomainsList : []),
    [agentDomainsList, isAgentTarget],
  );

  const filteredDomains: Domain[] = useMemo(() => {
    if (!showDomainDropdown) return [];
    const lower = domainFilter.toLowerCase();
    return availableDomains.filter(
      (m) =>
        m.command.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower),
    );
  }, [showDomainDropdown, domainFilter, availableDomains]);

  useEffect(() => {
    setSelectedDomainIndex(0);
  }, [filteredDomains]);

  const filteredCommandEntries = useMemo(() => {
    if (!showCommandDropdown) return [];
    return buildCommandPickerEntries(
      chatCommands,
      commandPickerPath,
      commandFilter,
    );
  }, [showCommandDropdown, commandFilter, commandPickerPath, chatCommands]);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommandEntries]);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceInputTimerRef = useRef<number | null>(null);
  const pendingSessionScrollRef = useRef(false);
  const [voiceInputState, setVoiceInputState] =
    useState<VoiceInputState>("idle");
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  // Track message count for animation stagger logic
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    pendingSessionScrollRef.current = true;
    setShowScrollToLatest(false);
  }, [sessionId]);

  // Auto-focus input on mount
  useEffect(() => {
    if (isMobile) return;
    // Small delay to let the DOM settle after route transition
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [isMobile]);

  useEffect(() => {
    setVoiceInputAvailable(voiceInputSupported());
  }, []);

  const clearVoiceInputTimer = useCallback(() => {
    if (voiceInputTimerRef.current !== null) {
      window.clearTimeout(voiceInputTimerRef.current);
      voiceInputTimerRef.current = null;
    }
  }, []);

  const stopVoiceInputTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearVoiceInputTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }
      stopVoiceInputTracks();
    };
  }, [clearVoiceInputTimer, stopVoiceInputTracks]);

  const pollVoiceInputJob = useCallback(
    async (initialJob: VoiceInputJob): Promise<VoiceInputJob> => {
      let job = initialJob;
      const startedAt = Date.now();

      while (Date.now() - startedAt <= VOICE_INPUT_POLL_TIMEOUT_MS) {
        if (job.status === "transcribed" || job.status === "completed") {
          return job;
        }

        if (
          job.status === "failed" ||
          job.status === "expired" ||
          job.status === "cancelled"
        ) {
          throw new Error(job.error_message || "Audio transcription failed.");
        }

        await wait(VOICE_INPUT_POLL_INTERVAL_MS);
        job = await fetchVoiceInputJob(job.id);
      }

      throw new Error("Audio transcription timed out.");
    },
    [],
  );

  const handleVoiceInputBlob = useCallback(
    async (audio: Blob) => {
      if (!sessionId || !isAgentTarget) {
        toast.error("Start an agent chat before recording audio.");
        setVoiceInputState("idle");
        return;
      }

      if (audio.size <= 0) {
        toast.error("No audio was recorded.");
        setVoiceInputState("idle");
        return;
      }

      if (audio.size > VOICE_INPUT_MAX_BYTES) {
        toast.error("Recording is too long. Try a shorter prompt.");
        setVoiceInputState("idle");
        return;
      }

      setVoiceInputState("processing");
      try {
        const uploaded = await createVoiceInputJob({
          audio,
          session_id: sessionId,
          agent_id: agentId,
          project_id: projectId,
        });
        const completed = await pollVoiceInputJob(uploaded);
        const encryptedTranscript = encryptedVoiceTranscript(completed);
        if (!encryptedTranscript) {
          throw new Error("Transcription finished without a transcript.");
        }

        const transcript = (
          await decryptContentPayload(encryptedTranscript)
        )?.trim();
        if (!transcript) {
          throw new Error("Transcription was empty.");
        }

        await sendMessage(transcript);
      } catch (error) {
        console.error("Voice input failed", error);
        toast.error(voiceInputErrorMessage(error));
      } finally {
        setVoiceInputState("idle");
      }
    },
    [
      agentId,
      isAgentTarget,
      pollVoiceInputJob,
      projectId,
      sendMessage,
      sessionId,
    ],
  );

  const voiceInputDisabled = isVoiceInputDisabled({
    voiceInputAvailable,
    hasSession: Boolean(sessionId),
    isAgentTarget,
    isDomainPending,
    hasActiveTurn,
    hasPendingCommand: Boolean(pendingCommand),
    hasPendingDomain: Boolean(pendingDomain),
  });

  const voiceInputControlDisabled =
    voiceInputState === "recording"
      ? false
      : voiceInputDisabled || voiceInputState !== "idle";

  const voiceInputTitle =
    voiceInputState === "recording"
      ? "Stop recording"
      : voiceInputState === "requesting"
        ? "Preparing microphone"
        : voiceInputState === "processing"
          ? "Transcribing audio"
          : !voiceInputAvailable
            ? "Audio recording is unavailable in this browser"
            : "Record audio";

  const startVoiceRecording = useCallback(async () => {
    if (voiceInputState !== "idle") return;

    if (voiceInputDisabled) {
      toast.error(
        voiceInputAvailable
          ? "Audio can be recorded after the current chat action finishes."
          : "Audio recording is unavailable in this browser.",
      );
      return;
    }

    setVoiceInputState("requesting");
    try {
      const stream = await requestMicrophoneStream();
      setVoiceInputAvailable(true);
      const mimeType = selectVoiceInputMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, audioBitsPerSecond: 24_000 }
          : { audioBitsPerSecond: 24_000 },
      );

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearVoiceInputTimer();
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopVoiceInputTracks();

        const audio = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        void handleVoiceInputBlob(audio);
      };

      recorder.addEventListener("error", (event) => {
        console.error("Voice recorder error", event);
        clearVoiceInputTimer();
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      });

      recorder.start();
      setVoiceInputState("recording");
      voiceInputTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          toast.info("Recording stopped at 60 seconds.");
          mediaRecorderRef.current.stop();
        }
      }, VOICE_INPUT_MAX_DURATION_MS);
    } catch (error) {
      console.error("Failed to start voice recording", error);
      clearVoiceInputTimer();
      stopVoiceInputTracks();
      mediaRecorderRef.current = null;
      setVoiceInputState("idle");
      toast.error(voiceInputStartErrorMessage(error));
    }
  }, [
    clearVoiceInputTimer,
    handleVoiceInputBlob,
    stopVoiceInputTracks,
    voiceInputAvailable,
    voiceInputDisabled,
    voiceInputState,
  ]);

  const stopVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearVoiceInputTimer();
    recorder.stop();
  }, [clearVoiceInputTimer]);

  const handleVoiceInputPress = useCallback(() => {
    if (voiceInputState === "recording") {
      stopVoiceRecording();
      return;
    }
    void startVoiceRecording();
  }, [startVoiceRecording, stopVoiceRecording, voiceInputState]);

  // Desktop hold-to-cancel
  const [holdProgress, setHoldProgress] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCancelHoldStart = useCallback(() => {
    setHoldProgress(true);
    holdTimerRef.current = setTimeout(() => {
      cancelResponse();
      setHoldProgress(false);
      holdTimerRef.current = null;
    }, 1000);
  }, [cancelResponse]);

  const handleCancelHoldEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(false);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  // Double-tap Escape to cancel
  const lastEscRef = useRef(0);
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !hasActiveTurn) return;
      const now = Date.now();
      if (now - lastEscRef.current < 500) {
        cancelResponse();
        lastEscRef.current = 0;
      } else {
        lastEscRef.current = now;
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [hasActiveTurn, cancelResponse]);

  // Auto-scroll
  const skipAutoScrollRef = useRef(false);
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (scrollRef.current) {
      const el = scrollRef.current;
      const behavior: ScrollBehavior =
        reduceMotion || !hasActiveTurn ? "auto" : "smooth";
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
      setShowScrollToLatest(false);
    }
  }, [
    messages,
    isTyping,
    visibleRunTrace,
    hasActiveRunTrace,
    hasActiveTurn,
    reduceMotion,
  ]);

  useEffect(() => {
    if (
      !pendingSessionScrollRef.current ||
      isLoadingHistory ||
      !scrollRef.current
    )
      return;

    const timeoutId = window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
      pendingSessionScrollRef.current = false;
      setShowScrollToLatest(false);
    }, 60);

    return () => window.clearTimeout(timeoutId);
  }, [isLoadingHistory, messages.length, reduceMotion]);

  // Scroll-to-top pagination
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollToLatest(distanceFromBottom > 160);
    if (!hasMore || isLoadingMore) return;
    if (el.scrollTop < 80) {
      const prevHeight = el.scrollHeight;
      skipAutoScrollRef.current = true;
      loadMore().then(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop =
              scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [hasMore, isLoadingMore, loadMore]);

  const scrollToLatest = useCallback(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setShowScrollToLatest(false);
  }, [reduceMotion]);

  // Close @mention flow entirely and clear any leftover @text from input
  const closeMentionFlow = useCallback(() => {
    setShowAgentDropdown(false);
    setSelectedMentionAgent(null);
    setMentionFilter("");
    setMentionStep("agent");
    setSessionPickerIndex(0);
    setSelectedDropdownIndex(0);
    setInput((prev) => {
      // Remove @mention text if still present
      const atIdx = prev.lastIndexOf("@");
      if (atIdx !== -1) {
        return prev.slice(0, atIdx).trimEnd();
      }
      return prev;
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;

    // If user types while session/project picker is open, close it
    if (selectedMentionAgent) {
      closeMentionFlow();
    }

    if (value.startsWith("/") && !pendingCommand) {
      const commandText = value.slice(1);
      if (!/\s/.test(commandText)) {
        if (!showCommandDropdown) {
          setCommandPickerPath("");
        }
        setShowCommandDropdown(true);
        setCommandFilter(commandText);
        setSelectedCommandIndex(0);
        setShowAgentDropdown(false);
        setMentionFilter("");
        setShowDomainDropdown(false);
        setDomainFilter("");
        return;
      }
    }

    setShowCommandDropdown(false);
    setCommandFilter("");
    setCommandPickerPath("");

    const cursorPos = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if (!/\s/.test(textAfterAt)) {
        setShowAgentDropdown(true);
        setMentionFilter(textAfterAt);
        return;
      }
    }

    setShowAgentDropdown(false);
    setMentionFilter("");

    if (value.startsWith("#") && activeDomainSession && !pendingCommand) {
      const domainText = value.slice(1);
      if (!/\s/.test(domainText)) {
        setShowDomainDropdown(true);
        setDomainFilter(domainText);
        setSelectedDomainIndex(0);
        return;
      }
    }

    if (
      value.startsWith("#") &&
      !activeDomainSession &&
      !pendingDomain &&
      !pendingCommand
    ) {
      const domainText = value.slice(1);
      if (!/\s/.test(domainText)) {
        setShowDomainDropdown(true);
        setDomainFilter(domainText);
        setSelectedDomainIndex(0);
        return;
      }
    }

    setShowDomainDropdown(false);
    setDomainFilter("");
  };

  const handleDomainSelect = useCallback((domain: Domain) => {
    setPendingDomain(domain);
    setPendingCommand(null);
    setInput("");
    setShowDomainDropdown(false);
    setDomainFilter("");
    setShowCommandDropdown(false);
    setCommandFilter("");
    setCommandPickerPath("");
    inputRef.current?.focus();
  }, []);

  // Step 1: user selects an agent from @mention dropdown → always show session picker
  const handleAgentSelect = useCallback((agent: AgentDefinition) => {
    setShowAgentDropdown(false);
    setMentionFilter("");

    // Move to step 2: show session picker for this agent
    // Don't clear input here — it causes onChange which resets the mention state.
    // Input gets cleared when the flow completes or user types.
    setSelectedMentionAgent(agent);
    setMentionStep("session");
    setSessionPickerIndex(0);
  }, []);

  // Step 2: user selects a session from the session picker → navigate
  const handleSessionSelect = useCallback(
    (session: ChatSessionExtended) => {
      closeMentionFlow();
      onNavigateToSession?.(session.id);
    },
    [closeMentionFlow, onNavigateToSession],
  );

  // Step 2 → Step 3: user picks "+ New chat" → show project picker
  const handleNewChatFromMention = useCallback(() => {
    setMentionStep("project");
    setSessionPickerIndex(0);
  }, []);

  // Step 3: user selects a project → create session and navigate
  const handleProjectSelect = useCallback(
    async (project: ChatProjectOption) => {
      if (!selectedMentionAgent || isCreatingChat) return;
      setIsCreatingChat(true);
      try {
        // Count existing sessions for auto-naming
        const existingCount = mentionAgentSessions.filter(
          (s) => s.project_id === project.id,
        ).length;
        const agentName = selectedMentionAgent.name;
        const title = `${agentName.charAt(0).toUpperCase() + agentName.slice(1)} #${existingCount + 1}`;

        const newSession = await createChatSession({
          ...(project.id ? { project_id: project.id } : {}),
          agent_id: selectedMentionAgent.id,
          title,
        });

        closeMentionFlow();
        await mutateSessions();
        await onSessionCreated?.();
        onNavigateToSession?.(newSession.id);
      } catch (err) {
        console.error("Failed to create chat:", err);
      } finally {
        setIsCreatingChat(false);
      }
    },
    [
      selectedMentionAgent,
      isCreatingChat,
      mentionAgentSessions,
      closeMentionFlow,
      mutateSessions,
      onSessionCreated,
      onNavigateToSession,
    ],
  );

  const resetInputHeight = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, []);

  const handleNewSessionCommand = useCallback(async () => {
    if (isCreatingChat) return;
    setIsCreatingChat(true);
    try {
      const newSession = await createChatSession({
        ...(projectId ? { project_id: projectId } : {}),
        agent_id: agentId,
      });

      await mutateSessions();
      await onSessionCreated?.();
      onNavigateToSession?.(newSession.id);
    } catch (err) {
      console.error("Failed to create new chat session:", err);
    } finally {
      setIsCreatingChat(false);
    }
  }, [
    agentId,
    isCreatingChat,
    mutateSessions,
    onNavigateToSession,
    onSessionCreated,
    projectId,
  ]);

  const handleCommandSelect = useCallback(
    async (command: ChatCommandOption) => {
      setInput("");
      resetInputHeight();
      setShowCommandDropdown(false);
      setCommandFilter("");
      setCommandPickerPath("");
      setShowDomainDropdown(false);
      setDomainFilter("");

      if (command.command === NEW_SESSION_COMMAND) {
        setPendingCommand(null);
        setPendingDomain(null);
        await handleNewSessionCommand();
        return;
      }

      if (command.source !== "builtin") {
        setPendingCommand(command);
        setPendingDomain(null);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
        return;
      }

      setPendingCommand(null);
      setPendingDomain(null);
      setInput(`${command.command} `);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.value.length;
          inputRef.current.selectionEnd = inputRef.current.value.length;
          inputRef.current.style.height = "auto";
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
        }
      });
    },
    [handleNewSessionCommand, resetInputHeight],
  );

  const handleCommandGroupNavigate = useCallback((path: string) => {
    setCommandPickerPath(cleanCommandPath(path));
    setCommandFilter("");
    setSelectedCommandIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleCommandGroupBack = useCallback(() => {
    setCommandPickerPath((current) => {
      const parts = splitCommandPath(current);
      parts.pop();
      return parts.join("/");
    });
    setCommandFilter("");
    setSelectedCommandIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (
      !text &&
      !pendingCommand &&
      artifactAttachments.artifactIds.length === 0
    )
      return;
    if (!artifactAttachments.isReady) return;
    if (artifactAttachments.artifactIds.length > 0 && attachmentDisabled)
      return;

    // Close any open mention flow
    closeMentionFlow();

    if (text.toLowerCase() === NEW_SESSION_COMMAND) {
      setInput("");
      resetInputHeight();
      setShowCommandDropdown(false);
      setCommandFilter("");
      setCommandPickerPath("");
      setShowDomainDropdown(false);
      setDomainFilter("");
      await handleNewSessionCommand();
      return;
    }

    if (activeDomainSession) {
      const exitCommands = ["#exit", "#done", "#finish"];
      if (exitCommands.includes(text.toLowerCase())) {
        setInput("");
        resetInputHeight();
        exitDomain();
        return;
      }
    }

    if (pendingDomain && !activeDomainSession) {
      setInput("");
      resetInputHeight();
      enterDomain(
        pendingDomain.id,
        pendingDomain.command,
        agentId,
        text,
        artifactAttachments.artifactIds,
      );
      artifactAttachments.clear();
      setPendingDomain(null);
      return;
    }

    if (pendingCommand) {
      const commandText = `${pendingCommand.command} ${text}`.trim();
      sendMessage(commandText, {
        commandInvocation: {
          command: pendingCommand.command,
        },
        artifactIds: artifactAttachments.artifactIds,
      });
      artifactAttachments.clear();
      setPendingCommand(null);
      setInput("");
      resetInputHeight();
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
      return;
    }

    if (
      text.startsWith("#") &&
      !activeDomainSession &&
      availableDomains.length > 0
    ) {
      const matchedDomain = [...availableDomains]
        .sort((a, b) => b.command.length - a.command.length)
        .find((m) => {
          const command = m.command.toLowerCase();
          const lowerText = text.toLowerCase();
          return lowerText === command || lowerText.startsWith(`${command} `);
        });
      if (matchedDomain) {
        const userMessage = text.slice(matchedDomain.command.length).trim();
        if (!userMessage) {
          return;
        }
        setInput("");
        resetInputHeight();
        enterDomain(
          matchedDomain.id,
          matchedDomain.command,
          agentId,
          userMessage,
          artifactAttachments.artifactIds,
        );
        artifactAttachments.clear();
        return;
      }
    }

    const runtimeCommand = matchRuntimeCommand(text, chatCommands);
    if (runtimeCommand) {
      sendMessage(text, {
        commandInvocation: {
          command: runtimeCommand.command,
        },
        artifactIds: artifactAttachments.artifactIds,
      });
    } else {
      sendMessage(text, { artifactIds: artifactAttachments.artifactIds });
    }
    artifactAttachments.clear();
    setInput("");
    resetInputHeight();
    // On mobile, force scroll to bottom after send to prevent layout shift
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      pendingCommand &&
      !input.trim() &&
      (e.key === "Backspace" || e.key === "Escape")
    ) {
      e.preventDefault();
      setPendingCommand(null);
      return;
    }

    if (
      pendingDomain &&
      !input.trim() &&
      (e.key === "Backspace" || e.key === "Escape")
    ) {
      e.preventDefault();
      setPendingDomain(null);
      return;
    }

    // Local slash command keyboard nav
    if (showCommandDropdown && filteredCommandEntries.length > 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandDropdown(false);
        setCommandFilter("");
        setCommandPickerPath("");
        return;
      }
      if (
        e.key === "Backspace" &&
        commandPickerPath &&
        commandFilter.length === 0
      ) {
        e.preventDefault();
        handleCommandGroupBack();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommandEntries.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommandEntries.length - 1,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const entry = filteredCommandEntries[selectedCommandIndex];
        if (entry?.type === "folder") {
          handleCommandGroupNavigate(entry.path);
        } else if (entry?.type === "command") {
          void handleCommandSelect(entry.command);
        }
        return;
      }
    }

    // Domain dropdown keyboard nav
    if (showDomainDropdown && activeDomainSession) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDomainDropdown(false);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        setInput("");
        resetInputHeight();
        setShowDomainDropdown(false);
        exitDomain();
        return;
      }
    }

    // Domain dropdown keyboard nav
    if (
      showDomainDropdown &&
      filteredDomains.length > 0 &&
      !activeDomainSession
    ) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDomainDropdown(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedDomainIndex((prev) =>
          prev < filteredDomains.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedDomainIndex((prev) =>
          prev > 0 ? prev - 1 : filteredDomains.length - 1,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        handleDomainSelect(filteredDomains[selectedDomainIndex]);
        return;
      }
    }

    // Step 3: Project picker keyboard nav
    if (selectedMentionAgent && mentionStep === "project") {
      const totalItems = userProjects.length;
      if (totalItems > 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionStep("session");
          setSessionPickerIndex(0);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSessionPickerIndex((prev) =>
            prev < totalItems - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSessionPickerIndex((prev) =>
            prev > 0 ? prev - 1 : totalItems - 1,
          );
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          handleProjectSelect(userProjects[sessionPickerIndex]);
          return;
        }
      } else {
        if (e.key === "Escape") {
          e.preventDefault();
          closeMentionFlow();
          return;
        }
      }
    }

    // Step 2: Session picker keyboard nav (index 0 = "+ New chat", rest = sessions)
    if (selectedMentionAgent && mentionStep === "session") {
      const totalItems = mentionAgentSessions.length + 1; // +1 for "New chat"
      if (e.key === "Escape") {
        e.preventDefault();
        closeMentionFlow();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSessionPickerIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSessionPickerIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        if (sessionPickerIndex === 0) {
          handleNewChatFromMention();
        } else {
          handleSessionSelect(mentionAgentSessions[sessionPickerIndex - 1]);
        }
        return;
      }
    }

    // Step 1: Agent dropdown keyboard nav
    if (showAgentDropdown && !selectedMentionAgent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMentionFlow();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedDropdownIndex((prev) =>
          prev < filteredAgents.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedDropdownIndex((prev) =>
          prev > 0 ? prev - 1 : filteredAgents.length - 1,
        );
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && filteredAgents.length > 0) {
        e.preventDefault();
        handleAgentSelect(filteredAgents[selectedDropdownIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder = activeAgent
    ? isMobile
      ? "What's next?"
      : `Message ${activeAgent.name}…`
    : "What's next?";

  // Mobile: handle agent switch — delegates to ChatView-level handler
  const handleSwitchAgent = useCallback(
    (agent: AgentDefinition) => {
      onSwitchAgent?.(agent);
    },
    [onSwitchAgent],
  );

  // Mobile: handle enter domain via MobileEmptyState
  const handleEnterDomainFromChip = useCallback((domain: Domain) => {
    setPendingDomain(domain);
    setPendingCommand(null);
    setInput("");
    setShowCommandDropdown(false);
    setCommandFilter("");
    setCommandPickerPath("");
    inputRef.current?.focus();
  }, []);

  const messageContent = useMemo(() => {
    if (shouldShowChatHistoryLoader(isLoadingHistory, displayMessages.length)) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-1.5 font-mono text-xs text-gray-400">
            <span className="tracking-wider">loading</span>
            <span className="animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">
              &#9612;
            </span>
          </div>
        </div>
      );
    }

    if (displayMessages.length === 0 && isMobile) {
      return (
        <MobileEmptyState
          agentId={agentId}
          activeAgent={activeAgent}
          onSwitchAgent={handleSwitchAgent}
          onEnterDomain={handleEnterDomainFromChip}
        />
      );
    }

    if (displayMessages.length === 0) {
      return <ChatEmptyState agentName={activeAgent?.name} />;
    }

    if (isMobile) {
      return (
        <>
          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <span className="text-xs text-gray-400">
                Loading older messages...
              </span>
            </div>
          )}
          {displayMessages.map((msg) => (
            <div key={msg.id} className="chat-message-item">
              <ChatMessageBubble
                message={msg}
                activeAgent={msg.role === "assistant" ? activeAgent : undefined}
                userImageUrl={userImageUrl}
                userInitials={userInitials}
                onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
                onRetry={msg.retryable ? retryMessage : undefined}
                compact
                livePhase={livePhaseForChatMessage(msg, lifecycle)}
              />
            </div>
          ))}
        </>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-6">
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-gray-400">
              Loading older messages...
            </span>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {displayMessages.map((msg, i) => {
            const isBulkLoad =
              prevMessageCountRef.current === 0 ||
              (displayMessages.length > 2 && i < displayMessages.length - 2);
            const shouldAnimateEntry = !reduceMotion && !isBulkLoad;
            return (
              <motion.div
                key={msg.id}
                className="chat-message-item"
                initial={shouldAnimateEntry ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{
                  duration: shouldAnimateEntry ? 0.16 : 0,
                  ease: "easeOut",
                }}
              >
                <ChatMessageBubble
                  message={msg}
                  activeAgent={
                    msg.role === "assistant" ? activeAgent : undefined
                  }
                  userImageUrl={userImageUrl}
                  userInitials={userInitials}
                  onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
                  onRetry={msg.retryable ? retryMessage : undefined}
                  compact={false}
                  livePhase={livePhaseForChatMessage(msg, lifecycle)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  }, [
    isLoadingHistory,
    displayMessages,
    isMobile,
    agentId,
    activeAgent,
    handleSwitchAgent,
    handleEnterDomainFromChip,
    isLoadingMore,
    userImageUrl,
    userInitials,
    deleteMessage,
    retryMessage,
    reduceMotion,
    lifecycle,
  ]);

  const agentColor = activeAgent?.color;
  const inDomain = !!activeDomainSession && !!agentColor;

  // Track domain border animation phase: null → "enter" → "idle" → "exit" → null
  const [borderPhase, setBorderPhase] = useState<
    "enter" | "idle" | "exit" | null
  >(null);
  const prevInDomainRef = useRef(false);

  useEffect(() => {
    if (inDomain && !prevInDomainRef.current) {
      // Enter — the enter + idle animations are chained in CSS, no phase swap needed
      setBorderPhase("enter");
      if (!isMobile) {
        // Desktop keeps focus inside the composer after domain transitions.
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    if (!inDomain && prevInDomainRef.current) {
      setBorderPhase("exit");
      if (!isMobile) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      const timer = setTimeout(() => setBorderPhase(null), 1250);
      return () => clearTimeout(timer);
    }
    prevInDomainRef.current = inDomain;
  }, [inDomain, isMobile]);

  useEffect(() => {
    prevInDomainRef.current = inDomain;
  });

  // Delayed flag for domain banner — appears after border entry settles, exits timed with border exit
  const [showDomainBanner, setShowDomainBanner] = useState(false);
  useEffect(() => {
    if (inDomain) {
      const timer = setTimeout(() => setShowDomainBanner(true), 1750);
      return () => clearTimeout(timer);
    }
    // Delay banner exit to start partway through the border exit animation (2.25s total)
    const timer = setTimeout(() => setShowDomainBanner(false), 1500);
    return () => clearTimeout(timer);
  }, [inDomain]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Conic-gradient border with animated position — entry, idle pulse at top, exit (desktop only) */}
      {!isMobile && borderPhase && agentColor && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-lg"
          style={{
            padding: "2px",
            background: `conic-gradient(from var(--border-angle, 45deg), transparent 30%, ${agentColor}60 45%, ${agentColor} 50%, ${agentColor}60 55%, transparent 70%)`,
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            animation:
              borderPhase === "enter"
                ? "domain-border-enter 2.25s ease-in-out forwards"
                : borderPhase === "exit"
                  ? "domain-border-exit 1s ease-in forwards"
                  : "domain-border-idle 6s linear infinite",
          }}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain",
          isMobile ? "px-4 pt-1" : "px-5 py-6 lg:px-8",
        )}
        style={
          isMobile
            ? {
                paddingBottom:
                  "calc(var(--mobile-composer-dock-height, 132px) + env(safe-area-inset-bottom, 0px) + 0.5rem)",
              }
            : undefined
        }
      >
        {messageContent}
      </div>

      <AnimatePresence>
        {showScrollToLatest ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{
              duration: reduceMotion ? 0 : 0.18,
              ease: "easeOut",
            }}
            onClick={scrollToLatest}
            className={cn(
              "right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#f5f7fb]/90 text-gray-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#05070b]/90 dark:text-gray-100",
              isMobile
                ? "fixed bottom-[calc(var(--mobile-composer-dock-height,132px)+env(safe-area-inset-bottom,0px)+0.35rem)]"
                : "absolute bottom-4",
            )}
            title="Jump to latest"
            aria-label="Jump to latest message"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 10.5 12 15l4.5-4.5"
              />
            </svg>
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Mobile input bar */}
      {isMobile && (
        <div className="pointer-events-none relative z-[90] shrink-0">
          {/* Dropdowns render above the mobile input */}
          {showCommandDropdown && filteredCommandEntries.length > 0 && (
            <div className="pointer-events-auto absolute bottom-full left-0 right-0 z-[120] px-4 pb-2">
              <ChatCommandDropdown
                entries={filteredCommandEntries}
                currentPath={commandPickerPath}
                selectedIndex={selectedCommandIndex}
                onSelect={(command) => {
                  void handleCommandSelect(command);
                }}
                onNavigate={handleCommandGroupNavigate}
                onBack={handleCommandGroupBack}
                onClose={() => {
                  setShowCommandDropdown(false);
                  setCommandFilter("");
                  setCommandPickerPath("");
                }}
                anchorRef={inputRef}
              />
            </div>
          )}
          {showDomainDropdown &&
            (filteredDomains.length > 0 || activeDomainSession) && (
              <div className="pointer-events-auto absolute bottom-full left-0 right-0 z-50 px-4 pb-2">
                <DomainSlashCommandDropdown
                  domains={filteredDomains}
                  selectedIndex={selectedDomainIndex}
                  onSelect={handleDomainSelect}
                  onClose={() => setShowDomainDropdown(false)}
                  anchorRef={inputRef}
                  accentColor={agentColor}
                  exitMode={!!activeDomainSession}
                  onExitDomain={() => {
                    setInput("");
                    resetInputHeight();
                    setShowDomainDropdown(false);
                    exitDomain();
                  }}
                />
              </div>
            )}
          {showAgentDropdown &&
            !selectedMentionAgent &&
            filteredAgents.length > 0 && (
              <div className="pointer-events-auto absolute bottom-full left-0 right-0 z-[100] px-4 pb-2">
                <div
                  ref={dropdownRef}
                  className="theme-border w-full max-h-48 overflow-y-auto rounded-[1.35rem] border bg-white shadow-[0_20px_50px_rgba(15,23,42,0.24)] dark:bg-gray-900"
                >
                  {filteredAgents.map(
                    (agent: AgentDefinition, index: number) => (
                      <button
                        key={agent.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAgentSelect(agent);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                          index === selectedDropdownIndex
                            ? "theme-surface-muted"
                            : "hover:[background:var(--app-hover)]",
                        )}
                      >
                        <RoleIdenticon
                          roleId={agent.id}
                          color={agent.color}
                          size={20}
                          className="shrink-0"
                          name={agent.name}
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          @{agent.name}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          {selectedMentionAgent && (
            <div className="pointer-events-auto absolute bottom-full left-0 right-0 z-[100] px-4 pb-2">
              <div
                ref={dropdownRef}
                className="theme-border w-full max-h-72 overflow-y-auto rounded-[1.35rem] border bg-white shadow-[0_20px_50px_rgba(15,23,42,0.24)] dark:bg-gray-900"
              >
                <div className="theme-border sticky top-0 flex items-center gap-2 border-b bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <RoleIdenticon
                    roleId={selectedMentionAgent.id}
                    color={selectedMentionAgent.color}
                    size={18}
                    className="shrink-0"
                    name={selectedMentionAgent.name}
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    @{selectedMentionAgent.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    —{" "}
                    {mentionStep === "project"
                      ? "pick a project"
                      : "pick a session"}
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (mentionStep === "project") {
                        setMentionStep("session");
                        setSessionPickerIndex(0);
                      } else {
                        closeMentionFlow();
                      }
                    }}
                    className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      {mentionStep === "project" ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 19.5L8.25 12l7.5-7.5"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      )}
                    </svg>
                  </button>
                </div>
                {mentionStep === "session" ? (
                  <>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleNewChatFromMention();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                        sessionPickerIndex === 0
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:[background:var(--app-hover)]",
                      )}
                    >
                      <svg
                        className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        New chat
                      </span>
                    </button>
                    {mentionAgentSessions.map((session, index) => (
                      <button
                        key={session.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSessionSelect(session);
                        }}
                        className={cn(
                          "flex w-full flex-col px-3 py-2 text-left transition-colors",
                          index + 1 === sessionPickerIndex
                            ? "bg-gray-100 dark:bg-gray-800"
                            : "hover:[background:var(--app-hover)]",
                        )}
                      >
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {session.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="truncate">
                            {displayProjectName(session.project_name)}
                          </span>
                          <span>·</span>
                          <span className="shrink-0">
                            {timeAgo(session.updated_at)}
                          </span>
                        </span>
                      </button>
                    ))}
                    {mentionAgentSessions.length === 0 && (
                      <div className="px-3 py-2 text-center text-[11px] text-gray-400">
                        No existing sessions
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {userProjects.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-gray-400">
                        No projects available
                      </div>
                    ) : (
                      userProjects.map((project, index) => (
                        <button
                          key={project.id ?? "general"}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleProjectSelect(project);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                            index === sessionPickerIndex
                              ? "bg-gray-100 dark:bg-gray-800"
                              : "hover:[background:var(--app-hover)]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                              index === sessionPickerIndex
                                ? "bg-deep-space-blue-500 text-white"
                                : "theme-surface-muted theme-text-muted",
                            )}
                          >
                            {project.id === null
                              ? "G"
                              : project.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {project.name}
                          </span>
                        </button>
                      ))
                    )}
                    {isCreatingChat && (
                      <div className="px-3 py-2 text-center text-xs text-gray-400">
                        Creating chat...
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <MobileInputBar
            input={input}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSend={handleSend}
            placeholder={placeholder}
            disabled={isDomainPending}
            isTyping={isTyping || hasActiveChatRequest}
            hasActiveRunTrace={hasActiveRunTrace}
            activeAgent={activeAgent}
            availableAgents={availableAgents}
            availableDomains={availableDomains}
            onSelectAgent={handleSwitchAgent}
            onSelectDomain={handleEnterDomainFromChip}
            onCancelPress={cancelResponse}
            onVoiceInputPress={handleVoiceInputPress}
            voiceInputState={voiceInputState}
            voiceInputDisabled={voiceInputControlDisabled}
            agentColor={agentColor}
            isDomainPending={isDomainPending}
            inputRef={inputRef}
            inDomain={inDomain}
            onExitDomain={exitDomain}
            activeDomainLabel={
              activeDomainSession
                ? availableDomains.find(
                    (m) => m.id === activeDomainSession.domain_id,
                  )?.command
                : undefined
            }
            pendingDomain={pendingDomain}
            onClearPendingDomain={() => setPendingDomain(null)}
            pendingCommand={pendingCommand}
            onClearPendingCommand={() => setPendingCommand(null)}
            sendDisabled={
              !artifactAttachments.isReady ||
              (artifactAttachments.artifactIds.length > 0 && attachmentDisabled)
            }
            hasReadyAttachments={artifactAttachments.artifactIds.length > 0}
            attachments={
              <>
                <SessionArtifactAttachments messages={messages} />
                <ArtifactAttachmentComposer
                  attachments={artifactAttachments.attachments}
                  canAdd={artifactAttachments.canAdd}
                  disabled={attachmentDisabled}
                  disabledReason={attachmentDisabledReason}
                  onAdd={artifactAttachments.addFiles}
                  onRemove={artifactAttachments.remove}
                  onRetry={artifactAttachments.retry}
                />
              </>
            }
          />
        </div>
      )}

      {/* Desktop Input */}
      {!isMobile && (
        <div className="relative z-[90] bg-gradient-to-t from-white via-white/95 to-white/70 px-5 pb-5 pt-3 dark:from-[#06090f] dark:via-[#06090f]/95 dark:to-[#06090f]/70 lg:px-8">
          <SessionArtifactAttachments messages={messages} />
          <ArtifactAttachmentList
            attachments={artifactAttachments.attachments}
            onRemove={artifactAttachments.remove}
            onRetry={artifactAttachments.retry}
          />
          <div className="relative">
            {showCommandDropdown && filteredCommandEntries.length > 0 && (
              <ChatCommandDropdown
                entries={filteredCommandEntries}
                currentPath={commandPickerPath}
                selectedIndex={selectedCommandIndex}
                onSelect={(command) => {
                  void handleCommandSelect(command);
                }}
                onNavigate={handleCommandGroupNavigate}
                onBack={handleCommandGroupBack}
                onClose={() => {
                  setShowCommandDropdown(false);
                  setCommandFilter("");
                  setCommandPickerPath("");
                }}
                anchorRef={inputRef}
              />
            )}

            {showDomainDropdown &&
              (filteredDomains.length > 0 || activeDomainSession) && (
                <DomainSlashCommandDropdown
                  domains={filteredDomains}
                  selectedIndex={selectedDomainIndex}
                  onSelect={handleDomainSelect}
                  onClose={() => setShowDomainDropdown(false)}
                  anchorRef={inputRef}
                  accentColor={agentColor}
                  exitMode={!!activeDomainSession}
                  onExitDomain={() => {
                    setInput("");
                    resetInputHeight();
                    setShowDomainDropdown(false);
                    exitDomain();
                  }}
                />
              )}

            {/* @mention navigation: Step 2 (session picker) or Step 3 (project picker) */}
            {selectedMentionAgent && (
              <div
                ref={dropdownRef}
                className="theme-border absolute bottom-full left-0 mb-1 z-[100] w-80 max-h-72 overflow-y-auto rounded-lg border bg-white shadow-xl dark:bg-gray-900"
              >
                {/* Header showing selected agent */}
                <div className="theme-border sticky top-0 flex items-center gap-2 border-b bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <RoleIdenticon
                    roleId={selectedMentionAgent.id}
                    color={selectedMentionAgent.color}
                    size={18}
                    className="shrink-0"
                    name={selectedMentionAgent.name}
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    @{selectedMentionAgent.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    —{" "}
                    {mentionStep === "project"
                      ? "pick a project"
                      : "pick a session"}
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (mentionStep === "project") {
                        setMentionStep("session");
                        setSessionPickerIndex(0);
                      } else {
                        closeMentionFlow();
                      }
                    }}
                    className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title={
                      mentionStep === "project" ? "Back to sessions" : "Close"
                    }
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      {mentionStep === "project" ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 19.5L8.25 12l7.5-7.5"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      )}
                    </svg>
                  </button>
                </div>

                {mentionStep === "session" ? (
                  <>
                    {/* "+ New chat" row — always first */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleNewChatFromMention();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                        sessionPickerIndex === 0
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:[background:var(--app-hover)]",
                      )}
                    >
                      <svg
                        className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        New chat
                      </span>
                    </button>

                    {/* Existing sessions */}
                    {mentionAgentSessions.map((session, index) => (
                      <button
                        key={session.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSessionSelect(session);
                        }}
                        className={cn(
                          "flex w-full flex-col px-3 py-2 text-left transition-colors",
                          index + 1 === sessionPickerIndex
                            ? "bg-gray-100 dark:bg-gray-800"
                            : "hover:[background:var(--app-hover)]",
                        )}
                      >
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {session.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="truncate">
                            {displayProjectName(session.project_name)}
                          </span>
                          <span>·</span>
                          <span className="shrink-0">
                            {timeAgo(session.updated_at)}
                          </span>
                        </span>
                      </button>
                    ))}

                    {mentionAgentSessions.length === 0 && (
                      <div className="px-3 py-2 text-center text-[11px] text-gray-400">
                        No existing sessions
                      </div>
                    )}
                  </>
                ) : (
                  /* Step 3: Project picker */
                  <>
                    {userProjects.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-gray-400">
                        No projects available
                      </div>
                    ) : (
                      userProjects.map((project, index) => (
                        <button
                          key={project.id ?? "general"}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleProjectSelect(project);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                            index === sessionPickerIndex
                              ? "bg-gray-100 dark:bg-gray-800"
                              : "hover:[background:var(--app-hover)]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                              index === sessionPickerIndex
                                ? "bg-deep-space-blue-500 text-white"
                                : "theme-surface-muted theme-text-muted",
                            )}
                          >
                            {project.id === null
                              ? "G"
                              : project.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {project.name}
                          </span>
                        </button>
                      ))
                    )}

                    {isCreatingChat && (
                      <div className="px-3 py-2 text-center text-xs text-gray-400">
                        Creating chat...
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step 1: Agent autocomplete dropdown */}
            {showAgentDropdown &&
              !selectedMentionAgent &&
              filteredAgents.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="theme-border absolute bottom-full left-0 mb-1 z-[100] w-64 max-h-48 overflow-y-auto rounded-lg border bg-white shadow-xl dark:bg-gray-900"
                >
                  {filteredAgents.map(
                    (agent: AgentDefinition, index: number) => (
                      <button
                        key={agent.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAgentSelect(agent);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                          index === selectedDropdownIndex
                            ? "theme-surface-muted"
                            : "hover:[background:var(--app-hover)]",
                        )}
                      >
                        <RoleIdenticon
                          roleId={agent.id}
                          color={agent.color}
                          size={20}
                          className="shrink-0"
                          name={agent.name}
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          @{agent.name}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              )}

            <AnimatePresence>
              {!isMobile &&
                showDomainBanner &&
                activeDomainSession &&
                activeAgent &&
                (() => {
                  const activeDomain = availableDomains.find(
                    (m) => m.id === activeDomainSession.domain_id,
                  );
                  return (
                    <motion.div
                      key="domain-banner"
                      initial={{ opacity: 0, y: 8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{
                        opacity: 0,
                        y: 8,
                        height: 0,
                        transition: { duration: 1, ease: "easeIn" },
                      }}
                      transition={{
                        duration: 0.5,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="mb-2 overflow-hidden"
                    >
                      <div
                        className="flex items-center justify-between rounded-lg px-3 py-2"
                        style={
                          agentColor
                            ? {
                                background: `linear-gradient(90deg, ${agentColor}08 0%, ${agentColor}15 50%, ${agentColor}08 100%)`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={
                            agentColor
                              ? {
                                  backgroundColor: `${agentColor}20`,
                                  color: agentColor,
                                }
                              : undefined
                          }
                        >
                          {activeDomain?.command ?? "#domain"} ·{" "}
                          {activeDomain?.name ?? "Domain"}
                        </span>
                        <button
                          type="button"
                          onClick={exitDomain}
                          className="rounded-full p-1 text-gray-400 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
                          title="Exit domain"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </motion.div>
                  );
                })()}
            </AnimatePresence>

            <ChatComposer
              inputRef={inputRef}
              input={input}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              pendingDomain={pendingDomain}
              pendingCommand={pendingCommand}
              onClearPendingDomain={() => setPendingDomain(null)}
              onClearPendingCommand={() => setPendingCommand(null)}
              isDomainPending={isDomainPending}
              borderPhase={borderPhase}
              agentColor={agentColor}
              voiceInputState={voiceInputState}
              voiceInputDisabled={voiceInputControlDisabled}
              voiceInputTitle={voiceInputTitle}
              onVoiceInputPress={handleVoiceInputPress}
              attachmentCanAdd={artifactAttachments.canAdd}
              attachmentDisabled={attachmentDisabled}
              attachmentDisabledReason={attachmentDisabledReason}
              onAddAttachments={artifactAttachments.addFiles}
              canSend={
                (Boolean(input.trim()) ||
                  Boolean(pendingCommand) ||
                  artifactAttachments.artifactIds.length > 0) &&
                artifactAttachments.isReady &&
                (artifactAttachments.artifactIds.length === 0 ||
                  !attachmentDisabled)
              }
              onSend={handleSend}
              hasActiveTurn={hasActiveTurn}
              holdProgress={holdProgress}
              onCancel={cancelResponse}
              onCancelHoldStart={handleCancelHoldStart}
              onCancelHoldEnd={handleCancelHoldEnd}
            />
          </div>
        </div>
      )}
    </div>
  );
}
