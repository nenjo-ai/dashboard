"use client";

import dynamic from "next/dynamic";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

// The onboarding flow depends on browser-only cryptography and storage, so it
// is intentionally rendered only on the client.
const OnboardingContent = dynamic(() => import("./OnboardingContent"), {
  ssr: false,
  loading: () => (
    <div className="theme-app-bg flex min-h-screen items-center justify-center">
      <LoadingStatus label="Loading onboarding" />
    </div>
  ),
});

export default function OnboardingPage() {
  return <OnboardingContent />;
}
