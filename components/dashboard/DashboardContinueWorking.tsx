import Link from "next/link";
import { ArrowRight, MessageSquare, MessagesSquare } from "lucide-react";
import { SessionStatusIndicator } from "@/components/chat/SessionStatusIndicator";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import type { ChatSessionIndicatorState } from "@/lib/chat/sessionIndicators";
import type { ChatSessionExtended } from "@/lib/types";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function sessionContext(session: ChatSessionExtended): string {
  const agent =
    session.target_type === "council"
      ? session.council_name || "Council"
      : session.agent_name || "Agent";
  return session.project_name ? `${agent} · ${session.project_name}` : agent;
}

export function DashboardContinueWorking({
  sessions,
  indicators,
  isLoading,
  description = "Pick up a recent agent conversation.",
  allHref = "/dashboard/chat",
}: {
  sessions: ChatSessionExtended[];
  indicators: ChatSessionIndicatorState;
  isLoading: boolean;
  description?: string;
  allHref?: string;
}) {
  return (
    <section className="theme-border theme-surface overflow-hidden rounded-[1.4rem] border shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="theme-border flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="theme-text text-sm font-semibold">Continue working</h2>
          <p className="theme-text-muted mt-1 text-sm">
            {description}
          </p>
        </div>
        <Link
          href={allHref}
          className="theme-text-muted inline-flex shrink-0 items-center gap-1 text-xs font-medium transition-colors hover:text-deep-space-blue-600 dark:hover:text-deep-space-blue-300"
        >
          All chats
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {isLoading ? (
        <LoadingStatus
          className="min-h-56"
          label="Loading conversations"
          description="Finding your most recent agent work."
        />
      ) : sessions.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center px-6 py-8 text-center">
          <span className="theme-surface-muted theme-text-muted flex h-11 w-11 items-center justify-center rounded-xl">
            <MessagesSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="theme-text mt-3 text-sm font-semibold">No conversations yet</h3>
          <p className="theme-text-muted mt-1 max-w-sm text-sm leading-6">
            Start a conversation and it will stay within easy reach here.
          </p>
          <Link
            href="/dashboard/chat"
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-3.5 text-xs font-medium text-[var(--app-accent-foreground)] transition-colors hover:bg-[var(--app-accent-hover)]"
          >
            Start a conversation
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-black/[0.055] px-2 dark:divide-white/[0.07]">
          {sessions.map((session) => {
            const status = indicators[session.id]?.status;
            return (
              <Link
                key={session.id}
                href={`/dashboard/chat?session=${encodeURIComponent(session.id)}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-3.5 transition-colors hover:[background:var(--app-hover)]"
              >
                <span className="theme-surface-muted theme-text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="theme-text truncate text-sm font-medium">
                      {session.title || "Untitled conversation"}
                    </span>
                    <SessionStatusIndicator status={status} />
                  </span>
                  <span className="theme-text-muted mt-1 block truncate text-xs">
                    {sessionContext(session)}
                  </span>
                </span>
                <span className="theme-text-muted shrink-0 text-[11px]">
                  {formatRelativeTime(session.updated_at)}
                </span>
                <ArrowRight
                  className="theme-text-muted hidden h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
