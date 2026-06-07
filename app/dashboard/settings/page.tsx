"use client";

import { Suspense, useState } from "react";
import {
  Bell,
  BellOff,
  Building2,
  Cpu,
  HardDrive,
  KeyRound,
  Palette,
} from "lucide-react";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { ContentEncryptionSection } from "@/components/settings/ContentEncryptionSection";
import { OrgSettingsSection } from "@/components/settings/OrgSettingsSection";
import { usePwa } from "@/components/pwa/PwaProvider";
import { PageContent } from "@/components/ui/PageContent";
import { Tabs } from "@/components/ui/Tabs";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";
import { cn } from "@/lib/cn";
import { useTabParam, useWorkerStatus } from "@/lib/hooks";
import { useOrgContext } from "@/lib/org-context";

const SETTINGS_TABS = ["general", "org", "runtime", "devices", "keys"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function SettingsIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{eyebrow}</p>
      <div>
        <h1 className="theme-text text-2xl font-semibold">{title}</h1>
        <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">{description}</p>
      </div>
    </div>
  );
}

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
    <section className="overflow-hidden rounded-2xl border border-black/10 p-5 dark:border-white/10">
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
            onClick={() => setTheme(option)}
            className={cn(
              "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-sm font-medium transition-colors",
              active
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/10 bg-transparent text-gray-600 hover:bg-black/[0.03] dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.04]",
            )}
          >
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
            <span className="capitalize">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkerStatusPanel() {
  const { workers } = useWorkerStatus();

  return (
    <SettingsSection
      title="Harness Availability"
      description="Harnesses are org-scoped. Approval and runtime status here apply to the active organization."
    >
      <div className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
        {workers.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
            No approved harnesses yet.
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
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        worker.connected ? "bg-green-500" : "bg-red-500",
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
      <div className="space-y-8">
        <SettingsIntro
          eyebrow="Settings"
          title={activeOrganization?.name ? `${activeOrganization.name} settings` : "Settings"}
          description="General preferences, organization access, worker approvals, trusted devices, and API keys."
        />

        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as SettingsTab)}
          layoutId="settings-tab-indicator"
        />

        {activeTab === "general" && (
          <div className="space-y-6">
            <SettingsSection
              title="Appearance"
              description="Keep visual preferences simple and close to the content."
            >
              <AppearanceControls theme={theme} setTheme={setTheme} />
            </SettingsSection>

            <SettingsSection
              title="Notifications"
              description={
                notificationsSupported
                  ? notificationsEnabled
                    ? "Agent push is enabled for this device."
                    : isStandalone
                      ? "Enable push for this installed app."
                      : "Install the app to enable push notifications."
                  : "Push notifications are not supported on this device/browser."
              }
            >
              {notificationsSupported && isStandalone ? (
                <button
                  type="button"
                  onClick={() => void handlePushToggle()}
                  disabled={pushBusy}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium transition-colors",
                    notificationsEnabled
                      ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                      : "border-black/10 text-gray-900 hover:bg-black/[0.03] dark:border-white/10 dark:text-gray-100 dark:hover:bg-white/[0.04]",
                    pushBusy && "opacity-60",
                  )}
                >
                  {notificationsEnabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  {pushBusy ? "Updating..." : notificationsEnabled ? "Disable push" : "Enable push"}
                </button>
              ) : (
                <p className="theme-text-muted text-sm">No notification action is available on this device right now.</p>
              )}
            </SettingsSection>

          </div>
        )}

        {activeTab === "org" && <OrgSettingsSection />}

        {activeTab === "runtime" && (
          <div className="space-y-6">
            <WorkerStatusPanel />
            <ContentEncryptionSection mode="workers" />
          </div>
        )}

        {activeTab === "devices" && <ContentEncryptionSection mode="devices" />}

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
