import { expect, test, type Page } from "@playwright/test";

const registryServer = {
  name: "io.github.example/weather-mcp", title: "Weather Tools", version: "2.0.0",
  description: "Weather forecast tools",
  packages: [{ registryType: "npm", identifier: "@example/weather", version: "1.2.3", transport: { type: "stdio" }, packageArguments: [{ type: "positional", value: "start" }] }],
};
const installed = { id: "existing", slug: "existing", name: "Existing Server", transport: "http", url: "https://example.com/mcp", is_system: false };

async function fixture(page: Page, options: { searchFails?: boolean; detailFails?: boolean; installFails?: boolean } = {}) {
  const workspace = [installed];
  const creates: Array<{ body: Record<string, unknown>; org: string | undefined }> = [];
  await page.addInitScript(() => localStorage.setItem("nenjo.active-org-id", "registry-test-workspace"));
  await page.route("**/api/platform/mcp-servers**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/registry/search")) {
      if (options.searchFails) return route.fulfill({ status: 503, json: { message: "Registry unavailable" } });
      return route.fulfill({ json: { servers: [{ server: registryServer }], metadata: {} } });
    }
    if (url.pathname.endsWith("/latest")) {
      if (options.detailFails) return route.fulfill({ status: 503, json: { message: "Registry unavailable" } });
      expect(decodeURIComponent(url.pathname)).toContain(registryServer.name);
      return route.fulfill({ json: { server: registryServer } });
    }
    if (request.method() === "POST") {
      creates.push({ body: request.postDataJSON(), org: request.headers()["x-nenjo-org-id"] });
      if (options.installFails) return route.fulfill({ status: 403, json: { message: "Workspace is read-only" } });
      const created = { ...request.postDataJSON(), id: "new-server", is_system: false };
      workspace.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    return route.fulfill({ json: workspace });
  });
  await page.goto("/dev-harness/mcp-registry");
  await expect(page.getByRole("heading", { name: "Existing Server" })).toBeVisible();
  await page.getByRole("button", { name: "Browse Registry" }).click();
  return { creates };
}

test("registry installs into a populated workspace and refreshes its MCP catalog", async ({ page }, testInfo) => {
  const { creates } = await fixture(page);
  await page.getByRole("textbox", { name: "Search MCP registry" }).fill("weather");
  await page.getByRole("button", { name: /Weather Tools/ }).click();
  await expect(page.getByRole("button", { name: "Install to Workspace" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("registry-details.png") });
  await page.getByRole("button", { name: "Install to Workspace" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Weather Tools" })).toBeVisible();
  expect(creates).toHaveLength(1);
  expect(creates[0].org).toBe("registry-test-workspace");
  expect(creates[0].body).toMatchObject({ slug: "io-github-example-weather-mcp", transport: "stdio", command: "npx", args: ["-y", "@example/weather@1.2.3", "start"] });
  await page.getByRole("button", { name: "Browse Registry" }).click();
  await page.getByRole("button", { name: /Weather Tools/ }).click();
  await expect(page.getByRole("button", { name: "Already in workspace" })).toBeDisabled();
});

test("registry errors are visible and failed details cannot be installed", async ({ page }) => {
  const { creates } = await fixture(page, { detailFails: true });
  await page.getByRole("button", { name: /Weather Tools/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Could not load the current server details");
  await expect(page.getByRole("button", { name: "Install to Workspace" })).toBeDisabled();
  expect(creates).toHaveLength(0);
});

test("failed workspace creation leaves the install dialog open", async ({ page }) => {
  await fixture(page, { installFails: true });
  await page.getByRole("button", { name: /Weather Tools/ }).click();
  await page.getByRole("button", { name: "Install to Workspace" }).click();
  await expect(page.getByText("Workspace is read-only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install to Workspace" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("search failures do not look like empty results", async ({ page }) => {
  await fixture(page, { searchFails: true });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Could not load the MCP registry");
  await expect(page.getByText(/No servers found/)).toHaveCount(0);
});

test("filtered registry pages retain pagination and omit inactive versions", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/platform/mcp-servers/registry/search?**", (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    return route.fulfill({ json: cursor ? {
      servers: [{ server: registryServer }], metadata: {},
    } : {
      servers: [
        { server: { ...registryServer, title: "Removed Server" }, _meta: { "io.modelcontextprotocol.registry/official": { status: "deleted" } } },
        { server: { ...registryServer, title: "Old Version" }, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: false } } },
      ], metadata: { nextCursor: "example/next:1.0" },
    } });
  });
  await page.getByRole("textbox", { name: "Search MCP registry" }).fill("filtered");
  await expect(page.getByText("No current servers on this page. Load more to continue browsing.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Removed Server|Old Version/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("button", { name: /Weather Tools/ })).toBeVisible();
});

test("an older search response cannot replace the current query", async ({ page }) => {
  await fixture(page);
  let releaseSlow!: () => void;
  const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });
  await page.route("**/api/platform/mcp-servers/registry/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "slow") await slowGate;
    return route.fulfill({ json: { servers: [{ server: { ...registryServer, title: query === "slow" ? "Stale Result" : "Current Result" } }], metadata: {} } });
  });
  const slowRequest = page.waitForRequest((request) => request.url().includes("q=slow"));
  await page.getByRole("textbox", { name: "Search MCP registry" }).fill("slow");
  await slowRequest;
  await page.getByRole("textbox", { name: "Search MCP registry" }).fill("current");
  await expect(page.getByRole("button", { name: /Current Result/ })).toBeVisible();
  const slowResponse = page.waitForResponse((response) => response.url().includes("q=slow"));
  releaseSlow();
  await slowResponse;
  await expect(page.getByRole("button", { name: /Current Result/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Stale Result/ })).toHaveCount(0);
});
