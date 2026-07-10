import { Suspense } from "react";
import InvitationAcceptClient from "./InvitationAcceptClient";

function InvitationPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 dark:bg-[#05070b]">
      <div className="theme-border theme-surface rounded-3xl border p-8 text-sm text-gray-500 dark:text-gray-400">
        Loading invitation...
      </div>
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <Suspense fallback={<InvitationPageFallback />}>
      <InvitationAcceptClient />
    </Suspense>
  );
}
