"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";

const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SSOCallbackPage() {
  if (!CLERK_ENABLED) {
    return <ClerkConfigurationNotice compact />;
  }

  return <AuthenticateWithRedirectCallback />;
}
