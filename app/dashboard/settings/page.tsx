"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import {
  AtSign,
  Bell,
  BellOff,
  Building2,
  Cpu,
  HardDrive,
  KeyRound,
  Palette,
  Save,
  ShieldCheck,
} from "lucide-react";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { usePwa } from "@/components/pwa/PwaProvider";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";
import { updateCurrentUser } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { cn } from "@/lib/cn";
import { useCurrentUser, useTabParam, useWorkerStatus } from "@/lib/hooks";
import { useOrgContext } from "@/lib/org-context";

const SETTINGS_TABS = ["general", "org", "runtime", "devices", "keys"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const settingsPanelLoading = () => <LoadingStatus className="min-h-72" description="Preparing the selected workspace controls." label="Loading settings" />;
const ApiKeysSection = dynamic(() => import("@/components/settings/ApiKeysSection").then((module) => module.ApiKeysSection), { loading: settingsPanelLoading });
const ContentEncryptionSection = dynamic(() => import("@/components/settings/ContentEncryptionSection").then((module) => module.ContentEncryptionSection), { loading: settingsPanelLoading });
const OrgSettingsSection = dynamic(() => import("@/components/settings/OrgSettingsSection").then((module) => module.OrgSettingsSection), { loading: settingsPanelLoading });
const UnlockMethodsSection = dynamic(() => import("@/components/settings/UnlockMethodsSection").then((module) => module.UnlockMethodsSection), { loading: settingsPanelLoading });

const TAB_CONTEXT: Record<SettingsTab, { eyebrow: string; title: string; description: string }> = {
  general: { eyebrow: "Personal workspace", title: "General preferences", description: "Manage your account identity, appearance, and notifications for this browser." },
  org: { eyebrow: "Membership & access", title: "Organization", description: "Understand roles, shared-content access, members, invitations, and administrative requests." },
  runtime: { eyebrow: "Execution security", title: "Runtime trust", description: "Monitor connected runtimes and approve new execution environments with explicit code verification." },
  devices: { eyebrow: "Local security", title: "Devices & recovery", description: "Control how this browser unlocks encrypted content, restore access, and manage trusted devices." },
  keys: { eyebrow: "Developer access", title: "API keys", description: "Issue narrowly scoped credentials, inspect their usage, and revoke access when it is no longer needed." },
};

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="theme-surface theme-border overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-6">
      <div className="mb-5">
        <h2 className="theme-text text-base font-semibold">{title}</h2>
        {description ? (
          <p className="theme-text-muted mt-1 text-sm leading-6">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AppearanceControls({
  theme,
  setTheme,
}: {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {(["light", "dark", "system"] as const).map((option) => {
        const active = theme === option;
        return (
          <button
            key={option}
            aria-pressed={active}
            onClick={() => setTheme(option)}
            type="button"
            className={cn(
              "relative flex min-h-28 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border px-3 py-4 text-sm font-medium transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5",
              active
                ? "border-deep-space-blue-400 bg-deep-space-blue-500/8 text-deep-space-blue-700 shadow-[0_8px_24px_rgba(37,99,235,0.08)] dark:border-deep-space-blue-400/50 dark:text-deep-space-blue-200"
                : "border-black/10 bg-transparent text-gray-600 hover:bg-black/[0.03] dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]",
            )}
          >
            <span className={cn("absolute inset-x-3 top-3 h-8 rounded-lg", option === "light" ? "border bg-white" : option === "dark" ? "bg-[#111827]" : "bg-linear-to-r from-white to-[#111827]")} aria-hidden="true" />
            <span className="mt-8">
            {option === "light" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            )}
            {option === "dark" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
            {option === "system" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            )}
            </span>
            <span className="capitalize">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkerStatusPanel() {
  const { workers, isConnected } = useWorkerStatus();
  const connected = workers.filter((worker) => worker.connected).length;

  return (
    <SettingsSection
      title="Runtime availability"
      description="Live runtime presence for this organization. Approval state and connectivity are separate so an offline runtime can remain trusted."
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <RuntimeMetric label="Registered" value={workers.length} />
        <RuntimeMetric label="Connected" value={connected} tone={connected > 0 ? "ready" : "default"} />
        <RuntimeMetric label="Workspace status" value={isConnected ? "Online" : "Waiting"} tone={isConnected ? "ready" : "attention"} />
      </div>
      <div className="theme-border overflow-hidden rounded-xl border">
        {workers.length === 0 ? (
          <div className="theme-surface-muted px-4 py-7 text-center text-sm text-gray-500 dark:text-gray-400">
            No approved runtimes yet. Connect a runtime to create an approval request below.
          </div>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/8">
            {workers.map((worker) => {
              const labels = worker.metadata?.labels ?? [];
              const secondary = [worker.metadata?.host, worker.version ?? worker.metadata?.version]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={worker.api_key_id} className="flex items-center justify-between gap-4 px-4 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300"><Cpu className="h-4 w-4" /></span>
                    <div className="min-w-0">
                    <p className="theme-text truncate text-sm font-medium">
                      {worker.metadata?.name || worker.api_key_id}
                    </p>
                    <p className="theme-text-muted mt-1 text-xs">
                      {secondary || worker.api_key_id}
                    </p>
                    {labels.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {labels.map((label) => (
                          <span
                            key={`${worker.api_key_id}-${label}`}
                            className="theme-surface-muted theme-text-muted inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full motion-safe:animate-pulse",
                        worker.connected ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600",
                      )}
                    />
                    <span className="theme-text">
                      {worker.connected ? "Connected" : "Offline"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function RuntimeMetric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ready" | "attention" }) {
  return (
    <div className="theme-border theme-surface-muted rounded-xl border px-4 py-3">
      <p className={cn("text-lg font-semibold", tone === "ready" ? "text-emerald-600 dark:text-emerald-300" : tone === "attention" ? "text-amber-600 dark:text-amber-300" : "theme-text")}>{value}</p>
      <p className="theme-text-muted mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}

function AccountHandleSettings() {
  const { currentUser, isLoading, mutate } = useCurrentUser();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(currentUser?.username ?? "");
  }, [currentUser?.username]);

  const normalized = username.trim().replace(/^@+/, "").toLowerCase();
  const unchanged = normalized === (currentUser?.username ?? "");
  const canSave = /^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized) && !unchanged && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await updateCurrentUser({ username: normalized });
      await mutate(updated, { revalidate: false });
      toast.success("Username saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save username.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Account"
      description="Your username is used as a notification handle for agents and mentions."
    >
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="theme-text truncate text-sm font-medium">
            {currentUser?.name || currentUser?.email || "Current account"}
          </p>
          <p className="theme-text-muted mt-1 truncate text-xs">
            {currentUser?.email ?? currentUser?.user_id ?? "Loading account"}
          </p>
        </div>

        <div className="max-w-xl">
          <label className="theme-text mb-2 block text-sm font-medium" htmlFor="account-username">
            Notification handle
          </label>
          <div className="theme-border flex min-h-11 w-full flex-col overflow-hidden rounded-lg border sm:flex-row">
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 px-3">
              <AtSign className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                id="account-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="casey"
                disabled={isLoading || saving}
                className="theme-text min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              className={cn(
                "theme-border flex h-11 shrink-0 items-center justify-center gap-2 border-t px-4 text-sm font-medium transition-colors sm:border-l sm:border-t-0",
                canSave
                  ? "text-gray-900 hover:bg-black/[0.03] dark:text-gray-100 dark:hover:bg-white/[0.04]"
                  : "text-gray-400 dark:text-gray-600",
              )}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving" : "Save"}
            </button>
          </div>
          <p className="theme-text-muted mt-2 text-xs leading-5">
            Use 3-32 lowercase letters, numbers, underscores, or hyphens. Agents can notify you at
            {" "}
            <span className="theme-text font-medium">
              @{normalized || "username"}
            </span>
            .
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

function SettingsContent() {
  const isMobileViewport = useIsMobileViewport();
  const { theme, setTheme } = useTheme();
  const { activeOrganization } = useOrgContext();
  const [activeTab, setActiveTab] = useTabParam<SettingsTab>("general", SETTINGS_TABS);
  const {
    enableNotifications,
    disableNotifications,
    isStandalone,
    notificationsEnabled,
    notificationsSupported,
  } = usePwa();
  const [pushBusy, setPushBusy] = useState(false);
  const activeContext = TAB_CONTEXT[activeTab];

  const handlePushToggle = async () => {
    setPushBusy(true);
    try {
      if (notificationsEnabled) {
        await disableNotifications();
        toast.success("Push notifications disabled.");
      } else {
        await enableNotifications();
        toast.success("Push notifications enabled.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update push notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const tabs = [
    { id: "general", label: "General", icon: <Palette className="h-4 w-4" />, href: "/dashboard/settings" },
    { id: "org", label: "Org", icon: <Building2 className="h-4 w-4" />, href: "/dashboard/settings?tab=org" },
    { id: "runtime", label: "Runtime", icon: <Cpu className="h-4 w-4" />, href: "/dashboard/settings?tab=runtime" },
    { id: "devices", label: "Devices", icon: <HardDrive className="h-4 w-4" />, href: "/dashboard/settings?tab=devices" },
    { id: "keys", label: "Keys", icon: <KeyRound className="h-4 w-4" />, href: "/dashboard/settings?tab=keys" },
  ] satisfies Array<{ id: SettingsTab; label: string; icon: React.ReactNode; href: string }>;

  const content = (
    <PageContent className="py-6 md:py-8">
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]} />
        <section className="theme-border theme-surface relative overflow-hidden rounded-[1.5rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.05)] md:p-6">
          <div className="pointer-events-none absolute -right-10 -top-24 h-52 w-52 rounded-full bg-deep-space-blue-400/15 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="theme-text-muted text-[10px] font-semibold uppercase tracking-[0.16em]">Workspace controls</p>
              <h1 className="theme-text mt-1 text-2xl font-semibold tracking-[-0.03em]">{activeOrganization?.name ? `${activeOrganization.name} settings` : "Settings"}</h1>
              <p className="theme-text-muted mt-2 max-w-3xl text-sm leading-6">Manage personal preferences, organization access, execution trust, device security, and developer credentials from one place.</p>
            </div>
          </div>
        </section>

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as SettingsTab)}
          layoutId="settings-tab-indicator"
        />

        <div className="theme-border flex items-start gap-3 border-b pb-5">
          <span className="theme-surface-muted theme-text-muted rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{activeContext.eyebrow}</span>
          <div>
            <h2 className="theme-text text-base font-semibold">{activeContext.title}</h2>
            <p className="theme-text-muted mt-1 text-sm leading-6">{activeContext.description}</p>
          </div>
        </div>

        {activeTab === "general" && (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <AccountHandleSettings />
            <div className="space-y-6">
              <SettingsSection title="Appearance" description="Choose how this workspace follows your environment.">
                <AppearanceControls theme={theme} setTheme={setTheme} />
              </SettingsSection>
              <SettingsSection
                title="Notifications"
                description={notificationsSupported ? notificationsEnabled ? "Agent push is enabled for this device." : isStandalone ? "Enable push for this installed app." : "Install the app to enable push notifications." : "Push notifications are not supported on this device/browser."}
              >
                {notificationsSupported && isStandalone ? (
                  <Button variant={notificationsEnabled ? "danger" : "secondary"} isLoading={pushBusy} onClick={() => void handlePushToggle()}>
                    {notificationsEnabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    {notificationsEnabled ? "Disable push" : "Enable push"}
                  </Button>
                ) : (
                  <div className="theme-surface-muted theme-border flex items-center gap-3 rounded-xl border px-4 py-3">
                    <Bell className="theme-text-muted h-4 w-4 shrink-0" />
                    <p className="theme-text-muted text-sm">No notification action is available on this device right now.</p>
                  </div>
                )}
              </SettingsSection>
            </div>
          </div>
        )}

        {activeTab === "org" && <OrgSettingsSection />}

        {activeTab === "runtime" && (
          <div className="space-y-6">
            <ContentEncryptionSection mode="workers" afterSummary={<WorkerStatusPanel />} />
          </div>
        )}

        {activeTab === "devices" && (
          <div className="space-y-6">
            <ContentEncryptionSection mode="devices" afterSummary={<UnlockMethodsSection />} />
          </div>
        )}

        {activeTab === "keys" && (
          <div className="space-y-6">
            <ApiKeysSection />
          </div>
        )}
      </div>
    </PageContent>
  );

  if (isMobileViewport) {
    return <MobilePageShell title="Settings">{content}</MobilePageShell>;
  }

  return (
    <>
      <TopBar title="Settings" />
      {content}
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
