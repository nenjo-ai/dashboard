"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageTransition } from "@/components/ui/motion";
import { fetchBootstrapStatus, fetchCurrentUser, setAuthTokenGetter } from "@/lib/api";
import { cn } from "@/lib/cn";
import { loadStoredAccountContentKey } from "@/lib/cryptoContent";
import { MobileMenuProvider } from "@/lib/MobileMenuContext";
import { OrgProvider } from "@/lib/org-context";

/** Routes under /dashboard that should NOT show the sidebar chrome. */
const CHROMELESS_ROUTES = ["/dashboard/login", "/dashboard/signup", "/dashboard/onboarding", "/dashboard/invitations"];
const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (!CLERK_ENABLED) {
    if (pathname.startsWith("/dashboard/login") || pathname.startsWith("/dashboard/signup")) {
      return <>{children}</>;
    }
    return <ClerkConfigurationNotice />;
  }

  return <DashboardLayoutWithClerk pathname={pathname}>{children}</DashboardLayoutWithClerk>;
}

function DashboardLayoutWithClerk({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const isChromeless = CHROMELESS_ROUTES.some((r) => pathname.startsWith(r));
  const isChatRoute = pathname.startsWith("/dashboard/chat");
  const showMobileNav = !isChatRoute;
  const [authReady, setAuthReady] = useState(false);
  const routeCheckKey =
    isChromeless || !authReady || !isLoaded || !isSignedIn
      ? null
      : pathname;
  const [completedRouteCheckKey, setCompletedRouteCheckKey] = useState<
    string | null
  >(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );

  // Sync with localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar-collapsed");
      if (stored === "true") {
        const timer = setTimeout(() => setSidebarCollapsed(true), 0);
        return () => clearTimeout(timer);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  // Wire up the global auth token getter so all API calls via `fetcher`
  // automatically include the Clerk Bearer token.
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    setAuthTokenGetter(getToken);
    const timer = setTimeout(() => setAuthReady(true), 0);

    return () => {
      clearTimeout(timer);
      setAuthTokenGetter(null);
    };
  }, [getToken, isLoaded]);

  useEffect(() => {
    if (!routeCheckKey) return;

    let cancelled = false;

    void (async () => {
      try {
        const [me, localAck, bootstrap] = await Promise.all([
          fetchCurrentUser(),
          loadStoredAccountContentKey(),
          fetchBootstrapStatus().catch(() => null),
        ]);
        if (cancelled) return;

        const hasOrg = Boolean(me.org_id);
        const hasExistingWorkspace =
          Boolean(me.onboarded) ||
          Boolean(bootstrap?.has_recovery_bundle) ||
          (bootstrap?.trusted_device_count ?? 0) > 0;
        const needsRestore = hasOrg && hasExistingWorkspace && !localAck;

        if (needsRestore) {
          router.replace("/dashboard/onboarding");
          return;
        }
      } catch {
        // Fall through and let the dashboard render; onboarding has its own gate.
      }

      if (!cancelled) {
        setCompletedRouteCheckKey(routeCheckKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeCheckKey, router]);

  if (isChromeless) {
    // Wait for Clerk to load so the auth token getter is wired up
    // before children (like onboarding) make API calls.
    if (!isLoaded || !authReady) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] dark:bg-[#05070b]">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading…</span>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  const mainPadding = cn(
    "pl-0 md:transition-[padding-left] md:duration-200",
    sidebarCollapsed ? "md:pl-16" : "md:pl-64",
  );

  // Don't render dashboard children until Clerk auth is loaded and the
  // token getter is wired up. This prevents SWR hooks from firing
  // requests before the auth token is available (which causes 401s).
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#05070b]">
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading…</span>
          </div>
        </main>
      </div>
    );
  }

  if (!routeCheckKey || completedRouteCheckKey !== routeCheckKey) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#05070b]">
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading…</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#05070b]">
      <OrgProvider>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={false}
          onMobileClose={() => {}}
        />
        {/* Main content — offset by sidebar width on desktop */}
        <div className={mainPadding}>
          <main className={cn("min-h-screen bg-[#f5f7fb] dark:bg-[#05070b] md:bg-transparent md:dark:bg-transparent", showMobileNav && "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0")}>
            <MobileMenuProvider onMenuClick={() => {}}>
              {isMobileViewport ? (
                children
              ) : (
                <PageTransition pageKey={pathname}>{children}</PageTransition>
              )}
            </MobileMenuProvider>
          </main>
        </div>
        {showMobileNav && <MobileTabBar />}
      </OrgProvider>
    </div>
  );
}
