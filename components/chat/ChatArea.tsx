"use client";

import { cn } from "@/lib/cn";
import {
  Children,
  isValidElement,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useSWR from "swr";
import type {
  AgentDefinition,
  ChatMessage,
  ChatSessionExtended,
  Domain,
  PackageInstall,
  PackageInstallDetail,
  PackageInstallResource,
} from "@/lib/types";
import { useAgent, useAgents, useAgentDomains, useProjects } from "@/lib/hooks";
import {
  allChatSessionsUrl,
  createChatSession,
  fetchPackageInstallDetail,
  fetcher,
  packageInstallsUrl,
} from "@/lib/api";
import { usePlannerChat } from "@/lib/usePlannerChat";
import { formatToolCallSignature } from "@/lib/toolCallDisplay";
import { useUser } from "@clerk/nextjs";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { DomainSlashCommandDropdown } from "@/components/project/DomainSlashCommandDropdown";
import { PendingDomainPill } from "@/components/project/PendingDomainPill";
import { Button } from "@/components/ui/Button";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MobileInputBar } from "./MobileInputBar";
import { MobileEmptyState } from "./MobileEmptyState";
import { PendingCommandPill } from "./PendingCommandPill";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { loadEnvelopeEvents } from "@/lib/agentRunTrace/envelopeStore";
import { reduceRunTraceEvents } from "@/lib/agentRunTrace/reducer";
import type { RunTrace } from "@/lib/agentRunTrace/types";

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
  command: string;
  description: string;
  source: "builtin" | "package";
  sourcePath?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NEW_SESSION_COMMAND = "/new-session";
const CHAT_COMMANDS: ChatCommandOption[] = [
  {
    command: NEW_SESSION_COMMAND,
    description: "Create a fresh chat with this agent and project.",
    source: "builtin",
  },
];

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

function packageCommandOption(
  resource: PackageInstallResource,
): ChatCommandOption | null {
  if (
    resource.install_state !== "installed" ||
    resource.resource_type !== "command"
  ) {
    return null;
  }
  const command = metadataText(resource.metadata, ["runtime", "command"]);
  if (!command?.startsWith("/")) return null;
  return {
    command,
    description:
      metadataText(resource.metadata, ["runtime", "description"]) ??
      metadataText(resource.metadata, ["source", "package"]) ??
      resource.source_path,
    source: "package",
    sourcePath: resource.source_path,
    updatedAt: resource.updated_at,
  };
}

function installedPackageCommands(
  details: PackageInstallDetail[] | undefined,
): ChatCommandOption[] {
  if (!details?.length) return [];
  const seen = new Set(CHAT_COMMANDS.map((command) => command.command));
  const commands = new Map<string, ChatCommandOption>();
  for (const detail of details) {
    for (const resource of detail.resources) {
      const option = packageCommandOption(resource);
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
  }
  return Array.from(commands.values()).sort((left, right) =>
    left.command.localeCompare(right.command),
  );
}

function matchInstalledPackageCommand(
  text: string,
  commands: ChatCommandOption[],
): ChatCommandOption | null {
  const trimmed = text.trim();
  const lowerText = trimmed.toLowerCase();
  return (
    commands
      .filter((command) => command.source === "package")
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
  commands,
  selectedIndex,
  onSelect,
  onClose,
  anchorRef,
}: {
  commands: ChatCommandOption[];
  selectedIndex: number;
  onSelect: (command: ChatCommandOption) => void;
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
      const width = Math.min(320, Math.max(0, window.innerWidth - 32));
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

  if (commands.length === 0 || !position || typeof document === "undefined") {
    return null;
  }

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
      <div className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
        Available Commands
      </div>
      {commands.map((command, index) => (
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
            <span className="block font-medium">{command.command}</span>
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
      ))}
    </div>,
    document.body,
  );
}

/** Shorten full UUIDs to their first 8-char segment for compact mobile display. */
function shortenUuids(text: string): string {
  return text.replace(UUID_RE, (match) => `${match.slice(0, 8)}…`);
}

function getCodeLanguage(className?: string): string | null {
  const match = /language-([\w-]+)/i.exec(className ?? "");
  return match?.[1] ?? null;
}

function formatCodeLanguageLabel(language: string | null): string | null {
  if (!language) return null;
  return language
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractMermaidChart(text: string): {
  chart: string | null;
  before: string;
  after: string;
} {
  const fencedMatch = text.match(/```mermaid\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const chart = fencedMatch[1]?.trim() ?? "";
    const [fullMatch] = fencedMatch;
    const startIndex = text.indexOf(fullMatch);
    const before = startIndex >= 0 ? text.slice(0, startIndex).trim() : "";
    const after =
      startIndex >= 0 ? text.slice(startIndex + fullMatch.length).trim() : "";
    return { chart: chart || null, before, after };
  }

  const normalized = text
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/^mermaid\s*\n/i, "")
    .trimStart();

  if (!normalized) {
    return { chart: null, before: text, after: "" };
  }

  const isMermaid =
    /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/.test(
      normalized,
    );

  return {
    chart: isMermaid ? normalized.trim() : null,
    before: isMermaid ? "" : text,
    after: "",
  };
}

function getNextStreamSliceLength(remainingText: string): number {
  if (remainingText.length === 0) return 0;
  if (remainingText.startsWith("\n\n")) return 2;
  if (remainingText[0] === "\n") return 1;

  const nextWord = remainingText.match(/^\S+\s*/)?.[0];
  if (!nextWord) {
    return Math.min(3, remainingText.length);
  }

  if (nextWord.length <= 4) return nextWord.length;
  if (nextWord.length <= 8) return Math.min(nextWord.length, 4);
  return Math.min(nextWord.length, 6);
}

function getSeenAssistantStorageKey(sessionId: string | null): string | null {
  return sessionId ? `nenjo:seen-assistant:${sessionId}` : null;
}

function getSeenAssistantContentKey(content: string): string {
  let hash = 5381;
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(index);
  }
  return `content:${(hash >>> 0).toString(36)}`;
}

function readSeenAssistantMap(sessionId: string | null): Map<string, string> {
  const key = getSeenAssistantStorageKey(sessionId);
  if (!key || typeof window === "undefined") return new Map();

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeSeenAssistantMap(
  sessionId: string | null,
  seenMap: Map<string, string>,
): void {
  const key = getSeenAssistantStorageKey(sessionId);
  if (!key || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries(seenMap)),
    );
  } catch {
    // ignore
  }
}

function useAnimatedStreamText(text: string, enabled: boolean, delayMs = 72) {
  const [visibleLength, setVisibleLength] = useState(enabled ? 0 : text.length);
  const previousEnabledRef = useRef(enabled);
  const nextLengthRef = useRef<number | null>(null);

  const visibleText = enabled ? text.slice(0, visibleLength) : text;

  useEffect(() => {
    if (!enabled) {
      previousEnabledRef.current = false;
      nextLengthRef.current = null;
      return;
    }

    const shouldRestart =
      !previousEnabledRef.current || !text.startsWith(visibleText);
    const baseLength = shouldRestart ? 0 : visibleLength;
    if (baseLength === text.length) {
      previousEnabledRef.current = true;
      nextLengthRef.current = null;
      return;
    }

    const remainingText = text.slice(baseLength);
    const nextSliceLength = getNextStreamSliceLength(remainingText);
    if (nextSliceLength <= 0) return;

    nextLengthRef.current = baseLength + nextSliceLength;
    const timeoutId = window.setTimeout(() => {
      if (nextLengthRef.current !== null) {
        setVisibleLength(nextLengthRef.current);
      }
    }, delayMs);

    previousEnabledRef.current = true;
    return () => {
      nextLengthRef.current = null;
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, enabled, text, visibleLength, visibleText]);

  return visibleText;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserAvatar({
  imageUrl,
  initials,
}: {
  imageUrl?: string | null;
  initials: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt="You"
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-deep-space-blue-100 text-xs font-bold text-deep-space-blue-700">
      {initials}
    </div>
  );
}

const MessageStatusIndicator = memo(function MessageStatusIndicator({
  status,
}: {
  status?: ChatMessage["status"];
}) {
  if (!status) return null;

  if (status === "sending") {
    return (
      <motion.span
        key="sending"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -5 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-deep-space-blue-200"
      >
        Sending
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="20 12"
            strokeLinecap="round"
          />
        </svg>
      </motion.span>
    );
  }

  if (status === "sent") {
    return (
      <motion.span
        key="sent"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -5 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-deep-space-blue-200"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 16" fill="none">
          <path
            d="M4 8.5l4 4 7-8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-check-draw"
          />
        </svg>
        Sent
        <svg
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="20 12"
            strokeLinecap="round"
          />
        </svg>
      </motion.span>
    );
  }

  if (status === "failed") {
    return (
      <motion.span
        key="failed"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -5 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-300"
      >
        Failed
      </motion.span>
    );
  }

  if (status === "cancelled") {
    return (
      <motion.span
        key="cancelled"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -5 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300"
      >
        Cancelled
      </motion.span>
    );
  }

  // delivered
  return (
    <motion.span
      key="delivered"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 16" fill="none">
        <path
          d="M2 8.5l3 3 5-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-check-draw"
        />
        <path
          d="M7 8.5l3 3 5-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-check-draw-delayed"
        />
      </svg>
      Delivered
    </motion.span>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  activeAgent,
  userImageUrl,
  userInitials,
  onDelete,
  compact,
  animateStream = false,
}: {
  message: ChatMessage;
  activeAgent?: AgentDefinition;
  userImageUrl?: string | null;
  userInitials: string;
  onDelete?: (messageId: string) => void;
  /** When true, shorten UUIDs in message content (mobile). */
  compact?: boolean;
  animateStream?: boolean;
}) {
  const isUser = message.role === "user";
  const displayContent = compact
    ? shortenUuids(message.content)
    : message.content;
  const streamedContent = useAnimatedStreamText(
    displayContent,
    animateStream,
    28,
  );
  const mermaidContent = !isUser
    ? extractMermaidChart(displayContent)
    : { chart: null, before: displayContent, after: "" };
  const [activityOpen, setActivityOpen] = useState(
    message.runTrace?.phase === "failed",
  );
  const [envelopeTrace, setEnvelopeTrace] = useState<RunTrace | undefined>();
  const [activityLoadFailed, setActivityLoadFailed] = useState(false);
  const activityTrace = message.runTrace ?? envelopeTrace;
  const hasActivity = Boolean(message.runTrace ?? message.runEnvelopeId);

  useEffect(() => {
    if (!activityOpen || message.runTrace || !message.runEnvelopeId) return;
    let cancelled = false;
    void loadEnvelopeEvents(message.runEnvelopeId)
      .then((events) => {
        if (cancelled) return;
        const trace = reduceRunTraceEvents(undefined, events);
        setEnvelopeTrace(trace);
        setActivityLoadFailed(events.length === 0 || !trace);
      })
      .catch(() => {
        if (!cancelled) setActivityLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activityOpen, message.runEnvelopeId, message.runTrace]);

  return (
    <div
      className={cn(
        "group flex items-start gap-3",
        isUser ? "flex-row-reverse md:flex-row" : "flex-row",
      )}
    >
      {/* Avatar — hidden on mobile */}
      <div className="hidden md:block">
        {isUser ? (
          <UserAvatar imageUrl={userImageUrl} initials={userInitials} />
        ) : activeAgent ? (
          <RoleIdenticon
            roleId={activeAgent.id}
            color={activeAgent.color}
            size={32}
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
          "overflow-hidden break-normal text-[15px] leading-7 md:break-words md:text-sm md:leading-relaxed rounded-2xl md:rounded-xl px-4 py-2.5",
          isUser
            ? "max-w-[85%] md:max-w-[75%] bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-tr-sm md:rounded-tr-2xl md:rounded-tl-sm md:bg-deep-space-blue-500 md:text-white md:dark:bg-deep-space-blue-500 md:dark:text-white"
            : "max-w-full md:max-w-[75%] bg-transparent md:theme-surface md:border md:theme-border text-gray-800 rounded-tl-sm dark:text-gray-200",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayContent}</p>
        ) : (
          <div className="space-y-3">
            {mermaidContent.before ? (
              <div className="prose max-w-none break-normal text-[15px] leading-7 md:break-words md:text-sm md:leading-relaxed dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-[-0.02em] prose-headings:text-gray-950 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:rounded prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium prose-code:text-gray-900 prose-code:break-all dark:prose-code:bg-white/[0.08] dark:prose-code:text-gray-100 prose-pre:overflow-x-auto prose-pre:rounded-[1.35rem] prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#0a0d12] prose-pre:px-0 prose-pre:py-0 prose-pre:text-[13px] prose-pre:text-gray-100 dark:prose-pre:bg-[#0a0d12] [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-4 [&_pre_code]:pt-3 [&_pre_code]:rounded-none [&_pre_code]:break-normal prose-li:text-gray-800 dark:prose-li:text-gray-200 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-blockquote:border-deep-space-blue-300 prose-blockquote:text-gray-700 dark:prose-blockquote:border-deep-space-blue-700 dark:prose-blockquote:text-gray-300 prose-table:text-xs prose-table:overflow-x-auto prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre({ children }) {
                      const child =
                        Children.count(children) === 1
                          ? Children.only(children)
                          : null;
                      if (
                        child &&
                        typeof child === "object" &&
                        "type" in child &&
                        (child as React.ReactElement).type === MermaidDiagram
                      ) {
                        return <>{children}</>;
                      }
                      const className = isValidElement<{ className?: string }>(
                        child,
                      )
                        ? child.props.className
                        : undefined;
                      const language = formatCodeLanguageLabel(
                        getCodeLanguage(className),
                      );
                      const rawText = isValidElement<{
                        children?: React.ReactNode;
                      }>(child)
                        ? String(child.props.children ?? "").replace(/\n$/, "")
                        : String(children ?? "").replace(/\n$/, "");

                      return (
                        <div className="not-prose overflow-hidden rounded-[1.35rem] border border-slate-900 bg-slate-950 text-slate-50 shadow-[0_10px_30px_rgba(2,6,23,0.16)] dark:border-slate-200 dark:bg-slate-50 dark:text-slate-900">
                          {language ? (
                            <div className="border-b border-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:border-slate-200 dark:text-slate-500">
                              {language}
                            </div>
                          ) : null}
                          <pre className="m-0 overflow-x-auto bg-slate-950 p-4 text-left text-slate-50 dark:bg-slate-50 dark:text-slate-900">
                            <code
                              className="block whitespace-pre font-mono text-[13px] leading-6 text-slate-50 dark:text-slate-900"
                              style={{
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              }}
                            >
                              {rawText}
                            </code>
                          </pre>
                        </div>
                      );
                    },
                    code({ className, children, ...props }) {
                      const language = getCodeLanguage(className);
                      const codeString = String(children).replace(/\n$/, "");

                      if (language === "mermaid") {
                        return <MermaidDiagram chart={codeString} />;
                      }

                      if (className) {
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="font-mono text-[0.85em]" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {mermaidContent.chart
                    ? mermaidContent.before
                    : streamedContent}
                </ReactMarkdown>
              </div>
            ) : null}
            {mermaidContent.chart ? (
              <div className="not-prose">
                <MermaidDiagram chart={mermaidContent.chart} />
              </div>
            ) : null}
            {mermaidContent.after ? (
              <div className="prose max-w-none break-normal text-[15px] leading-7 md:break-words md:text-sm md:leading-relaxed dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-[-0.02em] prose-headings:text-gray-950 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:rounded prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium prose-code:text-gray-900 prose-code:break-all dark:prose-code:bg-white/[0.08] dark:prose-code:text-gray-100 prose-pre:overflow-x-auto prose-pre:rounded-[1.35rem] prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#0a0d12] prose-pre:px-0 prose-pre:py-0 prose-pre:text-[13px] prose-pre:text-gray-100 dark:prose-pre:bg-[#0a0d12] [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-4 [&_pre_code]:pt-3 [&_pre_code]:rounded-none [&_pre_code]:break-normal prose-li:text-gray-800 dark:prose-li:text-gray-200 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-blockquote:border-deep-space-blue-300 prose-blockquote:text-gray-700 dark:prose-blockquote:border-deep-space-blue-700 dark:prose-blockquote:text-gray-300 prose-table:text-xs prose-table:overflow-x-auto prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre({ children }) {
                      const child =
                        Children.count(children) === 1
                          ? Children.only(children)
                          : null;
                      if (
                        child &&
                        typeof child === "object" &&
                        "type" in child &&
                        (child as React.ReactElement).type === MermaidDiagram
                      ) {
                        return <>{children}</>;
                      }
                      const className = isValidElement<{ className?: string }>(
                        child,
                      )
                        ? child.props.className
                        : undefined;
                      const language = formatCodeLanguageLabel(
                        getCodeLanguage(className),
                      );
                      const rawText = isValidElement<{
                        children?: React.ReactNode;
                      }>(child)
                        ? String(child.props.children ?? "").replace(/\n$/, "")
                        : String(children ?? "").replace(/\n$/, "");

                      return (
                        <div className="not-prose overflow-hidden rounded-[1.35rem] border border-slate-900 bg-slate-950 text-slate-50 shadow-[0_10px_30px_rgba(2,6,23,0.16)] dark:border-slate-200 dark:bg-slate-50 dark:text-slate-900">
                          {language ? (
                            <div className="border-b border-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:border-slate-200 dark:text-slate-500">
                              {language}
                            </div>
                          ) : null}
                          <pre className="m-0 overflow-x-auto bg-slate-950 p-4 text-left text-slate-50 dark:bg-slate-50 dark:text-slate-900">
                            <code
                              className="block whitespace-pre font-mono text-[13px] leading-6 text-slate-50 dark:text-slate-900"
                              style={{
                                fontFamily:
                                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                              }}
                            >
                              {rawText}
                            </code>
                          </pre>
                        </div>
                      );
                    },
                    code({ className, children, ...props }) {
                      const language = getCodeLanguage(className);
                      const codeString = String(children).replace(/\n$/, "");

                      if (language === "mermaid") {
                        return <MermaidDiagram chart={codeString} />;
                      }

                      if (className) {
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className="font-mono text-[0.85em]" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {mermaidContent.after}
                </ReactMarkdown>
              </div>
            ) : null}
            {hasActivity && (
              <div className="not-prose border-t border-gray-200/70 pt-2 dark:border-gray-700/70">
                <button
                  type="button"
                  onClick={() => {
                    setActivityLoadFailed(false);
                    setActivityOpen((value) => !value);
                  }}
                  className="flex min-h-8 w-full items-center gap-2 text-left text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-expanded={activityOpen}
                >
                  {activityOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  )}
                  <span className="min-w-0 flex-1">Activity</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-normal text-gray-400">
                    {activityOpen ? "Hide" : "Show"}
                  </span>
                </button>
                {activityOpen && activityTrace && (
                  <AgentRunTrace
                    trace={activityTrace}
                    mode="history"
                    density={compact ? "compact" : "regular"}
                    embedded
                  />
                )}
                {activityOpen && !activityTrace && activityLoadFailed && (
                  <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                    Activity unavailable on this device.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px]",
              isUser
                ? "text-gray-400 md:text-deep-space-blue-200"
                : "text-gray-400",
            )}
            suppressHydrationWarning
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isUser && (
            <AnimatePresence mode="wait">
              <MessageStatusIndicator status={message.status} />
            </AnimatePresence>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-flag-red-500 dark:hover:text-flag-red-400"
              title="Delete message"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244 2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

type ToolEntry = {
  name: string;
  args: string;
  textPreview?: string;
  status?: "running" | "completed" | "failed";
  outputPreview?: string;
  errorPreview?: string;
  children?: ToolEntry[];
};

function ToolCallLine({
  tool,
  compact = false,
}: {
  tool: ToolEntry;
  compact?: boolean;
}) {
  const signature = formatToolCallSignature(tool.name, tool.args);
  const statusLabel =
    tool.status === "completed"
      ? "done"
      : tool.status === "failed"
        ? "failed"
        : null;
  return (
    <div
      className={cn(
        "flex items-start gap-2",
        compact ? "text-[10px]" : "text-[11px]",
      )}
    >
      <span
        className={cn(
          "mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          tool.status === "failed"
            ? "bg-flag-red-400"
            : tool.status === "completed"
              ? "bg-emerald-400"
              : "animate-pulse bg-deep-space-blue-400",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="rounded-md border border-gray-200/80 bg-gray-50 px-2 py-1.5 font-mono leading-relaxed text-gray-600 shadow-sm dark:border-gray-700/80 dark:bg-gray-900/45 dark:text-gray-300">
          <span className="whitespace-pre-wrap break-words">{signature}</span>
          {statusLabel && (
            <span
              className={cn(
                "ml-2 font-sans text-[10px] font-medium",
                tool.status === "failed"
                  ? "text-flag-red-500/80 dark:text-flag-red-400/80"
                  : "text-emerald-500/80 dark:text-emerald-400/80",
              )}
            >
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const TypingIndicator = memo(function TypingIndicator({
  activeAgent,
  tools,
  preview,
  mobile = false,
}: {
  activeAgent?: AgentDefinition;
  tools?: ToolEntry[];
  preview?: string;
  mobile?: boolean;
}) {
  const hasTools = tools && tools.length > 0;
  const textPreview =
    preview?.trim() ||
    tools?.find((tool) => tool.textPreview?.trim())?.textPreview?.trim();
  const streamedPreview = useAnimatedStreamText(
    textPreview ?? "",
    !!textPreview,
    26,
  );

  const renderedPreview = textPreview ? streamedPreview : "";
  const previewLeadLength = textPreview ? Math.min(textPreview.length, 18) : 0;
  const showTools =
    hasTools &&
    (!textPreview ||
      streamedPreview === textPreview ||
      streamedPreview.length >= previewLeadLength);
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        mobile ? "w-full max-w-full" : "w-full max-w-[72%]",
      )}
    >
      {activeAgent ? (
        <RoleIdenticon
          roleId={activeAgent.id}
          color={activeAgent.color}
          size={32}
          className="shrink-0"
          animate={true}
          name={activeAgent.name}
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-tangerine-100 text-xs font-bold text-vivid-tangerine-700">
          AI
        </div>
      )}
      <div
        className={cn(
          "theme-border theme-surface min-w-0 rounded-xl rounded-tl-sm border px-4 py-2.5",
          mobile ? "flex-1" : "w-full flex-1",
        )}
      >
        {textPreview ? (
          <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {renderedPreview}
            <span className="ml-1 animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">
              &#9612;
            </span>
          </div>
        ) : (
          <div className="flex items-center font-mono text-xs text-gray-400">
            <span className="animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">
              &#9612;
            </span>
          </div>
        )}
        {showTools && (
          <div className="mt-1.5 flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {tools.map((tool, i) => (
                <motion.div
                  key={`${tool.name}-${i}`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="leading-tight"
                >
                  <div className="min-w-0 space-y-1">
                    <ToolCallLine tool={tool} />
                    {tool.children && tool.children.length > 0 && (
                      <div className="theme-border mt-1.5 ml-3 flex flex-col gap-1 border-l pl-3">
                        <AnimatePresence initial={false}>
                          {tool.children.map((child, childIndex) => (
                            <motion.div
                              key={`${child.name}-${childIndex}`}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -4 }}
                              transition={{
                                duration: 0.34,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="leading-tight"
                            >
                              <ToolCallLine tool={child} compact />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
});

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
  const isAgentTarget = targetType === "agent";
  const { user } = useUser();
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
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const { agents: allAgents } = useAgents();
  const { agent: activeAgentDetail } = useAgent(
    isAgentTarget ? agentId : undefined,
  );
  const { agentDomains } = useAgentDomains(isAgentTarget ? agentId : undefined);
  const { projects } = useProjects();
  const { data: packageInstalls } = useSWR<PackageInstall[]>(
    packageInstallsUrl(),
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );
  const activePackageInstalls = useMemo(
    () =>
      (packageInstalls ?? []).filter(
        (install) => install.status === "installed",
      ),
    [packageInstalls],
  );
  const packageInstallDetailKey = useMemo(() => {
    if (!activePackageInstalls.length) return null;
    return [
      "chat-package-install-details",
      activePackageInstalls
        .map((install) => `${install.id}:${install.updated_at}`)
        .join("|"),
    ] as const;
  }, [activePackageInstalls]);
  const { data: packageInstallDetails } = useSWR<PackageInstallDetail[]>(
    packageInstallDetailKey,
    async () => {
      const details = await Promise.all(
        activePackageInstalls.map((install) =>
          fetchPackageInstallDetail(install.id).catch(() => null),
        ),
      );
      return details.filter(
        (detail): detail is PackageInstallDetail => detail !== null,
      );
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );
  const chatCommands = useMemo(
    () => [
      ...CHAT_COMMANDS,
      ...installedPackageCommands(packageInstallDetails),
    ],
    [packageInstallDetails],
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
    deleteMessage,
    isTyping,
    activeTools,
    livePreview,
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
  } = usePlannerChat(projectId, agentId, sessionId ?? undefined, targetType);
  const hasActiveTools = activeTools.length > 0;
  const visibleRunTrace =
    activeRunTrace &&
    !["completed", "failed", "cancelled"].includes(activeRunTrace.phase)
      ? activeRunTrace
      : undefined;
  const hasActiveRunTrace = !!visibleRunTrace;

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
        m.display_name.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower),
    );
  }, [showDomainDropdown, domainFilter, availableDomains]);

  useEffect(() => {
    setSelectedDomainIndex(0);
  }, [filteredDomains]);

  const filteredCommands = useMemo(() => {
    if (!showCommandDropdown) return [];
    const lower = commandFilter.toLowerCase();
    return chatCommands.filter(
      (command) =>
        command.command.slice(1).toLowerCase().includes(lower) ||
        command.description.toLowerCase().includes(lower),
    );
  }, [showCommandDropdown, commandFilter, chatCommands]);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommands]);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastAssistantContentRef = useRef<Map<string, string>>(new Map());
  const seenAssistantContentRef = useRef<Map<string, string>>(new Map());
  const hasInitializedAssistantRef = useRef(false);
  const historyReadyRef = useRef(false);
  const pendingSessionScrollRef = useRef(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<
    string | null
  >(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  // Track message count for animation stagger logic
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    lastAssistantContentRef.current = new Map();
    seenAssistantContentRef.current = readSeenAssistantMap(sessionId);
    hasInitializedAssistantRef.current = false;
    historyReadyRef.current = false;
    setStreamingAssistantId(null);
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
      if (e.key !== "Escape" || !isTyping) return;
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
  }, [isTyping, cancelResponse]);

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
        hasActiveRunTrace || isTyping || hasActiveTools ? "smooth" : "auto";
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
      setShowScrollToLatest(false);
    }
  }, [
    messages,
    isTyping,
    activeTools,
    livePreview,
    visibleRunTrace,
    hasActiveRunTrace,
    hasActiveTools,
  ]);

  useEffect(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant",
    );

    if (!hasInitializedAssistantRef.current) {
      lastAssistantContentRef.current = new Map(
        assistantMessages.map((message) => [message.id, message.content]),
      );
      hasInitializedAssistantRef.current = true;
      return;
    }

    if (!historyReadyRef.current) {
      lastAssistantContentRef.current = new Map(
        assistantMessages.map((message) => [message.id, message.content]),
      );
      setStreamingAssistantId(null);
      return;
    }

    let latestChangedId: string | null = null;
    for (const message of assistantMessages) {
      const previousContent = lastAssistantContentRef.current.get(message.id);
      const seenContent = seenAssistantContentRef.current.get(message.id);

      if (
        previousContent !== undefined &&
        previousContent !== message.content &&
        seenContent !== message.content
      ) {
        latestChangedId = message.id;
        seenAssistantContentRef.current.set(message.id, message.content);
        seenAssistantContentRef.current.set(
          getSeenAssistantContentKey(message.content),
          message.id,
        );
      } else if (
        previousContent === undefined &&
        assistantMessages[assistantMessages.length - 1]?.id === message.id &&
        seenContent !== message.content
      ) {
        latestChangedId = message.id;
        seenAssistantContentRef.current.set(message.id, message.content);
        seenAssistantContentRef.current.set(
          getSeenAssistantContentKey(message.content),
          message.id,
        );
      }
      lastAssistantContentRef.current.set(message.id, message.content);
    }
    writeSeenAssistantMap(sessionId, seenAssistantContentRef.current);
    setStreamingAssistantId((currentId) => {
      if (latestChangedId) return latestChangedId;
      if (
        currentId &&
        assistantMessages.some((message) => message.id === currentId)
      ) {
        return currentId;
      }
      return null;
    });
  }, [messages, sessionId]);

  useEffect(() => {
    if (isLoadingHistory) return;
    historyReadyRef.current = true;
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant",
    );
    lastAssistantContentRef.current = new Map(
      assistantMessages.map((message) => [message.id, message.content]),
    );
    for (const message of assistantMessages) {
      seenAssistantContentRef.current.set(message.id, message.content);
      seenAssistantContentRef.current.set(
        getSeenAssistantContentKey(message.content),
        message.id,
      );
    }
    writeSeenAssistantMap(sessionId, seenAssistantContentRef.current);
  }, [isLoadingHistory, messages, sessionId]);

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
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      pendingSessionScrollRef.current = false;
      setShowScrollToLatest(false);
    }, 60);

    return () => window.clearTimeout(timeoutId);
  }, [isLoadingHistory, messages.length]);

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
      behavior: "smooth",
    });
    setShowScrollToLatest(false);
  }, []);

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
      setShowDomainDropdown(false);
      setDomainFilter("");

      if (command.command === NEW_SESSION_COMMAND) {
        setPendingCommand(null);
        setPendingDomain(null);
        await handleNewSessionCommand();
        return;
      }

      if (command.source === "package") {
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !pendingCommand) return;

    // Close any open mention flow
    closeMentionFlow();

    if (text.toLowerCase() === NEW_SESSION_COMMAND) {
      setInput("");
      resetInputHeight();
      setShowCommandDropdown(false);
      setCommandFilter("");
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
      enterDomain(pendingDomain.id, pendingDomain.command, agentId, text);
      setPendingDomain(null);
      return;
    }

    if (pendingCommand) {
      if (isTyping) return;
      const commandText = `${pendingCommand.command} ${text}`.trim();
      sendMessage(commandText, {
        commandInvocation: {
          command: pendingCommand.command,
        },
      });
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
        );
        return;
      }
    }

    if (isTyping) return;
    const packageCommand = matchInstalledPackageCommand(text, chatCommands);
    if (packageCommand) {
      sendMessage(text, {
        commandInvocation: {
          command: packageCommand.command,
        },
      });
    } else {
      sendMessage(text);
    }
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
    if (showCommandDropdown && filteredCommands.length > 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandDropdown(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1,
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        void handleCommandSelect(filteredCommands[selectedCommandIndex]);
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
      : `Message @${activeAgent.name}... (type @ to switch agent)`
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
    inputRef.current?.focus();
  }, []);

  const messageContent = useMemo(() => {
    if (isLoadingHistory) {
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

    if (messages.length === 0 && isMobile) {
      return (
        <MobileEmptyState
          agentId={agentId}
          activeAgent={activeAgent}
          onSwitchAgent={handleSwitchAgent}
          onEnterDomain={handleEnterDomainFromChip}
        />
      );
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
          {messages.map((msg) => (
            <div key={msg.id}>
              <MessageBubble
                message={msg}
                activeAgent={msg.role === "assistant" ? activeAgent : undefined}
                userImageUrl={userImageUrl}
                userInitials={userInitials}
                onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
                compact
                animateStream={
                  msg.role === "assistant" && msg.id === streamingAssistantId
                }
              />
            </div>
          ))}
          {(hasActiveRunTrace || isTyping || hasActiveTools) && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {visibleRunTrace ? (
                <AgentRunTrace
                  trace={visibleRunTrace}
                  activeAgent={activeAgent}
                  mobile
                />
              ) : (
                <TypingIndicator
                  activeAgent={activeAgent}
                  tools={activeTools}
                  preview={livePreview}
                  mobile
                />
              )}
            </motion.div>
          )}
          <div
            className={cn(
              "shrink-0",
              hasActiveRunTrace || isTyping || hasActiveTools ? "h-20" : "h-1",
            )}
          />
        </>
      );
    }

    return (
      <>
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-gray-400">
              Loading older messages...
            </span>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => {
            const isBulkLoad =
              prevMessageCountRef.current === 0 ||
              (messages.length > 2 && i < messages.length - 2);
            const staggerDelay = isBulkLoad ? Math.min(i * 0.03, 0.3) : 0;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{
                  duration: 0.2,
                  ease: "easeOut",
                  delay: staggerDelay,
                }}
              >
                <MessageBubble
                  message={msg}
                  activeAgent={
                    msg.role === "assistant" ? activeAgent : undefined
                  }
                  userImageUrl={userImageUrl}
                  userInitials={userInitials}
                  onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
                  compact={false}
                  animateStream={
                    msg.role === "assistant" && msg.id === streamingAssistantId
                  }
                />
              </motion.div>
            );
          })}
          {(hasActiveRunTrace || isTyping || hasActiveTools) && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {visibleRunTrace ? (
                <AgentRunTrace
                  trace={visibleRunTrace}
                  activeAgent={activeAgent}
                />
              ) : (
                <TypingIndicator
                  activeAgent={activeAgent}
                  tools={activeTools}
                  preview={livePreview}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={cn(
            "shrink-0",
            hasActiveRunTrace || isTyping || hasActiveTools ? "h-16" : "h-1",
          )}
        />
      </>
    );
  }, [
    isLoadingHistory,
    messages,
    isMobile,
    agentId,
    activeAgent,
    handleSwitchAgent,
    handleEnterDomainFromChip,
    isLoadingMore,
    userImageUrl,
    userInitials,
    deleteMessage,
    streamingAssistantId,
    isTyping,
    hasActiveRunTrace,
    visibleRunTrace,
    hasActiveTools,
    activeTools,
    livePreview,
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
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden",
        isMobile ? "rounded-none" : "rounded-lg",
      )}
    >
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
          "flex-1 overflow-y-auto overflow-x-hidden overscroll-contain space-y-4",
          isMobile ? "px-4 pt-1" : "p-4",
        )}
        style={
          isMobile
            ? {
                paddingBottom:
                  "calc(var(--mobile-composer-height, 108px) + env(safe-area-inset-bottom, 0px) + 0.2rem)",
              }
            : undefined
        }
      >
        {messageContent}
      </div>

      <AnimatePresence>
        {isMobile && showScrollToLatest && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={scrollToLatest}
            className={cn(
              "right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-[#f5f7fb]/90 text-gray-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#05070b]/90 dark:text-gray-100",
              isMobile
                ? "fixed bottom-[calc(var(--mobile-composer-height,108px)+env(safe-area-inset-bottom,0px)+0.35rem)]"
                : "absolute bottom-4",
            )}
            title="Jump to latest"
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
        )}
      </AnimatePresence>

      {/* Mobile input bar */}
      {isMobile && (
        <div className="pointer-events-none relative z-[90] shrink-0">
          {/* Dropdowns render above the mobile input */}
          {showCommandDropdown && filteredCommands.length > 0 && (
            <div className="pointer-events-auto absolute bottom-full left-0 right-0 z-[120] px-4 pb-2">
              <ChatCommandDropdown
                commands={filteredCommands}
                selectedIndex={selectedCommandIndex}
                onSelect={(command) => {
                  void handleCommandSelect(command);
                }}
                onClose={() => setShowCommandDropdown(false)}
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
            isTyping={isTyping}
            hasActiveTools={hasActiveTools}
            activeAgent={activeAgent}
            availableAgents={availableAgents}
            availableDomains={availableDomains}
            onSelectAgent={handleSwitchAgent}
            onSelectDomain={handleEnterDomainFromChip}
            onCancelPress={cancelResponse}
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
          />
        </div>
      )}

      {/* Desktop Input */}
      {!isMobile && (
        <div className="theme-border theme-surface relative z-[90] border-t p-3">
          <div className="relative">
            {showCommandDropdown && filteredCommands.length > 0 && (
              <ChatCommandDropdown
                commands={filteredCommands}
                selectedIndex={selectedCommandIndex}
                onSelect={(command) => {
                  void handleCommandSelect(command);
                }}
                onClose={() => setShowCommandDropdown(false)}
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
                          {activeDomain?.display_name ?? "Domain"}
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

            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                {/* Domain input border animation */}
                {borderPhase && agentColor && (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 rounded-lg"
                    style={{
                      padding: "1px",
                      background:
                        borderPhase === "exit"
                          ? `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 30%), ${agentColor} calc(var(--input-border-pos, 100%) - var(--input-idle-spread, 30%)), transparent var(--input-border-pos, 100%))`
                          : `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 0%), ${agentColor} calc(var(--input-border-pos, 0%) - var(--input-idle-spread, 0%)), transparent var(--input-border-pos, 0%))`,
                      mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      maskComposite: "exclude",
                      WebkitMask:
                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      WebkitMaskComposite: "xor",
                      animation:
                        borderPhase === "exit"
                          ? "input-border-exit 2.25s ease-in forwards"
                          : "input-border-enter 2.25s ease-in-out forwards, input-border-idle 6s linear 2.25s infinite",
                    }}
                  />
                )}
                <div
                  className={cn(
                    "theme-surface flex min-h-10 w-full items-end gap-2 rounded-lg px-2 py-1.5",
                    borderPhase
                      ? "border border-transparent"
                      : "theme-border border focus-within:border-deep-space-blue-500 focus-within:ring-1 focus-within:ring-deep-space-blue-500",
                    isDomainPending && "opacity-60",
                  )}
                >
                  {pendingDomain && (
                    <PendingDomainPill
                      domain={pendingDomain}
                      onClear={() => setPendingDomain(null)}
                      accentColor={agentColor}
                      className="mb-0.5"
                    />
                  )}
                  {pendingCommand && (
                    <PendingCommandPill
                      command={pendingCommand}
                      onClear={() => setPendingCommand(null)}
                      accentColor={agentColor}
                      className="mb-0.5"
                    />
                  )}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isDomainPending
                        ? "Activating domain..."
                        : pendingDomain
                          ? "Describe what to do in this domain..."
                          : pendingCommand
                            ? `Arguments for ${pendingCommand.command}...`
                            : placeholder
                    }
                    disabled={isDomainPending}
                    rows={1}
                    className="min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-gray-400 focus:outline-hidden focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
                    style={{ maxHeight: 200 }}
                  />
                </div>
                {isDomainPending && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg
                      className="h-4 w-4 animate-spin text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              {(hasActiveRunTrace || isTyping || hasActiveTools) && (
                <button
                  onMouseDown={handleCancelHoldStart}
                  onMouseUp={handleCancelHoldEnd}
                  onMouseLeave={handleCancelHoldEnd}
                  onTouchStart={handleCancelHoldStart}
                  onTouchEnd={handleCancelHoldEnd}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flag-red-100 hover:bg-flag-red-200 text-flag-red-600 dark:bg-flag-red-900/40 dark:hover:bg-flag-red-800/50 dark:text-flag-red-400 transition-colors"
                  title="Hold for 1 second to cancel"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  {!holdProgress && (
                    <span className="absolute inset-0 rounded-lg border-2 border-flag-red-400 dark:border-flag-red-500 animate-cancel-pulse" />
                  )}
                  {holdProgress && (
                    <svg
                      className="absolute inset-0 -rotate-90"
                      viewBox="0 0 40 40"
                    >
                      <circle
                        cx="20"
                        cy="20"
                        r="16"
                        fill="none"
                        className="stroke-flag-red-500 dark:stroke-flag-red-400"
                        strokeWidth="3"
                        strokeDasharray="100"
                        strokeDashoffset="100"
                        strokeLinecap="round"
                        style={{ animation: "hold-arc 1s linear forwards" }}
                      />
                    </svg>
                  )}
                </button>
              )}
              <Button
                onClick={handleSend}
                disabled={!input.trim() && !pendingCommand}
                size="md"
                className="!bg-deep-space-blue-500 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </Button>
            </div>
            <AnimatePresence>
              {(hasActiveRunTrace || isTyping || hasActiveTools) && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-center text-xs text-gray-400 dark:text-gray-500"
                >
                  Press{" "}
                  <kbd className="theme-border theme-surface-muted rounded border px-1 py-0.5 text-[10px] font-medium">
                    Esc
                  </kbd>{" "}
                  <kbd className="theme-border theme-surface-muted rounded border px-1 py-0.5 text-[10px] font-medium">
                    Esc
                  </kbd>{" "}
                  to interrupt
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
