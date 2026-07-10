import { Suspense } from "react";
import LoginClientPage from "./LoginClientPage";

function LoginPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginClientPage />
    </Suspense>
  );
}
