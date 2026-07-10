import { Suspense } from "react";
import { SecureWorkspaceBootstrapClient } from "./SecureWorkspaceBootstrapClient";

function SecureWorkspaceBootstrapFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#05070b]">
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading secure workspace...</span>
        </div>
      </div>
    </div>
  );
}

export default function SecureWorkspaceBootstrapPage() {
  return (
    <Suspense fallback={<SecureWorkspaceBootstrapFallback />}>
      <SecureWorkspaceBootstrapClient />
    </Suspense>
  );
}
