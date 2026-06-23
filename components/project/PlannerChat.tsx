"use client";

import { cn } from "@/lib/cn";
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, AgentDefinition, Domain } from "@/lib/types";
import {
  useAgents,
  useDomains,
  useAgentDomains,
  useAllAgentDomains,
  useQueryParam,
} from "@/lib/hooks";
import { usePlannerChat } from "@/lib/usePlannerChat";
import { visibleLiveChatRunTrace } from "@/lib/chatInterfaceState";
import { Button } from "@/components/ui/Button";
import { useUser } from "@clerk/nextjs";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { AgentRunTrace } from "@/components/agent-run-trace/AgentRunTrace";
import { agentColorBg, agentColorText } from "@/lib/agent-colors";
import { DomainSlashCommandDropdown } from "./DomainSlashCommandDropdown";
import { DomainIndicator } from "./DomainIndicator";
import { PendingDomainPill } from "./PendingDomainPill";
import ChatSessionList from "./ChatSessionList";


interface PlannerChatProps {
  projectId: string;
}

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

/** Animated message delivery status indicator for user messages. */
const MessageStatusIndicator = memo(function MessageStatusIndicator({
  status,
}: {
  status?: ChatMessage["status"];
}) {
  if (!status) return null;

  if (status === "failed") {
    return (
      <span className="animate-status-in inline-flex items-center gap-1 text-[10px] text-rose-300">
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
          <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  // Show progress loader for both "sending" and "sent" — keep spinning until delivered
  if (status !== "delivered") {
    return (
      <span className="animate-status-in inline-flex items-center gap-1 text-[10px] text-deep-space-blue-300">
        <svg className="h-3 w-3 animate-sending-pulse" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
        </svg>
      </span>
    );
  }

  // delivered
  return (
    <span className="animate-status-in inline-flex items-center gap-1 text-[10px] text-emerald-300">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 16" fill="none">
        <path
          d="M2 8.5l3 3 5-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-check-draw"
        />
        <path
          d="M7 8.5l3 3 5-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-check-draw-delayed"
        />
      </svg>
    </span>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  activeAgent,
  userImageUrl,
  userInitials,
  onDelete,
}: {
  message: ChatMessage;
  activeAgent?: AgentDefinition;
  userImageUrl?: string | null;
  userInitials: string;
  onDelete?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className="group flex items-start gap-3">
      {/* Avatar */}
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

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-deep-space-blue-500 text-white rounded-tl-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 dark:prose-a:text-deep-space-blue-400 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-gray-800 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700 prose-table:text-xs prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  if (className) {
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                  return <code {...props}>{children}</code>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px]",
              isUser ? "text-deep-space-blue-200" : "text-gray-400",
            )}
            suppressHydrationWarning
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isUser && <MessageStatusIndicator status={message.status} />}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-flag-red-500 dark:hover:text-flag-red-400"
              title="Delete message"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244 2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export function PlannerChat({ projectId }: PlannerChatProps) {
  const { user } = useUser();
  const userImageUrl = user?.imageUrl;
  const userInitials = user?.firstName?.[0] ?? "U";

  // Agent targeting state (persisted in URL as ?agent=<id>)
  const [activeAgentId, setActiveAgentId] = useQueryParam("agent");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(0);
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedDomainIndex, setSelectedDomainIndex] = useState(0);
  const [pendingDomain, setPendingDomain] = useState<Domain | null>(null);
  const hasSetDefaultAgent = useRef(false);

  const { agents: allAgents } = useAgents();
  const { agentDomains } = useAgentDomains(activeAgentId);
  const { domains: allDomains } = useDomains();

  // Agents that have a model assigned
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

  // Pre-fetch domain→role mapping for all roles (including system roles without agents)
  const allAgentIds = useMemo(
    () => allAgents?.map((r) => r.id) ?? [],
    [allAgents],
  );
  const { domainToAgentMap } = useAllAgentDomains(allAgentIds);

  const activeAgent = useMemo(
    () =>
      availableAgents.find(
        (a: AgentDefinition) => a.id === activeAgentId,
      ),
    [availableAgents, activeAgentId],
  );

  // Default to "manager" agent on mount (only when URL has no agent param)
  useEffect(() => {
    if (hasSetDefaultAgent.current || activeAgentId || !allAgents) return;
    const managerAgent = allAgents.find(
      (a: AgentDefinition) =>
        a.name.toLowerCase() === "manager" && a.model_id,
    );
    if (managerAgent) {
      setActiveAgentId(managerAgent.id);
    }
    hasSetDefaultAgent.current = true;
  }, [allAgents, activeAgentId, setActiveAgentId]);

  const {
    messages,
    sendMessage,
    deleteMessage,
    isTyping,
    activeRunTrace,
    isLoadingHistory,
    hasMore,
    isLoadingMore,
    loadMore,
    activeDomainSession,
    enterDomain,
    exitDomain,
    cancelDomain,
    cancelResponse,
    activeSessionId,
    sessions,
    isLoadingSessions,
    switchSession,
    createNewSession,
    renameSession,
    archiveSession,
    deleteSession,
  } = usePlannerChat(projectId, activeAgentId);
  const visibleRunTrace = visibleLiveChatRunTrace(activeRunTrace);
  const hasActiveRunTrace = Boolean(visibleRunTrace);

  const [showSessionList, setShowSessionList] = useState(false);

  // Available domains: active role's domains first, then domains from other roles
  const agentDomainsList: Domain[] = useMemo(
    () =>
      (agentDomains ?? [])
        .filter((rm) => rm.enabled && rm.domain)
        .map((rm) => rm.domain!),
    [agentDomains],
  );
  const availableDomains: Domain[] = useMemo(() => {
    const domains = [...agentDomainsList];
    const seen = new Set(domains.map((m) => m.id));
    // Include domains assigned to other roles
    if (allDomains) {
      for (const dm of allDomains) {
        if (!seen.has(dm.id) && domainToAgentMap.has(dm.id)) {
          domains.push(dm);
          seen.add(dm.id);
        }
      }
    }
    return domains.length > 0 ? domains : (allDomains ?? []);
  }, [agentDomainsList, allDomains, domainToAgentMap]);
  // Domains filtered by the current slash-command input
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
  const activeDomainIndex =
    filteredDomains.length > 0
      ? Math.min(selectedDomainIndex, filteredDomains.length - 1)
      : 0;
  const activeAgentIndex =
    filteredAgents.length > 0
      ? Math.min(selectedDropdownIndex, filteredAgents.length - 1)
      : 0;

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hold-to-cancel state
  const [holdProgress, setHoldProgress] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCancelHoldStart = useCallback(() => {
    setHoldProgress(true);
    holdTimerRef.current = setTimeout(() => {
      cancelResponse();
      setHoldProgress(false);
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
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
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

  // Auto-scroll on new messages (skip when loading older messages to preserve position)
  const skipAutoScrollRef = useRef(false);
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, hasActiveRunTrace]);

  // Scroll-to-top pagination: load older messages
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollTop < 80) {
      const prevHeight = el.scrollHeight;
      skipAutoScrollRef.current = true;
      loadMore().then(() => {
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop =
              scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [hasMore, isLoadingMore, loadMore]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Auto-resize textarea inline (avoids extra useEffect render cycle)
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;

    const cursorPos = e.target.selectionStart ?? value.length;

    // Look backwards from cursor for @
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // Show dropdown if no space between @ and cursor
      if (!/\s/.test(textAfterAt)) {
        setShowAgentDropdown(true);
        setMentionFilter(textAfterAt);
        setMentionCursorPos(atIndex);
        setSelectedDropdownIndex(0);
        return;
      }
    }

    setShowAgentDropdown(false);
    setMentionFilter("");

    // Check for # command (only at the start of input)
    if (value.startsWith("#") && activeDomainSession) {
      const domainText = value.slice(1);
      if (!/\s/.test(domainText)) {
        setShowDomainDropdown(true);
        setDomainFilter(domainText);
        setSelectedDomainIndex(0);
        return;
      }
    }

    if (value.startsWith("#") && !activeDomainSession && !pendingDomain) {
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

  const handleDomainSelect = useCallback(
    (domain: Domain) => {
      setPendingDomain(domain);
      setInput("");
      setShowDomainDropdown(false);
      setDomainFilter("");
      inputRef.current?.focus();
    },
    [],
  );

  const handleAgentSelect = (agent: AgentDefinition) => {
    setActiveAgentId(agent.id);
    hasSetDefaultAgent.current = true;

    // Remove the @mention text from input
    const before = input.slice(0, mentionCursorPos);
    const afterMention = input.slice(mentionCursorPos);
    // Find the end of the mention (next space or end of string)
    const mentionMatch = afterMention.match(/^@\S*/);
    const mentionLength = mentionMatch ? mentionMatch[0].length : 0;
    const after = afterMention.slice(mentionLength);
    // Keep any remaining text, trimming leading space
    const remaining = (before + after).replace(/^\s+/, "");
    setInput(remaining);

    setShowAgentDropdown(false);
    setMentionFilter("");
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    // Check for domain exit commands (always allowed)
    if (activeDomainSession) {
      const exitCommands = ["#exit", "#done", "#finish"];
      if (exitCommands.includes(text.toLowerCase())) {
        setInput("");
        exitDomain();
        return;
      }
    }

    // Check for domain enter via # command (always allowed)
    if (pendingDomain && !activeDomainSession) {
      setInput("");
      const ownerAgentId = domainToAgentMap.get(pendingDomain.id);
      if (ownerAgentId && ownerAgentId !== activeAgentId) {
        setActiveAgentId(ownerAgentId);
        hasSetDefaultAgent.current = true;
      }
      enterDomain(
        pendingDomain.id,
        pendingDomain.command,
        ownerAgentId ?? activeAgentId,
        text,
      );
      setPendingDomain(null);
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
        const ownerAgentId = domainToAgentMap.get(matchedDomain.id);
        if (ownerAgentId && ownerAgentId !== activeAgentId) {
          setActiveAgentId(ownerAgentId);
          hasSetDefaultAgent.current = true;
        }
        enterDomain(
          matchedDomain.id,
          matchedDomain.command,
          ownerAgentId ?? activeAgentId,
          userMessage,
        );
        return;
      }
    }

    // Parse @role at start of input (always allowed — switches context)
    const match = text.match(/^@(\S+)\s*([\s\S]*)/);
    if (match) {
      const [, roleName, rest] = match;
      const matchedAgent = availableAgents.find(
        (a: AgentDefinition) =>
          a.name.toLowerCase() === roleName.toLowerCase(),
      );
      if (matchedAgent) {
        setActiveAgentId(matchedAgent.id);
        hasSetDefaultAgent.current = true;
        if (rest.trim()) {
          // Switch role AND send the remaining text
          setInput("");
          sendMessage(rest.trim());
        } else {
          // Just switch role, don't send
          setInput("");
        }
        return;
      }
    }

    sendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Domain dropdown keyboard nav
    if (pendingDomain && !input.trim() && (e.key === "Backspace" || e.key === "Escape")) {
      e.preventDefault();
      setPendingDomain(null);
      return;
    }

    if (showDomainDropdown && activeDomainSession) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDomainDropdown(false);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        setInput("");
        setShowDomainDropdown(false);
        exitDomain();
        return;
      }
    }

    // Domain dropdown keyboard nav
    if (showDomainDropdown && filteredDomains.length > 0 && !activeDomainSession) {
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
        handleDomainSelect(filteredDomains[activeDomainIndex]);
        return;
      }
    }

    // Role dropdown keyboard nav
    if (showAgentDropdown) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAgentDropdown(false);
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
        handleAgentSelect(filteredAgents[activeAgentIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder = activeAgent
    ? `Message @${activeAgent.name ?? "agent"}...`
    : "Ask anything... (type @ to mention an agent)";

  const agentColor = activeAgent?.color;

  return (
    <div className="flex h-[800px] rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-1 flex-col min-w-0">
      {/* Header bar with session toggle */}
      {activeAgentId && (
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowSessionList((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Toggle session list"
          >
            Sessions
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-1.5 font-mono text-xs text-gray-400">
              <span className="tracking-wider">loading</span>
              <span className="animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">&#9612;</span>
            </div>
          </div>
        ) : (
          <>
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <span className="text-xs text-gray-400">
                  Loading older messages...
                </span>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                activeAgent={msg.role === "assistant" ? activeAgent : undefined}
                userImageUrl={userImageUrl}
                userInitials={userInitials}
                onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
              />
            ))}
            {visibleRunTrace && (
              <AgentRunTrace trace={visibleRunTrace} activeAgent={activeAgent} />
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-3 rounded-b-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Active domain indicator */}
        {activeDomainSession && activeAgent && (
          <div className="mb-2">
            <DomainIndicator
              session={activeDomainSession}
              domainName={
                availableDomains.find((m) => m.id === activeDomainSession.domain_id)
                  ?.display_name ?? "Domain"
              }
              domainCommand={
                availableDomains.find((m) => m.id === activeDomainSession.domain_id)
                  ?.command ?? ""
              }
              onExit={exitDomain}
              onCancel={cancelDomain}
              agentColor={agentColor}
            />
          </div>
        )}

        {/* Active role indicator */}
        {activeAgent && (
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={
                agentColor
                  ? {
                      backgroundColor: agentColorBg(agentColor),
                      color: agentColorText(agentColor),
                    }
                  : undefined
              }
            >
              @{activeAgent.name}
              <button
                type="button"
                onClick={() => {
                  setActiveAgentId(undefined);
                  hasSetDefaultAgent.current = true;
                }}
                className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 hover:opacity-100"
              >
                <svg
                  className="h-2.5 w-2.5"
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
            </span>
          </div>
        )}

        <div className="relative">
          {/* Domain command dropdown */}
          {showDomainDropdown && (filteredDomains.length > 0 || activeDomainSession) && (
            <DomainSlashCommandDropdown
              domains={filteredDomains}
              selectedIndex={activeDomainIndex}
              onSelect={handleDomainSelect}
              onClose={() => setShowDomainDropdown(false)}
              anchorRef={inputRef}
              accentColor={agentColor}
              exitMode={!!activeDomainSession}
              onExitDomain={() => {
                setInput("");
                setShowDomainDropdown(false);
                exitDomain();
              }}
            />
          )}

          {/* Role autocomplete dropdown */}
          {showAgentDropdown && filteredAgents.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 z-[100] w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
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
                      index === activeAgentIndex
                        ? "bg-gray-100 dark:bg-gray-700"
                        : "hover:bg-gray-50 dark:hover:bg-gray-750",
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

          <div className="flex items-end gap-2">
            <div className="flex min-h-10 flex-1 items-end gap-2 rounded-lg border border-gray-300 px-2 py-1.5 focus-within:border-deep-space-blue-500 focus-within:ring-1 focus-within:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-900">
              {pendingDomain && (
                <PendingDomainPill
                  domain={pendingDomain}
                  onClear={() => setPendingDomain(null)}
                  accentColor={agentColor}
                  className="mb-0.5"
                />
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={pendingDomain ? "Describe what to do in this domain..." : placeholder}
                rows={1}
                className="min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-gray-400 focus:outline-hidden focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
                style={{ maxHeight: 200 }}
              />
            </div>
            {isTyping && (
              <button
                onMouseDown={handleCancelHoldStart}
                onMouseUp={handleCancelHoldEnd}
                onMouseLeave={handleCancelHoldEnd}
                onTouchStart={handleCancelHoldStart}
                onTouchEnd={handleCancelHoldEnd}
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flag-red-100 hover:bg-flag-red-200 text-flag-red-600 dark:bg-flag-red-900/40 dark:hover:bg-flag-red-800/50 dark:text-flag-red-400 transition-colors"
                title="Hold for 1 second to cancel"
              >
                {/* Square stop icon */}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                {/* Idle pulse ring */}
                {!holdProgress && (
                  <span className="absolute inset-0 rounded-lg border-2 border-flag-red-400 dark:border-flag-red-500 animate-cancel-pulse" />
                )}
                {/* Hold-progress arc */}
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
              disabled={!input.trim()}
              size="md"
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
          {isTyping && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              Press <kbd className="rounded border border-gray-300 px-1 py-0.5 text-[10px] font-medium dark:border-gray-600">Esc</kbd>{" "}
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-[10px] font-medium dark:border-gray-600">Esc</kbd>{" "}
              to interrupt
            </p>
          )}
        </div>
      </div>
      </div>{/* end flex-1 wrapper */}

      {/* Session sidebar (right) */}
      {showSessionList && activeAgentId && (
        <div className="w-64 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <ChatSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={isLoadingSessions}
            onSwitch={(id) => { switchSession(id); }}
            onCreate={createNewSession}
            onRename={renameSession}
            onArchive={archiveSession}
            onDelete={deleteSession}
          />
        </div>
      )}
    </div>
  );
}
