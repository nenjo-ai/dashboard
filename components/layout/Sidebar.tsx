"use client";

import { cn } from "@/lib/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useAppAuth } from "@/components/auth/AppAuth";
import {
  clearLocalSecretVaultSession,
  lockLocalSecretVault,
} from "@/lib/cryptoContent";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import {
  Bot,
  GitBranch,
  LibraryBig,
  ListTodo,
  Package,
  Users,
  UserCheck,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navigation: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
        />
      </svg>
    ),
  },
  {
    label: "Chat",
    href: "/dashboard/chat",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
        />
      </svg>
    ),
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
        />
      </svg>
    ),
  },
  {
    label: "Tasks",
    href: "/dashboard/tasks",
    icon: <ListTodo className="h-5 w-5" />,
  },
  {
    label: "Reviews",
    href: "/dashboard/reviews",
    icon: <UserCheck className="h-5 w-5" />,
  },
  {
    label: "Library",
    href: "/dashboard/library",
    icon: <LibraryBig className="h-5 w-5" />,
  },
  {
    label: "Packages",
    href: "/dashboard/packages",
    icon: <Package className="h-5 w-5" />,
  },
  {
    label: "Routines",
    href: "/dashboard/routines",
    icon: <GitBranch className="h-5 w-5" />,
  },
  {
    label: "Councils",
    href: "/dashboard/councils",
    icon: <Users className="h-5 w-5" />,
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    icon: <Bot className="h-5 w-5" />,
  },
  {
    label: "Activity",
    href: "/dashboard/activity",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
        />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();

  // Auto-close mobile sidebar on navigation
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContent = (
    <aside
      className={cn(
        "theme-surface theme-border fixed inset-y-0 left-0 z-30 flex flex-col border-r",
        "transition-[width] duration-200 ease-in-out",
        // Desktop: normal sidebar behavior
        "hidden md:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 px-6">
        <NenjoLogoMark className="h-8 w-5 rounded-lg" />
        <span
          className={cn(
            "whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em] text-deep-space-blue-900 transition-[opacity,transform] duration-200 ease-in-out dark:text-white",
            collapsed
              ? "translate-x-[-8px] opacity-0"
              : "translate-x-0 opacity-100",
          )}
        >
          Nenjo
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-200"
                  : "theme-text-muted hover:[background:var(--app-hover)] hover:text-gray-900 dark:hover:text-gray-100",
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-deep-space-blue-500 dark:text-deep-space-blue-300"
                    : "text-gray-400 dark:text-gray-500",
                )}
              >
                {item.icon}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap transition-[opacity,transform] duration-200 ease-in-out",
                  collapsed
                    ? "translate-x-[-8px] opacity-0"
                    : "translate-x-0 opacity-100",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      {onToggleCollapse && (
        <div className="flex px-3 pb-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="theme-text-muted flex items-center justify-center rounded-lg p-2 transition-colors hover:[background:var(--app-hover)] hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={cn(
                "h-4 w-4 transition-transform duration-200 ease-in-out",
                collapsed && "rotate-180",
              )}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Bottom section — signed-in user profile */}
      <UserProfile collapsed={collapsed} />
    </aside>
  );

  return (
    <>
      {sidebarContent}

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
            />
            <motion.aside
              className="theme-app-bg theme-border fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            >
              {/* Logo / Brand */}
              <div className="flex h-16 items-center gap-3 px-6">
                <NenjoLogoMark className="h-8 w-5 rounded-lg" />
                <span className="text-[17px] font-semibold tracking-[-0.02em] text-deep-space-blue-900 dark:text-white">
                  Nenjo
                </span>
              </div>

              {/* Navigation — always expanded on mobile */}
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navigation.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-200"
                          : "theme-text-muted hover:[background:var(--app-hover)] hover:text-gray-900 dark:hover:text-gray-100",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          isActive
                            ? "text-deep-space-blue-500 dark:text-deep-space-blue-300"
                            : "text-gray-400 dark:text-gray-500",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <UserProfile collapsed={false} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Displays the signed-in user's avatar and GitHub username in the sidebar footer. */
function UserProfile({ collapsed = false }: { collapsed?: boolean }) {
  const { canSignOut, isSignedIn, user, isLoaded, mode, signOut } =
    useAppAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Extract GitHub username from external accounts, fall back to Clerk username
  const githubAccount = user?.externalAccounts?.find(
    (account) => account.provider === "github",
  );
  const githubUsername = githubAccount?.username ?? user?.username;
  const email = user?.primaryEmailAddress?.emailAddress;
  const displayName = githubUsername ?? user?.fullName ?? email ?? "User";
  const imageUrl = user?.imageUrl;
  const initials =
    (user?.firstName ?? email ?? "U").trim()[0]?.toUpperCase() ?? "U";

  const textClasses = cn(
    "whitespace-nowrap transition-[opacity,transform] duration-200 ease-in-out",
    collapsed ? "translate-x-[-8px] opacity-0" : "translate-x-0 opacity-100",
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleLogout = useCallback(async () => {
    if (!canSignOut) return;
    setMenuOpen(false);
    lockLocalSecretVault();
    await clearLocalSecretVaultSession();
    await signOut({ redirectUrl: "/" });
  }, [canSignOut, signOut]);

  // Loading skeleton
  if (!isLoaded) {
    return (
      <div className="theme-border overflow-hidden border-t p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200 animate-pulse dark:bg-gray-700" />
          <div className={cn("flex-1 min-w-0 space-y-1.5", textClasses)}>
            <div className="h-3.5 w-20 rounded-sm bg-gray-200 animate-pulse dark:bg-gray-700" />
            <div className="h-3 w-16 rounded-sm bg-gray-200 animate-pulse dark:bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  // Not signed in — show placeholder
  if (!isSignedIn) {
    return (
      <div className="theme-border overflow-hidden border-t p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-deep-space-blue-100 flex items-center justify-center dark:bg-deep-space-blue-900/50">
            <span className="text-sm font-medium text-deep-space-blue-700 dark:text-deep-space-blue-300">
              ?
            </span>
          </div>
          <div className={cn("flex-1 min-w-0", textClasses)}>
            <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
              Not signed in
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="theme-border relative border-t">
      {/* Logout popover — rendered outside overflow context */}
      {menuOpen && canSignOut && (
        <div className="theme-border theme-surface-elevated absolute bottom-full left-2 right-2 z-50 mb-1 rounded-lg border py-1 shadow-lg">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:[background:var(--app-hover)] dark:text-gray-300"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
            </svg>
            Log out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={canSignOut ? () => setMenuOpen((prev) => !prev) : undefined}
        className={cn(
          "flex w-full items-center gap-3 overflow-hidden p-4 text-left transition-colors",
          canSignOut && "hover:[background:var(--app-hover)]",
        )}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={displayName}
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-full bg-deep-space-blue-100 flex items-center justify-center dark:bg-deep-space-blue-900/50">
            <span className="text-sm font-medium text-deep-space-blue-700 dark:text-deep-space-blue-300">
              {initials}
            </span>
          </div>
        )}
        <div className={cn("flex-1 min-w-0", textClasses)}>
          <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
            {displayName}
          </p>
          {mode === "local" ? (
            <p className="truncate text-xs font-medium text-amber-600 dark:text-amber-300">
              Local development
            </p>
          ) : githubUsername || (email && displayName !== email) ? (
            <p className="text-xs text-gray-500 truncate dark:text-gray-400">
              {githubUsername ? `@${githubUsername}` : email}
            </p>
          ) : null}
        </div>
      </button>
    </div>
  );
}
