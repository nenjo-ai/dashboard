import assert from "node:assert/strict";
import test from "node:test";
import { registryInstallPlan } from "../lib/mcpRegistry.ts";

const server = { name: "io.github.example/weather-mcp", title: "Weather", version: "9.0.0" };
const pkg = { registryType: "npm", identifier: "@example/weather", version: "1.2.3", transport: { type: "stdio" } };

test("npm installs preserve package version and argument boundaries", () => {
  const plan = registryInstallPlan({ ...server, packages: [{ ...pkg,
    runtimeArguments: [{ type: "named", name: "--registry", value: "https://registry.npmjs.org" }],
    packageArguments: [{ type: "positional", value: "start" }, { type: "named", name: "--directory", default: "/path with spaces" }],
    environmentVariables: [{ name: "WEATHER_TOKEN", isRequired: true }],
  }] });
  assert.equal(plan.request.slug, "io-github-example-weather-mcp");
  assert.equal(plan.request.name, "Weather");
  assert.equal(plan.request.command, "npx");
  assert.deepEqual(plan.request.args, ["-y", "--registry", "https://registry.npmjs.org", "@example/weather@1.2.3", "start", "--directory", "/path with spaces"]);
  assert.deepEqual(plan.request.env_schema, [{ key: "WEATHER_TOKEN", label: "WEATHER_TOKEN", required: true }]);
});

test("remote installation uses only remote credentials and worker-compatible header keys", () => {
  const plan = registryInstallPlan({ ...server, packages: [{ ...pkg, environmentVariables: [{ name: "UNUSED" }] }], remotes: [
    { type: "sse", url: "https://example.com/sse" },
    { type: "streamable-http", url: "https://example.com/mcp", headers: [{ name: "Authorization", isRequired: true }, { name: "X-Api-Key" }] },
  ] });
  assert.equal(plan.request.transport, "http");
  assert.equal(plan.request.url, "https://example.com/mcp");
  assert.deepEqual(plan.request.env_schema.map((field) => field.key), ["header_authorization", "header_x-api-key"]);
  assert.equal(plan.request.command, undefined);
});

test("PyPI is pinned and OCI passes worker environment into the container", () => {
  assert.deepEqual(registryInstallPlan({ ...server, packages: [{ ...pkg, registryType: "pypi", identifier: "weather-mcp" }] }).request.args, ["weather-mcp==1.2.3"]);
  const plan = registryInstallPlan({ ...server, packages: [{ ...pkg, registryType: "oci", identifier: "ghcr.io/example/weather:1.2.3", environmentVariables: [{ name: "TOKEN" }], packageArguments: [{ value: "start" }] }] });
  assert.equal(plan.request.command, "docker");
  assert.deepEqual(plan.request.args, ["run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/example/weather:1.2.3", "start"]);
});

test("unsupported distributions never invent an npm command", () => {
  for (const fields of [
    {},
    { packages: [{ ...pkg, registryType: "unknown" }] },
    { packages: [{ ...pkg, transport: { type: "sse" } }] },
    { packages: [{ ...pkg, runtimeHint: "other-runtime" }] },
    { remotes: [{ type: "sse", url: "https://example.com/sse" }] },
    { remotes: [{ type: "streamable-http", url: "https://{tenant}.example.com/mcp" }] },
    { remotes: [{ type: "streamable-http", url: "file:///etc/passwd" }] },
  ]) {
    assert.equal(registryInstallPlan({ ...server, ...fields }).request, undefined);
  }
});

test("finds a supported package beyond the first distribution", () => {
  assert.equal(registryInstallPlan({ ...server, packages: [{ ...pkg, registryType: "nuget" }, pkg] }).request.command, "npx");
});

test("required arguments are resolved from defaults or require manual setup", () => {
  const argument = { type: "named", name: "--mount", value: "src={directory},dst=/data", variables: { directory: { isRequired: true } } };
  assert.match(registryInstallPlan({ ...server, packages: [{ ...pkg, runtimeArguments: [argument] }] }).error, /custom startup arguments/);
  argument.variables.directory.default = "/my data";
  assert.deepEqual(registryInstallPlan({ ...server, packages: [{ ...pkg, runtimeArguments: [argument] }] }).request.args, ["-y", "--mount", "src=/my data,dst=/data", "@example/weather@1.2.3"]);
  assert.match(registryInstallPlan({ ...server, packages: [{ ...pkg, packageArguments: [{ type: "positional", isRequired: true }] }] }).error, /custom startup arguments/);
});
