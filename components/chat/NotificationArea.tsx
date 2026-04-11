"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetcher,
  chatMessagesUrl,
  markNotificationRead,
  notificationsUnreadUrl,
} from "@/lib/api";
import type { ChatMessagePage, NotificationMetadata } from "@/lib/types";
import { mutate } from "swr";

interface NotificationAreaProps {
  agentId: string;
  sessionId: string;
  agentName?: string;
  variant?: "desktop" | "mobile";
}

const SEVERITY_STYLES: Record<string, string> = {
  info: "border-l-blue-400 dark:border-l-blue-500",
  warning: "border-l-amber-400 dark:border-l-amber-500",
  action: "border-l-violet-400 dark:border-l-violet-500",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function NotificationArea({
  agentId,
  sessionId,
  variant = "desktop",
}: NotificationAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = variant === "mobile";

  // Fetch notification messages
  const { data, isLoading } = useSWR<ChatMessagePage>(
    chatMessagesUrl({ agent_id: agentId, session_id: sessionId, limit: 100 }),
    fetcher,
    { revalidateOnFocus: true },
  );

  const messages = data?.messages ?? [];

  // Mark as read on mount and when session changes
  useEffect(() => {
    markNotificationRead(sessionId).then(() => {
      mutate(notificationsUnreadUrl());
    }).catch(() => {
      // Silently ignore — session may not exist yet
    });
  }, [sessionId]);

  // Scroll to top when new notifications arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-deep-space-blue-500" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No notifications yet
          </p>
        </div>
      </div>
    );
  }

  // Messages come newest-first from API — display as-is (most recent on top)
  return (
    <div
      ref={scrollRef}
      className={cn(
        "h-full overflow-y-auto overflow-x-hidden overscroll-contain space-y-3",
        isMobile
          ? "px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.85rem)] pt-3"
          : "p-4",
      )}
    >
      {messages.map((msg) => {
        const meta: NotificationMetadata | null = msg.metadata;
        const severity = meta?.severity ?? "info";
        const link = meta?.link;
        const borderClass = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;

        return (
          <div
            key={msg.id}
            className={cn(
              "overflow-hidden border-l-4 bg-gray-50 dark:bg-gray-800/50",
              isMobile ? "rounded-2xl p-3.5" : "rounded-r-lg p-3",
              borderClass,
            )}
          >
            <div className="prose prose-sm max-w-none break-words text-gray-800 dark:prose-invert dark:text-gray-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {timeAgo(msg.created_at)}
              </span>
              {link && (
                <Link
                  href={link}
                  className="text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline dark:text-blue-400"
                >
                  View details &rarr;
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
