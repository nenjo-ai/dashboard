"use client";

import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MobilePageShell } from "@/components/layout/MobilePageShell";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { SecureWorkspaceSetup } from "@/components/auth/SecureWorkspaceSetup";
import { useSafeRouter } from "@/lib/safeRouter";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

export default function SecureWorkspaceBootstrapPage() {
  const router = useSafeRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const isMobileViewport = useIsMobileViewport();
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";
  const userLabel =
    user?.primaryEmailAddress?.emailAddress ??
    user?.username ??
    user?.id ??
    "your account";

  const content = (
    <PageContent className="py-6 md:py-8">
      <div className="mx-auto max-w-3xl">
        <SecureWorkspaceSetup
          userLabel={userLabel}
          onContinue={() => {
            router.replace(redirectUrl);
          }}
        />
      </div>
    </PageContent>
  );

  if (isMobileViewport) {
    return <MobilePageShell title="Secure workspace">{content}</MobilePageShell>;
  }

  return (
    <>
      <TopBar title="Secure workspace" />
      {content}
    </>
  );
}
