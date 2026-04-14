"use client";

import Link from "next/link";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { Bell, BellOff, BookOpenText, Download, Github, Menu, WifiOff } from "lucide-react";
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
  const {
    canInstall,
    disableNotifications,
    enableNotifications,
    isIos,
    isMobile,
    isOnline,
    isStandalone,
    notificationsEnabled,
    notificationsSupported,
    promptInstall,
    showInstallNudge,
  } = usePwa();

  const { data: unread } = useSWR<UnreadSummary>(
    isLoaded && isSignedIn ? notificationsUnreadUrl() : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );
  const totalUnread = unread?.total ?? 0;
  const showInstallButton = isMobile && !isStandalone && (canInstall || isIos);
  const showInstallBanner = isMobile && showInstallButton;
  const showPushBanner = isStandalone && notificationsSupported;
  const handleInstallClick = () => {
    if (canInstall) {
      void promptInstall();
      return;
    }

    showInstallNudge();
  };

  const handlePushClick = () => {
    if (notificationsEnabled) {
      void disableNotifications();
      return;
    }
    void enableNotifications();
  };

  return (
    <>
      <header className="pwa-topbar theme-border theme-overlay sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 md:px-8 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="theme-text-muted rounded-lg p-2 transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 md:hidden dark:hover:text-gray-200"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <h1 className="theme-text text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/docs"
              className="theme-text-muted inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 dark:hover:text-gray-200"
              title="Developer Docs"
            >
              <BookOpenText className="h-4 w-4" />
              Docs
            </Link>
            <Link
              href="https://github.com/nenjo-ai/nenjo"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-text-muted inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 dark:hover:text-gray-200"
              title="GitHub"
            >
              <Github className="h-4 w-4" />
              GitHub
            </Link>
          </div>
          {!isOnline && (
            <span className="hidden items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 md:inline-flex dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </span>
          )}
          <Link
            href="/dashboard/chat?channel=notifications"
            className="theme-text-muted relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
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
            <div className="theme-border flex items-center gap-3 border-l pl-4">
              {children}
            </div>
          )}
        </div>
      </header>
      {(showInstallBanner || showPushBanner) && (
        <div className="theme-border theme-overlay-strong sticky top-16 z-10 border-b px-4 py-2 backdrop-blur-xs md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-200">
              {showInstallBanner ? (
                <span>
                  Install the app to use the full-screen PWA experience
                  {isIos ? " and Safari push notifications." : "."}
                </span>
              ) : (
                <span>
                  Agent push notifications are {notificationsEnabled ? "enabled" : "available"}.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showInstallButton && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-deep-space-blue-200 bg-deep-space-blue-50 px-3 text-[11px] font-medium text-deep-space-blue-700 transition-colors hover:border-deep-space-blue-300 hover:bg-deep-space-blue-100 dark:border-deep-space-blue-400/30 dark:bg-deep-space-blue-500/10 dark:text-deep-space-blue-200 dark:hover:border-deep-space-blue-400/50 dark:hover:bg-deep-space-blue-500/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install App
                </button>
              )}
              {showPushBanner && (
                <button
                  type="button"
                  onClick={handlePushClick}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-transparent px-3 text-[11px] font-medium text-gray-700 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.06]"
                >
                  {notificationsEnabled ? (
                    <BellOff className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  {notificationsEnabled ? "Disable Agent Push" : "Enable Agent Push"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
