"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { SignIn, useAuth } from "@clerk/nextjs";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";

const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function LoginContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard/onboarding";

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(redirectUrl);
    }
  }, [isLoaded, isSignedIn, redirectUrl, router]);

  return (
    <>
      {/* Error message from failed auth */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Authentication failed</p>
          <p className="mt-1 text-red-600 dark:text-red-300">
            {error === "oauth_failed"
              ? "GitHub sign-in was cancelled or failed. Please try again."
              : error === "session_expired"
              ? "Your session has expired. Please sign in again."
              : "An error occurred during sign-in. Please try again."}
          </p>
        </div>
      )}

      {/* Clerk SignIn component — configured for GitHub OAuth only */}
      <SignIn
        routing="hash"
        withSignUp={false}
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "w-full rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/20",
            headerTitle: "text-2xl font-bold text-gray-900 dark:text-white",
            headerSubtitle: "text-sm text-gray-500 dark:text-gray-400",
            socialButtonsBlockButton:
              "flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-xs transition-all hover:bg-gray-50 hover:shadow-md active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600",
            socialButtonsBlockButtonText: "text-sm font-medium",
            footer: "hidden",
            formFieldInput:
              "rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white",
            dividerLine: "bg-gray-200 dark:bg-gray-700",
            dividerText: "text-xs text-gray-400 dark:text-gray-500",
          },
          layout: {
            socialButtonsPlacement: "top",
            socialButtonsVariant: "blockButton",
          },
        }}
        forceRedirectUrl={redirectUrl}
        signUpForceRedirectUrl={redirectUrl}
      />

      {/* Clerk CAPTCHA widget mount point (bot protection) */}
      <div id="clerk-captcha" />

      {/* Terms notice */}
      <p className="mt-6 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
        By signing in, you agree to our{" "}
        <a href="#" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Privacy Policy
        </a>
        .
      </p>

      {/* Back to home */}
      <div className="mt-6 text-center">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  if (!CLERK_ENABLED) {
    return <ClerkConfigurationNotice compact />;
  }

  return (
    <div className="flex min-h-screen">
      {/* ------------------------------------------------------------------ */}
      {/* Left panel – branding / meaning of "Nenjo"                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between bg-deep-space-blue-900 p-12 text-white overflow-hidden">
        {/* Decorative background elements */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-deep-space-blue-800 via-deep-space-blue-900 to-gray-900" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-deep-space-blue-700/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 -right-20 h-[400px] w-[400px] rounded-full bg-vivid-tangerine-500/10 blur-3xl" />

        {/* Top – Logo */}
        <div className="relative z-10">
          <Link href="/" className="text-2xl font-bold text-white hover:text-deep-space-blue-200 transition-colors">
            Nenjo
          </Link>
        </div>

        {/* Center – Japanese meaning */}
        <div className="relative z-10 flex flex-col items-start gap-8">
          {/* Large Japanese characters */}
          <div className="flex flex-col gap-2">
            <span className="text-8xl font-light tracking-wider text-white/90 leading-none">
              念
            </span>
            <span className="text-8xl font-light tracking-wider text-white/90 leading-none">
              助
            </span>
          </div>

          {/* Romanization */}
          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-white/30" />
            <span className="text-lg font-light tracking-[0.3em] text-white/60 uppercase">
              Nenjo
            </span>
          </div>

          {/* Meaning */}
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold leading-snug text-white/95">
              &ldquo;Mindful assistance&rdquo;
            </h2>
            <p className="text-base leading-relaxed text-white/60">
              <span className="text-white/80 font-medium">念 (nen)</span> — thought, mindfulness, attention.
              The focused intention behind every action.
            </p>
            <p className="text-base leading-relaxed text-white/60">
              <span className="text-white/80 font-medium">助 (jo)</span> — help, assistance, support.
              The act of empowering others to achieve more.
            </p>
            <p className="mt-6 text-sm leading-relaxed text-white/40">
              Together, Nenjo represents the philosophy of thoughtful, intelligent assistance —
              AI agents that work with purpose and precision to help you build faster.
            </p>
          </div>
        </div>

        {/* Bottom – subtle footer */}
        <div className="relative z-10">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Nenjo. All rights reserved.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right panel – Sign in with GitHub via Clerk                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-full flex-col items-center justify-center bg-gray-100 px-6 dark:bg-gray-950 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Mobile-only logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/">
              <span className="text-3xl font-bold text-deep-space-blue-600 dark:text-deep-space-blue-400">
                Nenjo
              </span>
            </Link>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
            </div>
          }>
            <LoginContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
