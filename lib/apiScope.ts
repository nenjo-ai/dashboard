const PLATFORM_API_PREFIX = "/api/platform";

const ORG_INDEPENDENT_PATHS = new Set([
  "/api/platform/auth/me",
  "/api/platform/auth/bootstrap-status",
  "/api/platform/orgs",
  "/api/platform/orgs/",
  "/api/platform/orgs/current",
]);

function apiPath(url: string): string {
  try {
    return new URL(url, "http://dashboard.local").pathname;
  } catch {
    return url.split("?", 1)[0] ?? url;
  }
}

/** Whether a dashboard platform request is scoped by X-Nenjo-Org-Id. */
export function isOrgScopedPlatformApiUrl(url: string): boolean {
  const path = apiPath(url);
  if (!path.startsWith(`${PLATFORM_API_PREFIX}/`)) {
    return false;
  }
  if (ORG_INDEPENDENT_PATHS.has(path)) {
    return false;
  }

  return !/^\/api\/platform\/orgs\/invitations\/[^/]+(?:\/accept)?$/.test(
    path,
  );
}
