export const MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES = 64 * 1024 * 1024;

function configuredOrigins(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    throw new Error("ARTIFACT_DOWNLOAD_ORIGINS is required");
  }
  return new Set(raw.split(",").map((entry) => {
    const value = new URL(entry.trim());
    if (
      (value.protocol !== "https:" && value.protocol !== "http:")
      || value.username
      || value.password
      || (value.pathname !== "/" && value.pathname !== "")
      || value.search
      || value.hash
    ) {
      throw new Error("ARTIFACT_DOWNLOAD_ORIGINS must contain HTTP origins only");
    }
    return value.origin;
  }));
}

/** Validate a platform-issued object URL against a server-owned origin allowlist. */
export function validateArtifactDownloadUrl(
  rawUrl: string,
  rawAllowedOrigins = process.env.ARTIFACT_DOWNLOAD_ORIGINS,
): URL {
  const url = new URL(rawUrl);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || !configuredOrigins(rawAllowedOrigins).has(url.origin)
  ) {
    throw new Error("Artifact download URL is not on an allowed object-store origin");
  }
  return url;
}
