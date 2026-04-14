"use client";

import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { ApiKeysSection } from "@/components/settings/ApiKeysSection";

import { useTheme } from "@/lib/theme";
import { PageContent } from "@/components/ui/PageContent";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function SettingsPage() {
  const isMobileViewport = useIsMobileViewport();
  const { theme, setTheme } = useTheme();

  return (
    <>
      {isMobileViewport ? (
      <MobilePageShell title="Settings">
        <div className="space-y-6">
          <div className="rounded-[1.5rem] border border-black/10 bg-transparent p-5 dark:border-white/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Appearance
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["light", "dark", "system"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTheme(option)}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${
                    theme === option
                      ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                      : "border-black/10 bg-transparent text-gray-600 dark:border-white/10 dark:bg-transparent dark:text-gray-300"
                  }`}
                >
                  <span className="capitalize">{option}</span>
                </button>
              ))}
            </div>
          </div>
          <ApiKeysSection />
        </div>
      </MobilePageShell>
      ) : (
      <>
        <TopBar title="Settings" />

        <PageContent className="space-y-6">
          <div className="theme-border theme-surface rounded-xl border p-6 shadow-xs">
            <h2 className="theme-text text-lg font-semibold">
              Appearance
            </h2>
            <p className="theme-text-muted mt-1 text-sm">
              Customize how Nenjo looks on your device.
            </p>

            <div className="mt-6">
              <label className="theme-text-muted text-sm font-medium">
                Theme
              </label>
              <div className="mt-3 flex gap-3">
                {(["light", "dark", "system"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => setTheme(option)}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 px-5 py-4 text-sm font-medium transition-colors ${
                      theme === option
                        ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/30 dark:text-deep-space-blue-300"
                        : "theme-border theme-surface text-gray-600 hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)] dark:text-gray-300"
                    }`}
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
                ))}
              </div>
            </div>
          </div>

          <ApiKeysSection />
        </PageContent>
      </>
      )}
    </>
  );
}
