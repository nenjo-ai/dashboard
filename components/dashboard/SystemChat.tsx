"use client";

import { cn } from "@/lib/cn";
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, AgentDefinition, Domain } from "@/lib/types";
import {
  useAgents,
  useAgentDomains,
  useDomains,
} from "@/lib/hooks";
import { usePlannerChat } from "@/lib/usePlannerChat";
import { useUser } from "@clerk/nextjs";
import { SystemRoleIcon } from "@/components/ui/SystemRoleIcon";
import { DomainSlashCommandDropdown } from "@/components/project/DomainSlashCommandDropdown";
import { DomainIndicator } from "@/components/project/DomainIndicator";
import { PendingDomainPill } from "@/components/project/PendingDomainPill";
import ChatSessionList from "@/components/project/ChatSessionList";
import { findNenjiAgent, isNenjiAgent } from "@/lib/nenjiAgent";

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
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-deep-space-blue-100 text-[10px] font-bold text-deep-space-blue-700">
      {initials}
    </div>
  );
}

const SystemMessageBubble = memo(function SystemMessageBubble({
  message,
  systemAgent,
  userImageUrl,
  userInitials,
}: {
  message: ChatMessage;
  systemAgent?: AgentDefinition;
  userImageUrl?: string | null;
  userInitials: string;
}) {
  const isUser = message.role === "user";

  return (
    <div className="group flex items-start gap-2">
      {isUser ? (
        <UserAvatar imageUrl={userImageUrl} initials={userInitials} />
      ) : systemAgent ? (
        <SystemRoleIcon size={28} className="shrink-0" />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          S
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
          isUser
            ? "bg-deep-space-blue-500 text-white rounded-tl-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-1.5 prose-headings:text-sm prose-headings:font-semibold prose-p:text-[13px] prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-gray-800 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 prose-li:text-[13px] prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-1.5">
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
          {isUser && message.status && (
            <span className={cn(
              "animate-status-in inline-flex items-center gap-0.5 text-[10px]",
              message.status === "delivered"
                ? "text-emerald-300"
                : message.status === "failed"
                  ? "text-rose-300"
                  : "text-deep-space-blue-300",
            )}>
              {message.status !== "delivered" && message.status !== "failed" && (
                <svg className="h-2.5 w-2.5 animate-sending-pulse" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
                </svg>
              )}
              {message.status === "failed" && (
                <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="none">
                  <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {message.status === "delivered" && (
                <svg className="h-3 w-3" viewBox="0 0 20 16" fill="none">
                  <path d="M2 8.5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw" />
                  <path d="M7 8.5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw-delayed" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

const SystemTypingIndicator = memo(function SystemTypingIndicator({ systemAgent }: { systemAgent?: AgentDefinition }) {
  return (
    <div className="flex items-start gap-2">
      {systemAgent ? (
        <SystemRoleIcon size={28} className="shrink-0" animate />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          S
        </div>
      )}
      <div className="rounded-lg rounded-tl-sm border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-1.5 font-mono text-xs text-gray-400">
          <span className="tracking-wider">thinking</span>
          <span className="animate-blink-cursor text-base leading-none text-violet-500 dark:text-violet-400">
            &#9612;
          </span>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SystemChat() {
  const { user } = useUser();
  const userImageUrl = user?.imageUrl;
  const userInitials = user?.firstName?.[0] ?? "U";

  const { agents: allAgentDefs } = useAgents();
  const { domains: allDomains } = useDomains();

  // Find Nenji (versioned package slug or legacy), once a model is assigned.
  const systemAgent = useMemo(() => {
    const withModel = (allAgentDefs ?? []).filter(
      (agent: AgentDefinition) => isNenjiAgent(agent) && agent.model_id,
    );
    return findNenjiAgent(withModel) ?? findNenjiAgent(allAgentDefs);
  }, [allAgentDefs]);

  const systemAgentId = systemAgent?.id;
  const { agentDomains } = useAgentDomains(systemAgentId);

  // Available domains for the platform assistant.
  const availableDomains = useMemo(() => {
    if (!agentDomains) return [];
    return agentDomains
      .filter((rm) => rm.enabled)
      .map((rm) => rm.domain ?? allDomains?.find((m) => m.id === rm.domain_id))
      .filter((domain): domain is Domain => Boolean(domain));
  }, [agentDomains, allDomains]);

  // General chat is projectless and uses the worker's root workspace.
  const chat = usePlannerChat(null, systemAgentId ?? undefined);

  const [showSessionList, setShowSessionList] = useState(false);

  // Refs and state
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedDomainIndex, setSelectedDomainIndex] = useState(0);
  const [pendingDomain, setPendingDomain] = useState<Domain | null>(null);

  // Pre-filter domains by the current filter
  const filteredDomains = useMemo(
    () =>
      availableDomains.filter((m) =>
        m.command.toLowerCase().includes(domainFilter.toLowerCase()),
      ),
    [availableDomains, domainFilter],
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.isTyping]);

  // Handle sending a message
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || !systemAgentId) return;

    // Check for domain exit commands
    if (chat.activeDomainSession && ["#exit", "#done", "#finish"].includes(text.toLowerCase())) {
      chat.exitDomain();
      setInputValue("");
      return;
    }

    if (pendingDomain && !chat.activeDomainSession) {
      chat.enterDomain(pendingDomain.id, pendingDomain.command, systemAgentId, text);
      setInputValue("");
      setPendingDomain(null);
      return;
    }

    if (text.startsWith("#") && !chat.activeDomainSession && availableDomains.length > 0) {
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
        chat.enterDomain(matchedDomain.id, matchedDomain.command, systemAgentId, userMessage);
        setInputValue("");
        return;
      }
    }

    chat.sendMessage(text);
    setInputValue("");

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputValue, systemAgentId, chat, availableDomains, pendingDomain]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pendingDomain && !inputValue.trim() && (e.key === "Backspace" || e.key === "Escape")) {
      e.preventDefault();
      setPendingDomain(null);
      return;
    }

    // Handle domain dropdown keyboard navigation
    if (showDomainDropdown && chat.activeDomainSession) {
      if (e.key === "Escape") {
        setShowDomainDropdown(false);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        setInputValue("");
        setShowDomainDropdown(false);
        chat.exitDomain();
        return;
      }
    }

    // Handle domain dropdown keyboard navigation
    if (showDomainDropdown && filteredDomains.length > 0 && !chat.activeDomainSession) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedDomainIndex((prev) => Math.min(prev + 1, filteredDomains.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedDomainIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && filteredDomains[selectedDomainIndex]) {
        e.preventDefault();
        const dm = filteredDomains[selectedDomainIndex];
        setPendingDomain(dm);
        setInputValue("");
        setShowDomainDropdown(false);
        inputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        setShowDomainDropdown(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";

    // Detect # for domain commands
    if (chat.activeDomainSession && value.startsWith("#") && !value.includes(" ")) {
      setShowDomainDropdown(true);
      setDomainFilter(value.slice(1));
      setSelectedDomainIndex(0);
      return;
    }

    // Detect # for domain commands
    if (!pendingDomain && (value === "#" || (value.startsWith("#") && !value.includes(" ")))) {
      setShowDomainDropdown(true);
      setDomainFilter(value.slice(1));
      setSelectedDomainIndex(0);
      return;
    }

    setShowDomainDropdown(false);
  };

  // Not ready states
  if (!systemAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
          <svg className="h-6 w-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Nenji
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Assign a model to <strong>Nenji</strong> to enable the platform assistant.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full rounded-xl border border-gray-200 bg-gray-50 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-1 flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        {systemAgent && (
          <SystemRoleIcon size={24} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Nenji
          </h3>
        </div>
        {(chat.isTyping || chat.hasActiveChatRequest) && (
          <button
            type="button"
            onClick={chat.cancelResponse}
            className="rounded-md px-2 py-1 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-flag-red-500 dark:hover:bg-gray-700 dark:hover:text-flag-red-400"
            title="Cancel response"
          >
            Stop
          </button>
        )}
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

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chat.isLoadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-gray-400">Loading history...</span>
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Ask me about your platform setup, routine design, prompt engineering, or type{" "}
              <code className="rounded-sm bg-gray-100 px-1 py-0.5 font-mono text-violet-600 dark:bg-gray-700 dark:text-violet-400">
                #creator
              </code>{" "}
              to modify resources.
            </p>
          </div>
        ) : (
          chat.messages.map((msg) => (
            <SystemMessageBubble
              key={msg.id}
              message={msg}
              systemAgent={systemAgent}
              userImageUrl={userImageUrl}
              userInitials={userInitials}
            />
          ))
        )}

          {(chat.isTyping || chat.hasActiveChatRequest) && (
          <SystemTypingIndicator systemAgent={systemAgent} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        {showDomainDropdown && (filteredDomains.length > 0 || chat.activeDomainSession) && (
          <DomainSlashCommandDropdown
            domains={filteredDomains}
            selectedIndex={selectedDomainIndex}
            onSelect={(domain) => {
              setPendingDomain(domain);
              setInputValue("");
              setShowDomainDropdown(false);
              inputRef.current?.focus();
            }}
            onClose={() => setShowDomainDropdown(false)}
            anchorRef={inputRef}
            accentColor={systemAgent?.color}
            exitMode={!!chat.activeDomainSession}
            onExitDomain={() => {
              setInputValue("");
              setShowDomainDropdown(false);
              chat.exitDomain();
            }}
          />
        )}

        {chat.activeDomainSession && (
          <div className="mb-2">
            <DomainIndicator
              session={chat.activeDomainSession}
              domainName={
                availableDomains.find((m) => m.id === chat.activeDomainSession?.domain_id)
                  ?.name ?? "Domain"
              }
              domainCommand={
                availableDomains.find((m) => m.id === chat.activeDomainSession?.domain_id)
                  ?.command ?? ""
              }
              onExit={chat.exitDomain}
              onCancel={chat.cancelDomain}
              agentColor={systemAgent?.color}
            />
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex min-h-9 flex-1 items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-400 dark:border-gray-600 dark:bg-gray-900 dark:focus:border-violet-500 dark:focus:ring-violet-500">
            {pendingDomain && (
              <PendingDomainPill
                domain={pendingDomain}
                onClear={() => setPendingDomain(null)}
                accentColor={systemAgent?.color}
                className="mb-0.5"
              />
            )}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                chat.activeDomainSession
                  ? "Message in domain session..."
                  : pendingDomain
                    ? "Describe what to do in this domain..."
                    : "Ask about your platform..."
              }
              rows={1}
              className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-0.5 text-sm text-gray-900 placeholder-gray-400 outline-hidden focus:ring-0 dark:text-gray-100 dark:placeholder-gray-500"
              style={{ maxHeight: 120 }}
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim() || !systemAgentId}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-violet-500 dark:hover:bg-violet-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
      </div>{/* end flex-1 wrapper */}

      {/* Session sidebar (right) */}
      {showSessionList && (
        <div className="w-56 shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-hidden">
          <ChatSessionList
            sessions={chat.sessions}
            activeSessionId={chat.activeSessionId}
            isLoading={chat.isLoadingSessions}
            onSwitch={(id) => chat.switchSession(id)}
            onCreate={chat.createNewSession}
            onRename={chat.renameSession}
            onArchive={chat.archiveSession}
            onDelete={chat.deleteSession}
          />
        </div>
      )}
    </div>
  );
}
