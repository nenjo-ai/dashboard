"use client";

import { useEffect } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { useAppAuth } from "@/components/auth/AppAuth";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { useSafeRouter } from "@/lib/safeRouter";

export default function SSOCallbackPage() {
  const { mode } = useAppAuth();
  const router = useSafeRouter();

  useEffect(() => {
    if (mode === "local") {
      router.replace("/dashboard");
    }
  }, [mode, router]);

  if (mode === "unconfigured") {
    return <ClerkConfigurationNotice compact />;
  }

  if (mode === "local") {
    return null;
  }

  return <AuthenticateWithRedirectCallback />;
}
