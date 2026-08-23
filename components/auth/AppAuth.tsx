"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { LocalAuthIdentity } from "@/lib/authMode";

export type AppAuthMode = "clerk" | "local" | "unconfigured";

export type AppAuthUser = {
  id: string;
  firstName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  externalAccounts: ReadonlyArray<{
    provider: string;
    username: string | null;
  }>;
};

export type AppAuthContextValue = {
  mode: AppAuthMode;
  isLoaded: boolean;
  isSignedIn: boolean;
  canSignOut: boolean;
  user: AppAuthUser | null;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

export const AppAuthContext = createContext<AppAuthContextValue | null>(null);

const unavailableAuth: AppAuthContextValue = {
  mode: "unconfigured",
  isLoaded: true,
  isSignedIn: false,
  canSignOut: false,
  user: null,
  signOut: async () => {},
};

export function LocalAppAuthProvider({
  children,
  identity,
}: {
  children: ReactNode;
  identity: LocalAuthIdentity;
}) {
  const value = useMemo<AppAuthContextValue>(() => {
    const firstName = identity.name.trim().split(/\s+/, 1)[0] || identity.name;
    return {
      mode: "local",
      isLoaded: true,
      isSignedIn: true,
      canSignOut: false,
      user: {
        id: identity.subject,
        firstName,
        fullName: identity.name,
        username: identity.subject,
        imageUrl: null,
        primaryEmailAddress: { emailAddress: identity.email },
        externalAccounts: [],
      },
      signOut: async () => {},
    };
  }, [identity.email, identity.name, identity.subject]);

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function UnavailableAppAuthProvider({ children }: { children: ReactNode }) {
  return <AppAuthContext.Provider value={unavailableAuth}>{children}</AppAuthContext.Provider>;
}

export function useAppAuth(): AppAuthContextValue {
  const context = useContext(AppAuthContext);
  if (!context) {
    throw new Error("useAppAuth must be used within an app auth provider");
  }
  return context;
}
