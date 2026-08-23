"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { useAppAuth } from "@/components/auth/AppAuth";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import { useSafeRouter } from "@/lib/safeRouter";

function LoginContent() {
  const { isLoaded, isSignedIn, mode } = useAppAuth();
  const router = useSafeRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const requestedRedirect = searchParams.get("redirect_url");
  const redirectUrl = requestedRedirect || (mode === "local" ? "/dashboard" : "/dashboard/onboarding");
  const signUpHref = `/dashboard/signup?redirect_url=${encodeURIComponent(redirectUrl)}`;

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(redirectUrl);
    }
  }, [isLoaded, isSignedIn, redirectUrl, router]);

  if (mode === "unconfigured") {
    return <ClerkConfigurationNotice compact />;
  }

  if (mode === "local") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070f] text-sm text-gray-400">
        Opening the local dashboard…
      </div>
    );
  }

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

      <p className="mb-4 text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        <span className="font-medium text-gray-800 dark:text-gray-200">~2 min setup</span>{" "}
        if you already have an LLM provider API key — sign in, secure your device, and connect a
        worker.
      </p>

      {/* Clerk SignIn component — configured for GitHub OAuth only */}
      <SignIn
        routing="hash"
        withSignUp={false}
        signUpUrl="/dashboard/signup"
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

      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Don&apos;t have an account?{" "}
        <Link href={signUpHref} className="font-medium text-gray-700 underline hover:text-gray-900 dark:text-gray-200 dark:hover:text-white">
          Sign up
        </Link>
      </p>

      {/* Clerk CAPTCHA widget mount point (bot protection) */}
      <div id="clerk-captcha" />

      {/* Terms notice */}
      <p className="mt-6 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
        By signing in, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-300">
          Privacy Policy
        </Link>
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
  return (
    <div className="flex min-h-screen bg-[#05070f] lg:overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Left panel – branding / meaning of "Nenjo"                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="onboarding-landing onboarding-brand-panel relative hidden overflow-hidden border-r border-white/10 bg-[#05070f] p-12 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <div className="onboarding-brand-grid" />
        <div className="onboarding-brand-glow" />

        {/* Top – Logo */}
        <div className="relative z-10">
          <Link
            href="/"
            className="onboarding-brand-link inline-flex items-center gap-3 text-white transition-colors"
          >
            <NenjoLogoMark className="h-10 w-10 rounded-lg" />
            <span className="text-sm font-light tracking-[0.25em] text-white uppercase">
              Nenjo
            </span>
          </Link>
        </div>

        {/* Center – Japanese meaning */}
        <div className="relative z-10 flex flex-col items-start gap-8">
          {/* Large Japanese characters */}
          <div className="flex flex-col gap-2">
            <span className="onboarding-kanji text-8xl font-light tracking-wider leading-none">
              念
            </span>
            <span className="onboarding-kanji text-8xl font-light tracking-wider leading-none">
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
            <h2 className="onboarding-quote text-2xl font-semibold leading-snug text-white/95">
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
      <div className="flex min-h-screen w-full flex-col items-center justify-center overflow-y-auto bg-[#f4f6fb] px-4 py-8 text-gray-900 sm:px-6 sm:py-10 lg:w-1/2 lg:px-8 lg:py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-3 text-gray-900 transition-colors hover:text-[#b8841a]"
            >
              <NenjoLogoMark className="h-10 w-10 rounded-lg" />
              <span className="text-sm font-light uppercase tracking-[0.25em]">
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
