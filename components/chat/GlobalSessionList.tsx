"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/cn";
import type { ChatSessionExtended, AgentDefinition } from "@/lib/types";
import { useAgents } from "@/lib/hooks";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";

interface GlobalSessionListProps {
  sessions: ChatSessionExtended[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSelect: (session: ChatSessionExtended) => void;
  onCreate?: () => void;
  onRename?: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  channelType?: "chat" | "notification";
  hideHeaderControls?: boolean;
  mobile?: boolean;
}

function displayProjectName(name: string): string {
  return name;
}

function displayAgentName(session: ChatSessionExtended): string {
  return session.agent_display_name ?? session.agent_name;
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

export default function GlobalSessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  channelType = "chat",
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
        <div className={cn(
          "shrink-0 border-b border-gray-200 p-3 space-y-2 dark:border-gray-700",
          mobile && "px-3 pb-2 pt-3",
        )}>
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
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
              placeholder={channelType === "notification" ? "Search notifications..." : "Search chats..."}
              className={cn(
                "w-full border text-xs text-gray-900 placeholder:text-gray-400 outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400 dark:text-gray-100 dark:placeholder:text-gray-500",
                mobile
                  ? "rounded-[1.35rem] border-black/10 bg-[#f5f7fb]/80 py-3 pl-9 pr-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070b]/80"
                  : "rounded-full border-gray-200 bg-gray-100 py-2 pl-8 pr-3 md:rounded-md md:bg-gray-50 md:py-1.5 dark:border-gray-600 dark:bg-gray-800",
              )}
            />
          </div>

          {/* New chat button — hidden for notification view */}
          {onCreate && (
            <button
              onClick={onCreate}
              className={cn(
                "flex w-full items-center gap-2 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800",
                mobile
                  ? "rounded-[1.35rem] border border-black/10 bg-[#f5f7fb]/80 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#05070b]/80"
                  : "rounded-md border border-gray-200 py-2 dark:border-gray-600",
              )}
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New chat
            </button>
          )}
        </div>
      )}

      {/* Session list */}
      <div className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
        mobile && "pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]",
      )}>
        {isLoading ? (
          <div className={cn("space-y-2 p-3", mobile && "px-3 py-3")}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("space-y-1.5 p-2", mobile ? "rounded-2xl" : "rounded-md")}>
                <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={cn("px-3 py-8 text-center text-xs text-gray-400", mobile && "px-6 py-10")}>
            {search ? "No matching chats" : "No conversations yet"}
          </div>
        ) : (
          <div className={cn("py-1", mobile && "space-y-1 px-2 py-2")}>
            {filtered.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group relative min-w-0 cursor-pointer overflow-visible transition-colors",
                  mobile
                    ? "mx-0 rounded-[1.5rem] border border-black/10 bg-transparent px-4 py-4 active:scale-[0.995] dark:border-white/10 dark:bg-transparent"
                    : "mx-1.5 rounded-xl px-3 py-3 md:rounded-md md:py-2",
                  menuOpen === session.id && "z-20",
                  session.id === activeSessionId
                    ? "bg-deep-space-blue-500 text-white dark:bg-deep-space-blue-500"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
                onClick={() => onSelect(session)}
              >
                {(() => {
                  const agent = agentMap.get(session.agent_id);
                  const isActive = session.id === activeSessionId;
                  return editingId === session.id ? (
                    <div className="flex min-w-0 items-center gap-2.5">
                      {agent && (
                        <RoleIdenticon roleId={agent.id} color={agent.color} size={26} className="shrink-0" name={agent.name} />
                      )}
                      <input
                        ref={editRef}
                        className="w-full rounded-sm border border-black/10 bg-[#f5f7fb] px-2 py-0.5 text-xs text-gray-900 outline-hidden dark:border-white/10 dark:bg-[#05070b] dark:text-gray-100"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRenameSubmit(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSubmit(session.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      {agent ? (
                        <RoleIdenticon roleId={agent.id} color={agent.color} size={26} className="shrink-0" name={agent.name} />
                      ) : (
                        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          {displayAgentName(session).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 pr-8">
                        <span className={cn(
                          "truncate text-sm font-medium block",
                          isActive ? "text-white" : "text-gray-900 dark:text-gray-100",
                        )}>
                          {displayAgentName(session)}
                        </span>
                        <div className={cn(
                          "mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]",
                          isActive ? "text-deep-space-blue-100" : "text-gray-500 dark:text-gray-400",
                        )}>
                          {channelType === "notification" ? (
                            <span className="truncate">@{session.agent_name}</span>
                          ) : (
                            <>
                              <span className="min-w-0 truncate">{displayProjectName(session.project_name)}</span>
                              <span>·</span>
                              <span className="shrink-0">@{session.agent_name}</span>
                            </>
                          )}
                          <span className={cn(
                            "ml-auto shrink-0 text-[10px]",
                            isActive ? "text-deep-space-blue-100" : "text-gray-400 dark:text-gray-500",
                          )}>
                            {timeAgo(session.updated_at)}
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
                      mobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
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
            ))}
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
