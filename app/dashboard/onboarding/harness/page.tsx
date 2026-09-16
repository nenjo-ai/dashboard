"use client";

import dynamic from "next/dynamic";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

// The pairing landing page depends on browser-only cryptography and storage
// (URL fragment capture, sessionStorage attempt state, Web Crypto key
// wrapping), so it is intentionally rendered only on the client.
const HarnessPairingContent = dynamic(() => import("./HarnessPairingContent"), {
  ssr: false,
  loading: () => (
    <div className="theme-app-bg flex min-h-screen items-center justify-center">
      <LoadingStatus label="Loading harness connection" />
    </div>
  ),
});

export default function HarnessPairingPage() {
  return <HarnessPairingContent />;
}
