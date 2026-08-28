"use client";

import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { cn } from "@/lib/cn";
import type { ChatSessionExtended, AgentDefinition } from "@/lib/types";
import { useAgents } from "@/lib/hooks";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { useChatSessionIndicators } from "@/lib/useChatSessionIndicators";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

interface GlobalSessionListProps {
  sessions: ChatSessionExtended[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSelect: (session: ChatSessionExtended) => void;
  onCreate?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  unreadCounts?: Record<string, number>;
  hideHeaderControls?: boolean;
  mobile?: boolean;
}

function displayProjectName(name: string): string {
  return name === "No Project" ? "General" : name;
}

function displayAgentName(session: ChatSessionExtended): string {
  if (session.target_type === "council")
    return session.council_name ?? session.title;
  return session.agent_name;
}

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

function sessionGroupLabel(dateStr: string): "Today" | "Yesterday" | "Earlier" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const updatedAt = new Date(dateStr);
  if (updatedAt >= today) return "Today";
  if (updatedAt >= yesterday) return "Yesterday";
  return "Earlier";
}

export default function GlobalSessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  unreadCounts = {},
  hideHeaderControls = false,
  mobile = false,
}: GlobalSessionListProps) {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  // Close menu on outside click — check if click is inside the menu
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenuOpen(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const { agents } = useAgents();
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    agents?.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);
  const chatSessionIds = useMemo(
    () => sessions.map((session) => session.id),
    [sessions],
  );
  const sessionIndicators = useChatSessionIndicators(chatSessionIds);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const lower = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        s.project_name.toLowerCase().includes(lower) ||
        displayAgentName(s).toLowerCase().includes(lower),
    );
  }, [sessions, search]);

  const handleRenameSubmit = useCallback(
    (id: string) => {
      const trimmed = editTitle.trim();
      if (trimmed && trimmed !== sessions.find((s) => s.id === id)?.title) {
        onRename?.(id, trimmed);
      }
      setEditingId(null);
    },
    [editTitle, sessions, onRename],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent dark:bg-transparent">
      {/* Header */}
      {!hideHeaderControls && (
        <div
          className={cn(
            "shrink-0 border-b border-black/[0.05] p-3 dark:border-white/[0.07]",
            mobile && "px-3 pb-2 pt-3",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <svg
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className={cn(
                  "w-full border border-black/[0.07] bg-white/75 py-2.5 pl-9 pr-3 text-xs text-gray-900 shadow-sm outline-hidden placeholder:text-gray-400 focus:border-deep-space-blue-300 focus:ring-2 focus:ring-deep-space-blue-100 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-deep-space-blue-500/15",
                  mobile ? "rounded-[1.35rem]" : "rounded-xl",
                )}
              />
            </div>

            {onCreate ? (
              <button
                type="button"
                onClick={onCreate}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center border border-black/[0.07] bg-white/80 text-gray-600 shadow-sm transition-colors hover:border-deep-space-blue-200 hover:bg-deep-space-blue-50 hover:text-deep-space-blue-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-deep-space-blue-500/10 dark:hover:text-deep-space-blue-300",
                  mobile ? "rounded-full" : "rounded-xl",
                )}
                title="New chat"
                aria-label="New chat"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Session list */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
          mobile && "pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]",
        )}
      >
        {isLoading ? (
          <div className={cn("space-y-2 p-3", mobile && "px-3 py-3")}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "space-y-1.5 p-2",
                  mobile ? "rounded-2xl" : "rounded-md",
                )}
              >
                <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className={cn(
              "px-3 py-8 text-center text-xs text-gray-400",
              mobile && "px-6 py-10",
            )}
          >
            {search ? "No matching chats" : "No conversations yet"}
          </div>
        ) : (
          <div className={cn("pb-3", mobile && "px-2")}>
            {filtered.map((session, index) => {
              const groupLabel = sessionGroupLabel(session.updated_at);
              const showGroupLabel =
                index === 0 ||
                sessionGroupLabel(filtered[index - 1].updated_at) !==
                  groupLabel;
              return (
                <Fragment key={session.id}>
                  {showGroupLabel ? (
                    <div className="px-4 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                      {groupLabel}
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "group relative min-w-0 cursor-pointer overflow-visible transition-[background-color,box-shadow,transform] duration-150",
                      mobile
                        ? "mx-0 rounded-[1.35rem] border border-transparent px-4 py-4 active:scale-[0.995]"
                        : "mx-2 rounded-xl border border-transparent px-3 py-3",
                      menuOpen === session.id && "z-20",
                      session.id === activeSessionId
                        ? "border-deep-space-blue-200/70 bg-white text-gray-950 shadow-[0_8px_24px_rgba(37,55,105,0.08)] dark:border-deep-space-blue-400/20 dark:bg-white/[0.075] dark:text-white"
                        : "hover:border-black/[0.04] hover:bg-white/65 dark:hover:border-white/[0.06] dark:hover:bg-white/[0.04]",
                    )}
                    onClick={() => onSelect(session)}
                  >
                    {session.id === activeSessionId ? (
                      <span
                        className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-deep-space-blue-500 dark:bg-deep-space-blue-300"
                        aria-hidden="true"
                      />
                    ) : null}
                    {(() => {
                      const agent =
                        session.target_type === "agent" && session.agent_id
                          ? agentMap.get(session.agent_id)
                          : undefined;
                      const isActive = session.id === activeSessionId;
                      const sessionIndicator = sessionIndicators[session.id];
                      const unreadCount = unreadCounts[session.id] ?? 0;
                      return editingId === session.id ? (
                        <div className="flex min-w-0 items-center gap-2.5">
                          {agent && (
                            <RoleIdenticon
                              roleId={agent.id}
                              color={agent.color}
                              size={26}
                              className="shrink-0"
                              name={agent.name}
                            />
                          )}
                          <input
                            ref={editRef}
                            className="w-full rounded-sm border border-black/10 bg-[#f5f7fb] px-2 py-0.5 text-xs text-gray-900 outline-hidden dark:border-white/10 dark:bg-[#05070b] dark:text-gray-100"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => handleRenameSubmit(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleRenameSubmit(session.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {agent ? (
                            <RoleIdenticon
                              roleId={agent.id}
                              color={agent.color}
                              size={26}
                              className="shrink-0"
                              name={agent.name}
                            />
                          ) : (
                            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              {displayAgentName(session)
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1 pr-7">
                            <span
                              className={cn(
                                "block truncate text-[13px] font-semibold tracking-[-0.01em]",
                                isActive
                                  ? "text-gray-950 dark:text-white"
                                  : "text-gray-900 dark:text-gray-100",
                              )}
                            >
                              {session.title || displayAgentName(session)}
                            </span>
                            {unreadCount > 0 && !isActive ? (
                              <span
                                className="absolute right-3 top-3 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-deep-space-blue-600 px-1 text-[9px] font-bold leading-none text-white dark:bg-deep-space-blue-400 dark:text-deep-space-blue-950"
                                aria-label={`${unreadCount} unread agent ${unreadCount === 1 ? "update" : "updates"}`}
                              >
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            ) : null}
                            <div
                              className={cn(
                                "mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]",
                                isActive
                                  ? "text-gray-500 dark:text-gray-300"
                                  : "text-gray-500 dark:text-gray-400",
                              )}
                            >
                              {session.target_type === "council" ? (
                                <>
                                  <span className="shrink-0">Council</span>
                                  <span>·</span>
                                  <span className="min-w-0 truncate">
                                    {displayProjectName(session.project_name)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="shrink-0">
                                    @{session.agent_name}
                                  </span>
                                  <span>·</span>
                                  <span className="min-w-0 truncate">
                                    {displayProjectName(session.project_name)}
                                  </span>
                                </>
                              )}
                              <span
                                className={cn(
                                  "ml-auto inline-flex shrink-0 items-center gap-1.5 text-[10px]",
                                  isActive
                                    ? "text-gray-400 dark:text-gray-400"
                                    : "text-gray-400 dark:text-gray-500",
                                )}
                              >
                                <SessionStatusIndicator
                                  status={sessionIndicator?.status}
                                />
                                <time dateTime={session.updated_at}>
                                  {timeAgo(session.updated_at)}
                                </time>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Kebab menu */}
                    {editingId !== session.id && (
                      <div
                        ref={menuOpen === session.id ? menuRef : undefined}
                        className={cn(
                          "absolute right-2 top-2 z-30 transition-opacity",
                          mobile
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <button
                          className={cn(
                            "text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200",
                            mobile ? "rounded-full p-1.5" : "rounded-sm p-1",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(
                              menuOpen === session.id ? null : session.id,
                            );
                          }}
                          title="Conversation actions"
                          aria-label="Conversation actions"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {menuOpen === session.id && (
                          <div
                            className="absolute right-0 top-8 z-50 w-28 rounded-xl border border-black/10 bg-[#f5f7fb] py-1 shadow-lg dark:border-white/10 dark:bg-[#05070b]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {onRename && (
                              <button
                                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                onClick={() => {
                                  setEditTitle(session.title);
                                  setEditingId(session.id);
                                  setMenuOpen(null);
                                }}
                              >
                                Rename
                              </button>
                            )}
                            <button
                              className="w-full px-3 py-1.5 text-left text-xs text-flag-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                              onClick={() => {
                                setConfirmDeleteId(session.id);
                                setMenuOpen(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50">
          <div
            className="w-80 rounded-lg border border-black/10 bg-[#f5f7fb] p-4 shadow-xl dark:border-white/10 dark:bg-[#05070b]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              Delete conversation?
            </h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              This will permanently delete this conversation and all its
              messages.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-flag-red-600 px-3 py-1.5 text-sm text-white hover:bg-flag-red-500"
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
