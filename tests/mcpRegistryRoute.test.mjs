import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/api/mcp-registry/route.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

function handler({ kind = "authenticated", upstreamStatus = 200, fetchError = null } = {}) {
  const calls = [];
  const exports = {};
  new Function("require", "exports", "fetch", outputText)(
    (name) => {
      assert.equal(name, "@/lib/server/dashboardAuth");
      return { resolveDashboardSession: async () => ({ kind }) };
    },
    exports,
    async (url, options) => {
      calls.push({ url: String(url), options });
      if (fetchError) throw fetchError;
      return Response.json({ server: { name: "app.linear/linear" } }, { status: upstreamStatus });
    },
  );
  return { calls, get: (query) => exports.GET(new Request(`https://nenjo.ai/api/mcp-registry?${query}`, { headers: { cookie: "session=private", authorization: "Bearer private", "x-nenjo-org-id": "private-workspace" } })) };
}

test("Linear details go directly to the official registry with an encoded namespace", async () => {
  const { get, calls } = handler();
  const response = await get("name=app.linear%2Flinear");
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, "https://registry.modelcontextprotocol.io/v0.1/servers/app.linear%2Flinear/versions/latest");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json" });
  assert.equal(calls[0].options.next.revalidate, 3600);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("registry search requests latest versions and preserves opaque pagination cursors", async () => {
  const { get, calls } = handler();
  assert.equal((await get("q=linear&limit=20&cursor=app.linear%2Flinear%3A1.0%2Bnext")).status, 200);
  const url = new URL(calls[0].url);
  assert.equal(url.origin, "https://registry.modelcontextprotocol.io");
  assert.equal(url.searchParams.get("search"), "linear");
  assert.equal(url.searchParams.get("version"), "latest");
  assert.equal(url.searchParams.get("cursor"), "app.linear/linear:1.0+next");
});

test("registry discovery authenticates locally without platform credentials", async () => {
  for (const [kind, status] of [["unauthenticated", 401], ["forbidden_local_host", 403], ["unconfigured", 500]]) {
    const { get, calls } = handler({ kind });
    assert.equal((await get("q=linear")).status, status);
    assert.equal(calls.length, 0);
  }
});

test("invalid identifiers and search parameters never reach the upstream", async () => {
  for (const query of ["name=..%2Fadmin", "name=example%2F..", "name=https%3A%2F%2Fevil.example", "name=example%2Fserver%2Fextra", "limit=0", "limit=51", "limit=NaN", `q=${"x".repeat(513)}`]) {
    const { get, calls } = handler();
    assert.equal((await get(query)).status, 400, query);
    assert.equal(calls.length, 0);
  }
});

test("upstream failures identify the registry and do not expose its error body", async () => {
  const missing = await handler({ upstreamStatus: 404 }).get("name=app.linear%2Flinear");
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error.message, /not found in the MCP registry/);
  for (const options of [{ upstreamStatus: 503 }, { fetchError: new Error("private upstream detail") }]) {
    const response = await handler(options).get("q=linear");
    assert.equal(response.status, 502);
    assert.match((await response.json()).error.message, /MCP registry/);
  }
});
