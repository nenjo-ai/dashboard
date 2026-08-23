"use client";

import { useMemo, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

import {
  AppAuthContext,
  type AppAuthContextValue,
  type AppAuthUser,
} from "@/components/auth/AppAuth";

/** Map Clerk's client session shape into the dashboard's auth-independent API. */
export function ClerkAppAuthProvider({ children }: { children: ReactNode }) {
  const {
    isLoaded: authIsLoaded,
    isSignedIn: authIsSignedIn,
    signOut: clerkSignOut,
  } = useAuth();
  const {
    isLoaded: userIsLoaded,
    isSignedIn: userIsSignedIn,
    user: clerkUser,
  } = useUser();

  const value = useMemo<AppAuthContextValue>(() => {
    const user: AppAuthUser | null = clerkUser
      ? {
          id: clerkUser.id,
          firstName: clerkUser.firstName,
          fullName: clerkUser.fullName,
          username: clerkUser.username,
          imageUrl: clerkUser.imageUrl,
          primaryEmailAddress: clerkUser.primaryEmailAddress
            ? { emailAddress: clerkUser.primaryEmailAddress.emailAddress }
            : null,
          externalAccounts: clerkUser.externalAccounts.map((account) => ({
            provider: account.provider,
            username: account.username ?? null,
          })),
        }
      : null;

    return {
      mode: "clerk",
      isLoaded: authIsLoaded && userIsLoaded,
      isSignedIn: Boolean(authIsSignedIn && userIsSignedIn),
      canSignOut: true,
      user,
      signOut: async (options) => {
        await clerkSignOut(options);
      },
    };
  }, [
    authIsLoaded,
    authIsSignedIn,
    clerkSignOut,
    clerkUser,
    userIsLoaded,
    userIsSignedIn,
  ]);

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}
