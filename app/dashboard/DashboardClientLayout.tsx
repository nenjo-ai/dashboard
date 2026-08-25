"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { useAppAuth } from "@/components/auth/AppAuth";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { LocalVaultUnlockGate } from "@/components/auth/LocalVaultUnlockGate";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageTransition } from "@/components/ui/motion";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { fetchBootstrapStatus, fetchCurrentUser } from "@/lib/api";
import { cn } from "@/lib/cn";
import { bindLocalSecretVaultSession, loadStoredAccountContentKey } from "@/lib/cryptoContent";
import { MobileMenuProvider } from "@/lib/MobileMenuContext";
import { OrgProvider } from "@/lib/org-context";
import { shouldRetryDashboardRequest } from "@/lib/apiRetryPolicy";
import { useSafeRouter } from "@/lib/safeRouter";
import { shouldBootstrapSecureWorkspace } from "@/lib/vaultRestoreGate.mjs";

/** Routes under /dashboard that should NOT show the sidebar chrome. */
const CHROMELESS_ROUTES = ["/dashboard/login", "/dashboard/signup", "/dashboard/onboarding", "/dashboard/invitations"];
const DASHBOARD_SWR_CONFIG = {
  shouldRetryOnError: shouldRetryDashboardRequest,
};

export function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { mode } = useAppAuth();

  if (mode === "unconfigured") {
    return <ClerkConfigurationNotice />;
  }

  return (
    <SWRConfig value={DASHBOARD_SWR_CONFIG}>
      <AuthenticatedDashboardLayout pathname={pathname}>
        {children}
      </AuthenticatedDashboardLayout>
    </SWRConfig>
  );
}

function AuthenticatedDashboardLayout({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const { isLoaded, isSignedIn } = useAppAuth();
  const router = useSafeRouter();
  const isChromeless = CHROMELESS_ROUTES.some((r) => pathname.startsWith(r));
  const isSecureWorkspaceBootstrap = pathname.startsWith(
    "/dashboard/bootstrap/security",
  );
  const isChatRoute = pathname.startsWith("/dashboard/chat");
  const showMobileNav = !isChatRoute;
  const [routeReady, setRouteReady] = useState(false);
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

  // Run vault-restore / bootstrap gate once per auth session, not on every route.
  useEffect(() => {
    if (isChromeless) {
      const timer = setTimeout(() => setRouteReady(true), 0);
      return () => clearTimeout(timer);
    }
    if (!isLoaded || !isSignedIn) {
      const timer = setTimeout(() => setRouteReady(false), 0);
      return () => clearTimeout(timer);
    }

    const pendingTimer = setTimeout(() => setRouteReady(false), 0);
    let cancelled = false;

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled) {
        return;
      }

      try {
        const me = await fetchCurrentUser();
        const accountId = me.clerk_id ?? me.user_id ?? null;
        const accountMatches = accountId
          ? bindLocalSecretVaultSession(accountId)
          : true;
        const [localAck, bootstrap] = await Promise.all([
          accountMatches ? loadStoredAccountContentKey() : Promise.resolve(null),
          fetchBootstrapStatus().catch(() => null),
        ]);
        if (cancelled) return;

        const hasOrg = Boolean(me.org_id);
        const hasExistingWorkspace =
          Boolean(me.onboarded) ||
          Boolean(bootstrap?.has_recovery_bundle) ||
          (bootstrap?.trusted_device_count ?? 0) > 0;
        if (
          shouldBootstrapSecureWorkspace({
            hasSignedInAccount: Boolean(accountId),
            hasOrg,
            hasRecoveryBundle: Boolean(bootstrap?.has_recovery_bundle),
            isOnboarded: Boolean(me.onboarded),
            requiresSecureWorkspace: Boolean(
              bootstrap?.requires_secure_workspace,
            ),
          }) &&
          !isSecureWorkspaceBootstrap
        ) {
          router.replace(
            "/dashboard/bootstrap/security?redirect_url=%2Fdashboard",
          );
          return;
        }

        const needsRestore = hasOrg && hasExistingWorkspace && !localAck;

        if (needsRestore) {
          router.replace("/dashboard/onboarding");
          return;
        }
      } catch {
        // Fall through and let the dashboard render; onboarding has its own gate.
      }

      if (!cancelled) {
        setRouteReady(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(pendingTimer);
    };
  }, [
    isChromeless,
    isLoaded,
    isSecureWorkspaceBootstrap,
    isSignedIn,
    router,
  ]);

  if (isChromeless) {
    // Wait for the selected auth implementation before children such as
    // onboarding make API calls through the dashboard BFF.
    if (!isLoaded) {
      return (
        <div className="theme-app-bg flex min-h-screen items-center justify-center">
          <LoadingStatus label="Loading Nenjo" />
        </div>
      );
    }
    return <>{children}</>;
  }

  const mainPadding = cn(
    "pl-0 md:transition-[padding-left] md:duration-200",
    sidebarCollapsed ? "md:pl-16" : "md:pl-64",
  );

  // Don't render dashboard children until the selected auth implementation
  // is ready. This prevents SWR hooks from firing unauthenticated requests.
  if (!isLoaded) {
    return (
      <div className="theme-app-bg min-h-screen">
        <main className="min-h-screen flex items-center justify-center">
          <LoadingStatus label="Loading Nenjo" />
        </main>
      </div>
    );
  }

  if (!routeReady) {
    return (
      <div className="theme-app-bg min-h-screen">
        <main className="min-h-screen flex items-center justify-center">
          <LoadingStatus label="Preparing your workspace" />
        </main>
      </div>
    );
  }

  return (
    <div className="theme-app-bg min-h-screen">
      <OrgProvider>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={false}
          onMobileClose={() => {}}
        />
        {/* Main content — offset by sidebar width on desktop */}
        <div className={mainPadding}>
          <main className={cn("theme-app-bg min-h-screen", showMobileNav && "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0")}>
            <MobileMenuProvider onMenuClick={() => {}}>
              <LocalVaultUnlockGate>
                {isMobileViewport ? (
                  children
                ) : (
                  <PageTransition pageKey={pathname}>{children}</PageTransition>
                )}
              </LocalVaultUnlockGate>
            </MobileMenuProvider>
          </main>
        </div>
        {showMobileNav && <MobileTabBar />}
      </OrgProvider>
    </div>
  );
}
