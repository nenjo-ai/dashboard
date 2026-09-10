import { resolveDashboardSession } from "@/lib/server/dashboardAuth";

export const runtime = "nodejs";

function failure(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status });
}

/** Public registry discovery is owned by the dashboard, independently of platform CRUD. */
export async function GET(request: Request): Promise<Response> {
  let session;
  try {
    session = await resolveDashboardSession(request.url);
  } catch {
    return failure("Dashboard authentication is not configured", 500);
  }
  if (session.kind !== "authenticated") {
    switch (session.kind) {
      case "unauthenticated": return failure("Authentication required", 401);
      case "forbidden_local_host": return failure("Local authentication requires a loopback hostname", 403);
      case "unconfigured": return failure("Dashboard authentication is not configured", 500);
    }
  }

  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  const upstream = new URL("https://registry.modelcontextprotocol.io/v0.1/servers");
  if (name !== null) {
    if (name.length > 512 || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      return failure("Invalid MCP registry server name", 400);
    }
    // A query parameter avoids namespace slashes being decoded by intermediate routers.
    upstream.pathname += `/${encodeURIComponent(name)}/versions/latest`;
  } else {
    const query = params.get("q")?.trim() ?? "";
    const cursor = params.get("cursor");
    const limit = Number(params.get("limit") ?? 20);
    if (query.length > 512 || (cursor?.length ?? 0) > 2048 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return failure("Invalid MCP registry search parameters", 400);
    }
    upstream.searchParams.set("search", query);
    upstream.searchParams.set("version", "latest");
    upstream.searchParams.set("limit", String(limit));
    if (cursor) upstream.searchParams.set("cursor", cursor);
  }

  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
      // Only public registry metadata is cached; no workspace credentials are forwarded.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) {
      return name && response.status === 404
        ? failure("This server was not found in the MCP registry", 404)
        : failure("The MCP registry is temporarily unavailable. Please try again.", 502);
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return failure("Could not reach the MCP registry. Please try again.", 502);
  }
}
