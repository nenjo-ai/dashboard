"use client";

import Link from "next/link";

interface ClerkConfigurationNoticeProps {
  compact?: boolean;
}

export function ClerkConfigurationNotice({
  compact = false,
}: ClerkConfigurationNoticeProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6 py-10 dark:bg-gray-950">
      <div
        className={
          compact
            ? "w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20"
            : "w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20"
        }
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-deep-space-blue-500">
          Authentication Unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
          Configure Clerk to use the dashboard
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is not set, so authentication UI
          and protected dashboard routes are disabled in this environment.
        </p>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Add the Clerk publishable key to your environment, restart the app,
          and reload this page.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
