import { auth } from "@clerk/nextjs/server";

import {
  isLoopbackHostname,
  resolveDashboardAuthConfig,
  type DashboardAuthConfig,
} from "@/lib/authMode";

export type DashboardSession = {
  userId: string;
  sessionId: string | null;
  provisioningProfile?: {
    name: string;
    email: string;
  };
};

export type DashboardSessionResolution =
  | { kind: "authenticated"; session: DashboardSession }
  | { kind: "unauthenticated" }
  | { kind: "forbidden_local_host" }
  | { kind: "unconfigured" };

export function dashboardAuthConfig(): DashboardAuthConfig {
  return resolveDashboardAuthConfig(process.env);
}

/**
 * Resolve the dashboard identity that is allowed to mint a platform token.
 *
 * Clerk mode verifies the browser's Clerk cookie. Local mode substitutes one
 * server-configured identity, but only for loopback requests. Callers must
 * still sign a short-lived internal JWT before contacting the platform.
 */
export async function resolveDashboardSession(
  requestUrl: string,
): Promise<DashboardSessionResolution> {
  const config = dashboardAuthConfig();

  switch (config.kind) {
    case "local": {
      if (!isLoopbackHostname(new URL(requestUrl).hostname)) {
        return { kind: "forbidden_local_host" };
      }
      return {
        kind: "authenticated",
        session: {
          userId: config.identity.subject,
          sessionId: `local-${config.identity.subject}`,
          provisioningProfile: {
            name: config.identity.name,
            email: config.identity.email,
          },
        },
      };
    }
    case "clerk_unconfigured":
      return { kind: "unconfigured" };
    case "clerk": {
      const { userId, sessionId } = await auth();
      return userId
        ? {
            kind: "authenticated",
            session: { userId, sessionId },
          }
        : { kind: "unauthenticated" };
    }
  }
}
