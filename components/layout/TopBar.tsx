"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  Bell,
  BellOff,
  BookOpenText,
  Download,
  Github,
  Menu,
  WifiOff,
} from "lucide-react";
import { useAppAuth } from "@/components/auth/AppAuth";
import { OrgSwitcher } from "./OrgSwitcher";
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
  const { isLoaded, isSignedIn, mode } = useAppAuth();
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
      <header className="pwa-topbar sticky top-0 z-20 flex h-16 items-center justify-between gap-4 bg-[var(--app-bg)]/85 px-4 backdrop-blur-xl md:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="theme-text-muted rounded-xl p-2 transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 md:hidden dark:hover:text-gray-200"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <h1 className="theme-text truncate text-[17px] font-semibold tracking-[-0.02em] md:text-lg">
            {title}
          </h1>
        </div>
        <div
          className="theme-border flex shrink-0 items-center gap-1 rounded-2xl border bg-white/70 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:bg-white/[0.045] dark:shadow-[0_10px_30px_rgba(0,0,0,0.2)]"
          aria-label="Workspace utilities"
        >
          {mode === "local" ? (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-50/80 px-2 text-[10px] font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
              title="Local authentication"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              Local
            </span>
          ) : null}
          <OrgSwitcher />
          <span
            className="mx-0.5 hidden h-5 w-px bg-black/[0.07] md:block dark:bg-white/10"
            aria-hidden="true"
          />
          <div className="hidden items-center gap-0.5 md:flex">
            <Link
              href="/docs"
              prefetch={false}
              className="theme-text-muted inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-medium transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 dark:hover:text-gray-200"
              title="Developer Docs"
              aria-label="Developer Docs"
            >
              <BookOpenText className="h-4 w-4" />
            </Link>
            <Link
              href="https://github.com/nenjo-ai/nenjo"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-text-muted inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs font-medium transition-colors hover:[background:var(--app-hover)] hover:text-gray-700 dark:hover:text-gray-200"
              title="GitHub"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </Link>
          </div>
          {!isOnline ? (
            <span className="hidden items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 md:inline-flex dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </span>
          ) : null}
          <Link
            href="/dashboard/chat?channel=notifications"
            prefetch={false}
            className="theme-text-muted relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5" />
            {totalUnread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            ) : null}
          </Link>
          {children ? (
            <div className="theme-border ml-0.5 flex items-center gap-2 border-l pl-2">
              {children}
            </div>
          ) : null}
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
                  Agent push notifications are{" "}
                  {notificationsEnabled ? "enabled" : "available"}.
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
                  {notificationsEnabled
                    ? "Disable Agent Push"
                    : "Enable Agent Push"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
