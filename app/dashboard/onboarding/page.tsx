"use client";

import dynamic from "next/dynamic";

// Dynamically import the onboarding content with SSR disabled.
// This prevents build failures when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// is not set, since useUser() requires ClerkProvider at render time.
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
