"use client";

import Link from "next/link";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { Bell, BookOpen, Download, Menu, WifiOff } from "lucide-react";
import { WorkerStatusIndicator } from "./WorkerStatusIndicator";
import { useMobileMenu } from "@/lib/MobileMenuContext";
import { usePwa } from "@/components/pwa/PwaProvider";
import { fetcher, notificationsUnreadUrl } from "@/lib/api";
import type { UnreadSummary } from "@/lib/types";

interface TopBarProps {
  title: string;
  children?: React.ReactNode;
}

export function TopBar({ title, children }: TopBarProps) {
  const onMenuClick = useMobileMenu();
  const { isLoaded, isSignedIn } = useAuth();
  const { canInstall, isIos, isMobile, isOnline, isStandalone, promptInstall, showInstallNudge } = usePwa();

  const { data: unread } = useSWR<UnreadSummary>(
    isLoaded && isSignedIn ? notificationsUnreadUrl() : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );
  const totalUnread = unread?.total ?? 0;
  const showInstallButton = isMobile && !isStandalone && (canInstall || isIos);
  const handleInstallClick = () => {
    if (canInstall) {
      void promptInstall();
      return;
    }

    showInstallNudge();
  };

  return (
    <header className="pwa-topbar sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 md:px-8 backdrop-blur-xs dark:border-gray-700 dark:bg-gray-900/80">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {!isOnline && (
          <span className="hidden items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 md:inline-flex dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5" />
            Offline
          </span>
        )}
        {showInstallButton && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-deep-space-blue-200 bg-deep-space-blue-50 px-3 text-[11px] font-medium text-deep-space-blue-700 transition-colors hover:border-deep-space-blue-300 hover:bg-deep-space-blue-100 dark:border-deep-space-blue-400/30 dark:bg-deep-space-blue-500/10 dark:text-deep-space-blue-200 dark:hover:border-deep-space-blue-400/50 dark:hover:bg-deep-space-blue-500/20"
            title="Install Nenjo"
          >
            <Download className="h-3.5 w-3.5" />
            Install
          </button>
        )}
        <Link
          href="/docs"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="Docs"
        >
          <BookOpen className="h-4.5 w-4.5" />
        </Link>
        <a
          href="https://github.com/nenjo-ai/nenjo"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="GitHub"
        >
          <svg className="h-4.5 w-4.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
        <Link
          href="/dashboard/chat?channel=notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          title="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </Link>
        <WorkerStatusIndicator />
        {children && (
          <div className="flex items-center gap-3 border-l border-gray-200 pl-4 dark:border-gray-700">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
