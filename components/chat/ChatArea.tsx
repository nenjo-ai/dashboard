"use client";

import { cn } from "@/lib/cn";
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useSWR from "swr";
import type { ChatMessage, AgentDefinition, ChatSessionExtended, Domain } from "@/lib/types";
import {
  useAgents,
  useAgentDomains,
  useProjects,
  useSystemProject,
} from "@/lib/hooks";
import { fetcher, allChatSessionsUrl, createChatSession } from "@/lib/api";
import type { Project } from "@/lib/types";
import { usePlannerChat } from "@/lib/usePlannerChat";
import { useWebSocketContext } from "@/lib/WebSocketContext";
import { useUser } from "@clerk/nextjs";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { DomainSlashCommandDropdown } from "@/components/project/DomainSlashCommandDropdown";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "motion/react";

interface ChatAreaProps {
  projectId: string;
  agentId: string;
  sessionId: string | null;
  /** Navigate to a different session (from @mention agent→session picker). */
  onNavigateToSession?: (sessionId: string) => void;
  /** Called after creating a new session via @mention → new chat flow. */
  onSessionCreated?: () => void;
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
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 12" strokeLinecap="round" />
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
          <path d="M4 8.5l4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw" />
        </svg>
        Sent
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 12" strokeLinecap="round" />
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
        <path d="M2 8.5l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw" />
        <path d="M7 8.5l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw-delayed" />
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
      {/* Avatar — hidden on mobile */}
      <div className="hidden md:block">
        {isUser ? (
          <UserAvatar imageUrl={userImageUrl} initials={userInitials} />
        ) : activeAgent ? (
          <RoleIdenticon roleId={activeAgent.id} color={activeAgent.color} size={32} className="shrink-0" roleName={activeAgent.name} />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-tangerine-100 text-xs font-bold text-vivid-tangerine-700">AI</div>
        )}
      </div>
      <div
        className={cn(
          "rounded-xl px-4 py-2.5 text-sm leading-relaxed overflow-hidden break-words",
          "max-w-full md:max-w-[75%]",
          isUser
            ? "bg-deep-space-blue-500 text-white rounded-tl-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-all prose-pre:bg-gray-800 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:text-xs prose-pre:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:break-normal prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700 prose-table:text-xs prose-table:overflow-x-auto prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  if (className) {
                    return <code className={className} {...props}>{children}</code>;
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
            className={cn("text-[10px]", isUser ? "text-deep-space-blue-200" : "text-gray-400")}
            suppressHydrationWarning
          >
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

type ToolEntry = { name: string; args: string; textPreview?: string; status?: "running" | "completed" | "failed"; outputPreview?: string; errorPreview?: string; children?: ToolEntry[] };

const TypingIndicator = memo(function TypingIndicator({ activeAgent, tools, preview }: { activeAgent?: AgentDefinition; tools?: ToolEntry[]; preview?: string }) {
  const hasTools = tools && tools.length > 0;
  const textPreview = preview?.trim() || tools?.find((tool) => tool.textPreview?.trim())?.textPreview?.trim();
  return (
    <div className="flex items-start gap-3">
      {activeAgent ? (
        <RoleIdenticon roleId={activeAgent.id} color={activeAgent.color} size={32} className="shrink-0" animate={true} roleName={activeAgent.name} />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-tangerine-100 text-xs font-bold text-vivid-tangerine-700">AI</div>
      )}
      <div className="rounded-xl rounded-tl-sm border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800">
        {textPreview ? (
          <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {textPreview}
            <span className="ml-1 animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">&#9612;</span>
          </div>
        ) : (
          <div className="flex items-center font-mono text-xs text-gray-400">
            <span className="animate-blink-cursor text-base leading-none text-deep-space-blue-500 dark:text-deep-space-blue-400">&#9612;</span>
          </div>
        )}
        {hasTools && (
          <div className="mt-1.5 flex flex-col gap-1">
            {tools.map((tool, i) => (
              <div key={tool.name + i} className="flex items-start gap-1.5 text-[11px] leading-tight">
                <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-deep-space-blue-400 animate-pulse" />
                <div className="min-w-0">
                  <span className="font-medium text-gray-500 dark:text-gray-400">{tool.name}</span>
                  {tool.status === "completed" && <span className="ml-1.5 text-emerald-500/80 dark:text-emerald-400/80">done</span>}
                  {tool.status === "failed" && <span className="ml-1.5 text-flag-red-500/80 dark:text-flag-red-400/80">failed</span>}
                  {tool.args && (
                    <span className="ml-1.5 text-gray-400/70 dark:text-gray-500/70">{tool.args}</span>
                  )}
                  {(tool.outputPreview || tool.errorPreview) && (
                    <div className="mt-0.5 text-[10px] text-gray-400/80 dark:text-gray-500/80">
                      {tool.errorPreview ?? tool.outputPreview}
                    </div>
                  )}
                  {tool.children && tool.children.length > 0 && (
                    <div className="mt-1.5 ml-3 flex flex-col gap-1 border-l border-gray-200 pl-3 dark:border-gray-700">
                      {tool.children.map((child, childIndex) => (
                        <div key={`${child.name}-${childIndex}`} className="flex items-start gap-1.5 text-[10px] leading-tight">
                          <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-vivid-tangerine-400" />
                          <div className="min-w-0">
                            <span className="font-medium text-gray-500 dark:text-gray-400">{child.name}</span>
                            {child.status === "completed" && <span className="ml-1 text-emerald-500/80 dark:text-emerald-400/80">done</span>}
                            {child.status === "failed" && <span className="ml-1 text-flag-red-500/80 dark:text-flag-red-400/80">failed</span>}
                            {child.args && (
                              <span className="ml-1 text-gray-400/70 dark:text-gray-500/70">{child.args}</span>
                            )}
                            {(child.outputPreview || child.errorPreview) && (
                              <div className="mt-0.5 text-[10px] text-gray-400/80 dark:text-gray-500/80">
                                {child.errorPreview ?? child.outputPreview}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChatArea({ projectId, agentId, sessionId, onNavigateToSession, onSessionCreated }: ChatAreaProps) {
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
  const [selectedMentionAgent, setSelectedMentionAgent] = useState<AgentDefinition | null>(null);
  const [sessionPickerIndex, setSessionPickerIndex] = useState(0);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const [showDomainDropdown, setShowDomainDropdown] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedDomainIndex, setSelectedDomainIndex] = useState(0);

  const { agents: allAgents } = useAgents();
  const { agentDomains } = useAgentDomains(agentId);
  const { projects } = useProjects();
  const { project: systemProject } = useSystemProject();

  // All projects including system (shown as "General") for the new chat project picker
  const userProjects = useMemo<Project[]>(() => {
    const list: Project[] = [];
    if (systemProject) list.push(systemProject);
    if (projects) list.push(...projects);
    return list;
  }, [projects, systemProject]);

  // All sessions (for the session picker after @mention agent selection)
  const { data: allSessions, mutate: mutateSessions } = useSWR<ChatSessionExtended[]>(
    selectedMentionAgent ? allChatSessionsUrl() : null,
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
    return availableAgents.filter((a: AgentDefinition) => a.name.toLowerCase().includes(lower));
  }, [availableAgents, mentionFilter]);

  // Sessions for the selected @mention agent, sorted by most recent
  const mentionAgentSessions = useMemo(() => {
    if (!selectedMentionAgent || !allSessions) return [];
    return allSessions.filter((s) => s.agent_id === selectedMentionAgent.id);
  }, [selectedMentionAgent, allSessions]);


  const activeAgent = useMemo(
    () => availableAgents.find((a: AgentDefinition) => a.id === agentId),
    [availableAgents, agentId],
  );

  useEffect(() => { setSelectedDropdownIndex(0); }, [filteredAgents]);

  const {
    messages, sendMessage, deleteMessage, isTyping, activeTools, livePreview, isLoadingHistory,
    hasMore, isLoadingMore, loadMore,
    activeDomainSession, isDomainPending, enterDomain, exitDomain, cancelResponse,
  } = usePlannerChat(projectId, agentId, sessionId ?? undefined);
  const hasActiveTools = activeTools.length > 0;

  // Pick up welcome greeting from onboarding flow.
  // Sends directly via websocket so the user's prompt doesn't appear in chat —
  // only the agent's response shows up, making it feel like a natural greeting.
  const { send: wsSend, status: wsStatus } = useWebSocketContext();
  const greetingSent = useRef(false);
  useEffect(() => {
    if (greetingSent.current || !sessionId || isLoadingHistory) return;
    if (wsStatus !== "connected") return;
    try {
      const raw = sessionStorage.getItem("nenjo:welcome_greeting");
      if (!raw) return;
      const greeting = JSON.parse(raw) as {
        session_id: string;
        project_id: string;
        agent_id: string;
        message: string;
      };
      if (greeting.session_id !== sessionId) return;
      greetingSent.current = true;
      sessionStorage.removeItem("nenjo:welcome_greeting");
      // Send directly over websocket — no user message in chat history
      setTimeout(() => {
        wsSend({
          type: "chat.message",
          id: `welcome-${Date.now()}`,
          project_id: greeting.project_id,
          agent_id: greeting.agent_id,
          session_id: greeting.session_id,
          content: greeting.message,
          hidden: true,
          timestamp: new Date().toISOString(),
        });
      }, 300);
    } catch {
      // ignore malformed data
    }
  }, [sessionId, isLoadingHistory, wsSend, wsStatus]);

  // Domains
  const agentDomainsList: Domain[] = useMemo(
    () => (agentDomains ?? []).filter((rm) => rm.enabled && rm.domain).map((rm) => rm.domain!),
    [agentDomains],
  );
  // Only show domains assigned to the current agent
  const availableDomains: Domain[] = agentDomainsList;

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

  useEffect(() => { setSelectedDomainIndex(0); }, [filteredDomains]);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Track message count for animation stagger logic
  const prevMessageCountRef = useRef(0);
  useEffect(() => { prevMessageCountRef.current = messages.length; }, [messages.length]);

  // Auto-focus input on mount
  useEffect(() => {
    // Small delay to let the DOM settle after route transition
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Hold-to-cancel
  const [holdProgress, setHoldProgress] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCancelHoldStart = useCallback(() => {
    setHoldProgress(true);
    holdTimerRef.current = setTimeout(() => {
      cancelResponse();
      setHoldProgress(false);
    }, 2000);
  }, [cancelResponse]);

  const handleCancelHoldEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(false);
  }, []);

  useEffect(() => {
    return () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); };
  }, []);

  // Auto-scroll
  const skipAutoScrollRef = useRef(false);
  useEffect(() => {
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
    if (scrollRef.current) { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }
  }, [messages, isTyping, activeTools]);

  // Scroll-to-top pagination
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollTop < 80) {
      const prevHeight = el.scrollHeight;
      skipAutoScrollRef.current = true;
      loadMore().then(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [hasMore, isLoadingMore, loadMore]);

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

    if (value.startsWith("#") && !activeDomainSession) {
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
      setInput("");
      setShowDomainDropdown(false);
      setDomainFilter("");
      enterDomain(domain.id, domain.command, agentId);
    },
    [enterDomain, agentId],
  );

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
  const handleSessionSelect = useCallback((session: ChatSessionExtended) => {
    closeMentionFlow();
    onNavigateToSession?.(session.id);
  }, [closeMentionFlow, onNavigateToSession]);

  // Step 2 → Step 3: user picks "+ New chat" → show project picker
  const handleNewChatFromMention = useCallback(() => {
    setMentionStep("project");
    setSessionPickerIndex(0);
  }, []);

  // Step 3: user selects a project → create session and navigate
  const handleProjectSelect = useCallback(async (project: Project) => {
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
        project_id: project.id,
        agent_id: selectedMentionAgent.id,
        title,
      });

      closeMentionFlow();
      await mutateSessions();
      onSessionCreated?.();
      onNavigateToSession?.(newSession.id);
    } catch (err) {
      console.error("Failed to create chat:", err);
    } finally {
      setIsCreatingChat(false);
    }
  }, [selectedMentionAgent, isCreatingChat, mentionAgentSessions, closeMentionFlow, mutateSessions, onSessionCreated, onNavigateToSession]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    // Close any open mention flow
    closeMentionFlow();

    if (activeDomainSession) {
      const exitCommands = ["#exit", "#done", "#finish"];
      if (exitCommands.includes(text.toLowerCase())) {
        setInput("");
        exitDomain();
        return;
      }
    }

    if (text.startsWith("#") && !activeDomainSession && availableDomains.length > 0) {
      const matchedDomain = availableDomains.find((m) => m.command.toLowerCase() === text.toLowerCase());
      if (matchedDomain) {
        setInput("");
        enterDomain(matchedDomain.id, matchedDomain.command, agentId);
        return;
      }
    }

    if (isTyping) return;
    sendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Domain dropdown keyboard nav
    if (showDomainDropdown && filteredDomains.length > 0) {
      if (e.key === "Escape") { e.preventDefault(); setShowDomainDropdown(false); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedDomainIndex((prev) => prev < filteredDomains.length - 1 ? prev + 1 : 0); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedDomainIndex((prev) => prev > 0 ? prev - 1 : filteredDomains.length - 1); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); handleDomainSelect(filteredDomains[selectedDomainIndex]); return; }
    }

    // Step 3: Project picker keyboard nav
    if (selectedMentionAgent && mentionStep === "project") {
      const totalItems = userProjects.length;
      if (totalItems > 0) {
        if (e.key === "Escape") { e.preventDefault(); setMentionStep("session"); setSessionPickerIndex(0); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setSessionPickerIndex((prev) => prev < totalItems - 1 ? prev + 1 : 0); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSessionPickerIndex((prev) => prev > 0 ? prev - 1 : totalItems - 1); return; }
        if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); handleProjectSelect(userProjects[sessionPickerIndex]); return; }
      } else {
        if (e.key === "Escape") { e.preventDefault(); closeMentionFlow(); return; }
      }
    }

    // Step 2: Session picker keyboard nav (index 0 = "+ New chat", rest = sessions)
    if (selectedMentionAgent && mentionStep === "session") {
      const totalItems = mentionAgentSessions.length + 1; // +1 for "New chat"
      if (e.key === "Escape") { e.preventDefault(); closeMentionFlow(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSessionPickerIndex((prev) => prev < totalItems - 1 ? prev + 1 : 0); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSessionPickerIndex((prev) => prev > 0 ? prev - 1 : totalItems - 1); return; }
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
      if (e.key === "Escape") { e.preventDefault(); closeMentionFlow(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedDropdownIndex((prev) => prev < filteredAgents.length - 1 ? prev + 1 : 0); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedDropdownIndex((prev) => prev > 0 ? prev - 1 : filteredAgents.length - 1); return; }
      if ((e.key === "Tab" || e.key === "Enter") && filteredAgents.length > 0) { e.preventDefault(); handleAgentSelect(filteredAgents[selectedDropdownIndex]); return; }
    }

    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const placeholder = activeAgent
    ? `Message @${activeAgent.name}... (type @ to switch agent)`
    : "Ask anything... (type @ to pick an agent)";

  const agentColor = activeAgent?.color;
  const inDomain = !!activeDomainSession && !!agentColor;

  // Track domain border animation phase: null → "enter" → "idle" → "exit" → null
  const [borderPhase, setBorderPhase] = useState<"enter" | "idle" | "exit" | null>(null);
  const prevInDomainRef = useRef(false);

  useEffect(() => {
    if (inDomain && !prevInDomainRef.current) {
      // Enter — the enter + idle animations are chained in CSS, no phase swap needed
      setBorderPhase("enter");
      // Refocus the input after domain expansion
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!inDomain && prevInDomainRef.current) {
      setBorderPhase("exit");
      setTimeout(() => inputRef.current?.focus(), 50);
      const timer = setTimeout(() => setBorderPhase(null), 2250);
      return () => clearTimeout(timer);
    }
    prevInDomainRef.current = inDomain;
  }, [inDomain]);

  useEffect(() => { prevInDomainRef.current = inDomain; });

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
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg">
      {/* Conic-gradient border with animated position — entry, idle pulse at top, exit */}
      {borderPhase && agentColor && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-lg"
          style={{
            padding: '2px',
            background: `conic-gradient(from var(--border-angle, 45deg), transparent 30%, ${agentColor}60 45%, ${agentColor} 50%, ${agentColor}60 55%, transparent 70%)`,
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            animation: borderPhase === "enter"
              ? 'domain-border-enter 3.25s ease-in-out forwards'
              : borderPhase === "exit"
              ? 'domain-border-exit 2s ease-in forwards'
              : 'domain-border-idle 6s linear infinite',
          }}
        />
      )}

      {/* Domain banner at top — appears after border animation settles */}
      <AnimatePresence>
        {showDomainBanner && activeDomainSession && activeAgent && (() => {
          const activeDomain = availableDomains.find((m) => m.id === activeDomainSession.domain_id);
          return (
            <motion.div
              key="domain-banner"
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0, transition: { duration: 1, ease: "easeIn" } }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="shrink-0 overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-4 py-2"
                style={agentColor ? {
                  background: `linear-gradient(90deg, ${agentColor}08 0%, ${agentColor}15 50%, ${agentColor}08 100%)`,
                } : undefined}
              >
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={agentColor ? { backgroundColor: `${agentColor}20`, color: agentColor } : undefined}
                >
                  {activeDomain?.command ?? "/domain"} · {activeDomain?.display_name ?? "Domain"}
                </span>
                <button
                  type="button"
                  onClick={exitDomain}
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  title="Exit domain"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
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
                <span className="text-xs text-gray-400">Loading older messages...</span>
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => {
                // Stagger on bulk load (session switch), instant for incremental messages
                const isBulkLoad = prevMessageCountRef.current === 0 || (messages.length > 2 && i < messages.length - 2);
                const staggerDelay = isBulkLoad ? Math.min(i * 0.03, 0.3) : 0;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut", delay: staggerDelay }}
                  >
                    <MessageBubble
                      message={msg}
                      activeAgent={msg.role === "assistant" ? activeAgent : undefined}
                      userImageUrl={userImageUrl}
                      userInitials={userInitials}
                      onDelete={msg.id !== "welcome" ? deleteMessage : undefined}
                    />
                  </motion.div>
                );
              })}
              {(isTyping || hasActiveTools) && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <TypingIndicator activeAgent={activeAgent} tools={activeTools} preview={livePreview} />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Bottom spacer so typing indicator is never clipped by input */}
            <div className="h-2 shrink-0" />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="relative">
          {showDomainDropdown && filteredDomains.length > 0 && (
            <DomainSlashCommandDropdown
              domains={filteredDomains}
              selectedIndex={selectedDomainIndex}
              onSelect={handleDomainSelect}
              onClose={() => setShowDomainDropdown(false)}
              anchorRef={inputRef}
            />
          )}

          {/* @mention navigation: Step 2 (session picker) or Step 3 (project picker) */}
          {selectedMentionAgent && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 z-50 w-80 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Header showing selected agent */}
              <div className="sticky top-0 flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-850">
                <RoleIdenticon roleId={selectedMentionAgent.id} color={selectedMentionAgent.color} size={18} className="shrink-0" roleName={selectedMentionAgent.name} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  @{selectedMentionAgent.name}
                </span>
                <span className="text-xs text-gray-400">
                  — {mentionStep === "project" ? "pick a project" : "pick a session"}
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
                  title={mentionStep === "project" ? "Back to sessions" : "Close"}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    {mentionStep === "project" ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    )}
                  </svg>
                </button>
              </div>

              {mentionStep === "session" ? (
                <>
                  {/* "+ New chat" row — always first */}
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleNewChatFromMention(); }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      sessionPickerIndex === 0
                        ? "bg-deep-space-blue-500 text-white"
                        : "hover:bg-gray-50 dark:hover:bg-gray-750",
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">New chat</span>
                  </button>

                  {/* Existing sessions */}
                  {mentionAgentSessions.map((session, index) => (
                    <button
                      key={session.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSessionSelect(session); }}
                      className={cn(
                        "flex w-full flex-col px-3 py-2 text-left transition-colors",
                        index + 1 === sessionPickerIndex
                          ? "bg-deep-space-blue-500 text-white"
                          : "hover:bg-gray-50 dark:hover:bg-gray-750",
                      )}
                    >
                      <span className={cn(
                        "truncate text-sm font-medium",
                        index + 1 === sessionPickerIndex ? "text-white" : "text-gray-900 dark:text-gray-100",
                      )}>
                        {session.title}
                      </span>
                      <span className={cn(
                        "mt-0.5 flex items-center gap-1.5 text-[11px]",
                        index + 1 === sessionPickerIndex ? "text-deep-space-blue-100" : "text-gray-500 dark:text-gray-400",
                      )}>
                        <span className="truncate">{session.project_name === "__system__" ? "General" : session.project_name}</span>
                        <span>·</span>
                        <span className="shrink-0">{timeAgo(session.updated_at)}</span>
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
                        key={project.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleProjectSelect(project); }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                          index === sessionPickerIndex
                            ? "bg-deep-space-blue-500 text-white"
                            : "hover:bg-gray-50 dark:hover:bg-gray-750",
                        )}
                      >
                        <span className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                          index === sessionPickerIndex
                            ? "bg-deep-space-blue-500 text-white"
                            : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
                        )}>
                          {project.is_system ? "G" : project.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                          {project.is_system ? "General" : project.name}
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
          {showAgentDropdown && !selectedMentionAgent && filteredAgents.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              {filteredAgents.map((agent: AgentDefinition, index: number) => (
                <button
                  key={agent.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleAgentSelect(agent); }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    index === selectedDropdownIndex
                      ? "bg-gray-100 dark:bg-gray-700"
                      : "hover:bg-gray-50 dark:hover:bg-gray-750",
                  )}
                >
                  <RoleIdenticon roleId={agent.id} color={agent.color} size={20} className="shrink-0" roleName={agent.name} />
                  <span className="font-medium text-gray-900 dark:text-gray-100">@{agent.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              {/* Domain input border animation */}
              {borderPhase && agentColor && (
                <div
                  className="pointer-events-none absolute inset-0 z-10 rounded-lg"
                  style={{
                    padding: '1px',
                    background: borderPhase === "exit"
                      ? `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 30%), ${agentColor} calc(var(--input-border-pos, 100%) - var(--input-idle-spread, 30%)), transparent var(--input-border-pos, 100%))`
                      : `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 0%), ${agentColor} calc(var(--input-border-pos, 0%) - var(--input-idle-spread, 0%)), transparent var(--input-border-pos, 0%))`,
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'exclude',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    animation: borderPhase === "exit"
                      ? 'input-border-exit 2.25s ease-in forwards'
                      : 'input-border-enter 2.25s ease-in-out forwards, input-border-idle 6s linear 2.25s infinite',
                  }}
                />
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isDomainPending ? "Activating domain..." : placeholder}
                disabled={isDomainPending}
                rows={1}
                className={cn(
                  "w-full resize-none overflow-y-auto rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-hidden dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500",
                  borderPhase
                    ? "border border-transparent"
                    : "border border-gray-300 focus:border-deep-space-blue-500 focus:ring-1 focus:ring-deep-space-blue-500 dark:border-gray-600",
                  isDomainPending && "opacity-60",
                )}
                style={{ maxHeight: 200 }}
              />
              {isDomainPending && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
            </div>
            {(isTyping || hasActiveTools) && (
              <button
                onMouseDown={handleCancelHoldStart}
                onMouseUp={handleCancelHoldEnd}
                onMouseLeave={handleCancelHoldEnd}
                onTouchStart={handleCancelHoldStart}
                onTouchEnd={handleCancelHoldEnd}
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flag-red-100 hover:bg-flag-red-200 text-flag-red-600 dark:bg-flag-red-900/40 dark:hover:bg-flag-red-800/50 dark:text-flag-red-400 transition-colors"
                title="Hold for 2 seconds to cancel"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                {!holdProgress && (
                  <span className="absolute inset-0 rounded-lg border-2 border-flag-red-400 dark:border-flag-red-500 animate-cancel-pulse" />
                )}
                {holdProgress && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="none" className="stroke-flag-red-500 dark:stroke-flag-red-400" strokeWidth="3" strokeDasharray="100" strokeDashoffset="100" strokeLinecap="round" style={{ animation: "hold-arc 2s linear forwards" }} />
                  </svg>
                )}
              </button>
            )}
            <Button onClick={handleSend} disabled={!input.trim()} size="md">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
