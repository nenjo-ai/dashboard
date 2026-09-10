const MAX_PLATFORM_PATH_SEGMENTS = 32;
const MAX_PLATFORM_PATH_SEGMENT_BYTES = 512;
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "location",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function validatePlatformPathSegment(segment: string): void {
  if (
    !segment
    || segment === "."
    || segment === ".."
    || segment.includes("/")
    || segment.includes("\\")
    || Buffer.byteLength(segment, "utf8") > MAX_PLATFORM_PATH_SEGMENT_BYTES
    || /[\u0000-\u001f\u007f]/.test(segment)
  ) {
    throw new Error("Invalid platform proxy path segment");
  }
}

/** Build an upstream API URL without allowing catch-all segments to escape `/api/v1`. */
export function buildPlatformApiUrl(
  rawBaseUrl: string,
  path: readonly string[],
  rawSearch = "",
): URL {
  const baseUrl = new URL(rawBaseUrl);
  if (
    (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:")
    || baseUrl.username
    || baseUrl.password
    || path.length === 0
    || path.length > MAX_PLATFORM_PATH_SEGMENTS
  ) {
    throw new Error("Invalid platform proxy target");
  }

  path.forEach((segment, index) => {
    // Next decodes the registry's namespace/name into a single catch-all
    // parameter. Allow that identifier only on the registry detail route,
    // then re-encode it below so it remains one upstream path segment.
    if (path.length === 4 && path[0] === "mcp-servers"
      && path[1] === "registry" && index === 2 && path[3] === "latest"
      && /^[a-zA-Z0-9][a-zA-Z0-9.-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)
      && Buffer.byteLength(segment, "utf8") <= MAX_PLATFORM_PATH_SEGMENT_BYTES) {
      return;
    }
    validatePlatformPathSegment(segment);
  });
  const upstream = new URL(baseUrl.origin);
  upstream.pathname = `/api/v1/${path.map(encodeURIComponent).join("/")}`;
  upstream.search = rawSearch;
  return upstream;
}

/** Keep upstream transport, redirect, and cookie authority out of the dashboard response. */
export function forwardPlatformResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers();
  upstreamHeaders.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}
