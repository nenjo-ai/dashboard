"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatSession } from "@/lib/types";

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSwitch: (sessionId: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `~${(n / 1000).toFixed(1)}k`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ChatSessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSwitch,
  onCreate,
  onRename,
  onArchive,
  onDelete,
}: ChatSessionListProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleRenameSubmit = (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== sessions.find((s) => s.id === id)?.title) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-zinc-800">
        <button
          onClick={onCreate}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-sm text-zinc-500 text-center">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-zinc-500 text-center">
            No conversations yet
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group relative px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors ${
                  session.id === activeSessionId
                    ? "bg-deep-space-blue-500/18 text-deep-space-blue-50 ring-1 ring-inset ring-deep-space-blue-400/40"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
                onClick={() => onSwitch(session.id)}
              >
                {editingId === session.id ? (
                  <input
                    ref={editRef}
                    className="w-full bg-zinc-900 border border-zinc-600 rounded-sm px-2 py-0.5 text-sm text-zinc-100 outline-hidden"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleRenameSubmit(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(session.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="text-sm truncate pr-6">{session.title}</div>
                    <div
                      className={`mt-0.5 text-xs ${
                        session.id === activeSessionId
                          ? "text-deep-space-blue-100/80"
                          : "text-zinc-500"
                      }`}
                    >
                      {session.message_count} msgs &middot; {formatTokens(session.est_tokens)} tokens &middot; {timeAgo(session.updated_at)}
                    </div>
                  </>
                )}

                {/* Kebab menu */}
                {editingId !== session.id && (
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded-sm hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(menuOpen === session.id ? null : session.id);
                      }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {menuOpen === session.id && (
                      <div
                        className="absolute right-0 top-8 z-50 w-32 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                          onClick={() => {
                            setEditTitle(session.title);
                            setEditingId(session.id);
                            setMenuOpen(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                          onClick={() => {
                            onArchive(session.id);
                            setMenuOpen(null);
                          }}
                        >
                          Archive
                        </button>
                        <button
                          className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-800"
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
            className="w-80 rounded-lg bg-zinc-900 border border-zinc-700 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-zinc-100 mb-2">Delete conversation?</h3>
            <p className="text-xs text-zinc-400 mb-4">
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded-md text-zinc-300 hover:bg-zinc-800 transition-colors"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
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
