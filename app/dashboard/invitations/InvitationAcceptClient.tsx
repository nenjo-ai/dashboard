"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { SignIn, useAuth, useUser } from "@clerk/nextjs";
import { acceptOrgInvitation, fetchOrgInvitationPreview, requestCurrentOrgContentKeyAccess } from "@/lib/api";
import type { OrgInvitationPreview } from "@/lib/types";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { SecureWorkspaceSetup } from "@/components/auth/SecureWorkspaceSetup";
import { Button } from "@/components/ui/Button";
import { useBootstrapStatus } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { ensureDeviceEncryptionIdentity } from "@/lib/cryptoContent";

const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function InvitationAcceptClient({ token: tokenProp }: { token?: string }) {
  const searchParams = useSearchParams();
  const token = tokenProp ?? searchParams.get("token") ?? "";
  const invitePath = token
    ? `/dashboard/invitations?token=${encodeURIComponent(token)}`
    : "/dashboard/invitations";
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [isAccepting, setIsAccepting] = useState(false);
  const { status: bootstrapStatus, isLoading: bootstrapLoading, mutate: mutateBootstrapStatus } = useBootstrapStatus(
    isLoaded && isSignedIn,
  );

  const { data, error, isLoading } = useSWR<OrgInvitationPreview>(
    isLoaded && isSignedIn && token ? ["org-invite", token] : null,
    ([, inviteToken]: [string, string]) => fetchOrgInvitationPreview(inviteToken),
    { revalidateOnFocus: false },
  );

  if (!CLERK_ENABLED) {
    return <ClerkConfigurationNotice compact />;
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 dark:bg-[#05070b]">
        <div className="theme-border theme-surface rounded-3xl border p-8 text-sm text-gray-500 dark:text-gray-400">
          Loading invitation...
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 py-10 dark:bg-[#05070b]">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Org invitation
            </p>
            <h1 className="theme-text mt-3 text-3xl font-semibold">
              Sign in to review this invite
            </h1>
            <p className="theme-text-muted mt-3 text-sm">
              Invitations are tied to the invited email address. Sign in with the matching account to continue.
            </p>
          </div>

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
            forceRedirectUrl={invitePath}
            signUpForceRedirectUrl={invitePath}
          />

          <div id="clerk-captcha" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 py-10 dark:bg-[#05070b]">
      <div className="theme-border theme-surface w-full max-w-2xl rounded-3xl border p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          Org invitation
        </p>
        <h1 className="theme-text mt-3 text-3xl font-semibold">
          Join {data?.org_name ?? "organization"}
        </h1>

        {isLoading && (
          <p className="theme-text-muted mt-4 text-sm">Loading invitation details...</p>
        )}

        {bootstrapLoading && isSignedIn && (
          <p className="theme-text-muted mt-2 text-sm">Checking secure workspace status...</p>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {error instanceof Error ? error.message : "Failed to load invitation."}
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-black/[0.03] px-4 py-3 dark:bg-white/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Invited email
                </p>
                <p className="theme-text mt-2 text-sm font-medium">{data.email}</p>
              </div>
              <div className="rounded-2xl bg-black/[0.03] px-4 py-3 dark:bg-white/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Role
                </p>
                <p className="theme-text mt-2 text-sm font-medium">{data.role}</p>
              </div>
            </div>

            <p className="theme-text-muted mt-4 text-sm">
              This grants access to shared org resources. Private chat history remains scoped to each user in the org.
            </p>

            {bootstrapStatus?.requires_secure_workspace ? (
              <div className="mt-8 space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  Set up your secure workspace before accepting this invitation. This creates your recovery bundle and registers this device.
                </div>
                <div className="rounded-2xl bg-black/[0.03] px-4 py-4 dark:bg-white/[0.04]">
                  <SecureWorkspaceSetup
                    userLabel={
                      user?.primaryEmailAddress?.emailAddress ??
                      user?.username ??
                      user?.id ??
                      "your account"
                    }
                    onContinue={() => {
                      void mutateBootstrapStatus();
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-8 flex items-center gap-3">
                <Button
                  isLoading={isAccepting}
                  onClick={async () => {
                    try {
                      setIsAccepting(true);
                      const accepted = await acceptOrgInvitation(token);
                      localStorage.setItem("nenjo.active-org-id", accepted.org_id);
                      const identity = await ensureDeviceEncryptionIdentity();
                      await requestCurrentOrgContentKeyAccess(identity.deviceId).catch(() => undefined);
                      toast.success("Invitation accepted. Your device is now waiting for owner or admin approval.");
                      router.replace("/dashboard/settings?tab=org");
                    } catch (acceptError) {
                      toast.error(acceptError instanceof Error ? acceptError.message : "Failed to accept invitation.");
                    } finally {
                      setIsAccepting(false);
                    }
                  }}
                >
                  Accept invitation
                </Button>
                <a
                  href="/dashboard"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                >
                  Back to dashboard
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
