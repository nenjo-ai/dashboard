"use client";

import dynamic from "next/dynamic";

// The onboarding flow depends on browser-only cryptography and storage, so it
// is intentionally rendered only on the client.
const OnboardingContent = dynamic(() => import("./OnboardingContent"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  ),
});

export default function OnboardingPage() {
  return <OnboardingContent />;
}
