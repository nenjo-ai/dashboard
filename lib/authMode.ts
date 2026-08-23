export type LocalAuthIdentity = {
  subject: string;
  name: string;
  email: string;
};

export type DashboardAuthConfig =
  | {
      kind: "clerk";
      publishableKey: string;
    }
  | {
      kind: "clerk_unconfigured";
    }
  | {
      kind: "local";
      identity: LocalAuthIdentity;
    };

type AuthEnvironment = Readonly<Record<string, string | undefined>>;

const LOCAL_SUBJECT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_LOCAL_IDENTITY: LocalAuthIdentity = {
  subject: "local_dev",
  name: "Local Developer",
  email: "local@nenjo.dev",
};

function requiredLocalValue(
  value: string | undefined,
  fallback: string,
  label: string,
  maxLength: number,
): string {
  const resolved = value?.trim() || fallback;
  if (resolved.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters`);
  }
  return resolved;
}

/**
 * Parse the server-owned dashboard authentication mode.
 *
 * Local authentication is intentionally explicit and unavailable in production.
 * A missing Clerk key remains a separately modeled configuration error so it can
 * never silently turn into an authentication bypass.
 */
export function resolveDashboardAuthConfig(
  environment: AuthEnvironment,
): DashboardAuthConfig {
  const rawMode = environment.NENJO_AUTH_MODE?.trim().toLowerCase() || "clerk";

  if (rawMode === "local") {
    if (environment.NODE_ENV === "production") {
      throw new Error("NENJO_AUTH_MODE=local is not allowed in production");
    }

    const subject = requiredLocalValue(
      environment.NENJO_LOCAL_AUTH_SUBJECT,
      DEFAULT_LOCAL_IDENTITY.subject,
      "NENJO_LOCAL_AUTH_SUBJECT",
      128,
    );
    if (!LOCAL_SUBJECT_PATTERN.test(subject)) {
      throw new Error(
        "NENJO_LOCAL_AUTH_SUBJECT may contain only letters, numbers, underscores, and hyphens",
      );
    }

    const name = requiredLocalValue(
      environment.NENJO_LOCAL_AUTH_NAME,
      DEFAULT_LOCAL_IDENTITY.name,
      "NENJO_LOCAL_AUTH_NAME",
      255,
    );
    const email = requiredLocalValue(
      environment.NENJO_LOCAL_AUTH_EMAIL,
      DEFAULT_LOCAL_IDENTITY.email,
      "NENJO_LOCAL_AUTH_EMAIL",
      255,
    ).toLowerCase();
    if (!email.includes("@")) {
      throw new Error("NENJO_LOCAL_AUTH_EMAIL must be an email address");
    }

    return {
      kind: "local",
      identity: { subject, name, email },
    };
  }

  if (rawMode !== "clerk") {
    throw new Error(`Unsupported NENJO_AUTH_MODE: ${rawMode}`);
  }

  const publishableKey =
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || "";
  return publishableKey
    ? { kind: "clerk", publishableKey }
    : { kind: "clerk_unconfigured" };
}

/** Return whether a request hostname is an explicitly supported loopback host. */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}
