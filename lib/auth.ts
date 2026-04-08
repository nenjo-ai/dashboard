/**
 * Authentication utilities for integrating Clerk with the backend API.
 *
 * Provides helpers to attach Clerk session tokens to outgoing fetch requests
 * so the Rust/Axum backend can verify them via JWKS.
 */

/**
 * Create an authenticated fetch function that automatically attaches
 * the Clerk session token to requests.
 *
 * Usage (in a client component):
 * ```ts
 * import { useAuth } from "@clerk/nextjs";
 * import { createAuthFetch } from "@/lib/auth";
 *
 * const { getToken } = useAuth();
 * const authFetch = createAuthFetch(getToken);
 * const res = await authFetch("/api/v1/projects");
 * ```
 */
export function createAuthFetch(
  getToken: () => Promise<string | null>,
) {
  return async function authFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const token = await getToken();

    const headers = new Headers(init?.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
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
  getToken: () => Promise<string | null>,
  apiBase: string,
): Promise<{
  authenticated: boolean;
  user_id: string;
  session_id: string | null;
  issuer: string | null;
}> {
  const token = await getToken();
  if (!token) {
    throw new Error("No session token available");
  }

  const res = await fetch(`${apiBase}/api/v1/auth/verify`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`Session verification failed: ${body}`);
  }

  return res.json();
}
