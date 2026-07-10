import { Suspense } from "react";
import SignupClientPage from "./SignupClientPage";

function SignupPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupPageFallback />}>
      <SignupClientPage />
    </Suspense>
  );
}
