/**
 * Authentication utilities for browser calls to the backend API.
 *
 * Browser code should call the dashboard BFF, which verifies the Clerk cookie
 * session server-side and attaches an internal platform credential.
 */

/**
 * Create an authenticated fetch function for dashboard BFF requests.
 *
 * Usage (in a client component):
 * ```ts
 * import { createAuthFetch } from "@/lib/auth";
 *
 * const authFetch = createAuthFetch();
 * const res = await authFetch("/api/platform/projects");
 * ```
 */
export function createAuthFetch(
  getToken?: () => Promise<string | null>,
) {
  void getToken;

  return async function authFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * Verify the current session against the backend.
 * Returns the verification response or throws on failure.
 */
export async function verifySession(
  getToken?: () => Promise<string | null>,
  apiBase?: string,
): Promise<{
  authenticated: boolean;
  user_id: string;
  session_id: string | null;
  issuer: string | null;
}> {
  void getToken;
  void apiBase;

  const res = await fetch("/api/platform/auth/me", {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`Session verification failed: ${body}`);
  }

  const body = await res.json();
  return {
    authenticated: true,
    user_id: body.clerk_id ?? body.user_id,
    session_id: body.session_id ?? null,
    issuer: null,
  };
}
