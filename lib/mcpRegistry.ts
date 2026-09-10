import type { createMcpServer, McpRegistryKeyValueInput, McpRegistryServer } from "./api";
import { resourceSlug } from "./resourceSlug.ts";

type InstallRequest = Parameters<typeof createMcpServer>[0];
export type RegistryInstallPlan =
  | { request: InstallRequest; error?: never }
  | { request?: never; error: string };

function argumentsFor(inputs: McpRegistryKeyValueInput[] = []): string[] {
  return inputs.flatMap((input) => {
    let value = input.value ?? input.default;
    if (value !== undefined) {
      value = value.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => {
        const variable = input.variables?.[key];
        return variable?.value ?? variable?.default ?? placeholder;
      });
      if (/\{[^{}]+\}/.test(value)) {
        throw new Error("This server needs custom startup arguments. Add it manually using the publisher’s setup instructions.");
      }
      return input.type === "named" && input.name ? [input.name, value] : [value];
    }
    if (input.type === "named" && input.name && !input.variables) {
      return input.isRequired ? [input.name] : [];
    }
    if (input.isRequired || input.variables) {
      throw new Error("This server needs custom startup arguments. Add it manually using the publisher’s setup instructions.");
    }
    return [];
  });
}

function fieldLabel(input: McpRegistryKeyValueInput): string {
  const label = input.description || input.name || "Value";
  const value = input.value ?? input.default;
  return value === undefined ? label : `${label} (${input.value !== undefined ? "value" : "default"}: ${value})`;
}

/** Translate a registry distribution into the workspace/worker MCP contract. */
export function registryInstallPlan(server: McpRegistryServer): RegistryInstallPlan {
  const base = {
    slug: resourceSlug(server.name),
    name: server.title || server.name,
    description: server.description || undefined,
  };
  if (!base.slug) return { error: "This registry server has no valid name." };

  // The worker speaks Streamable HTTP, not the legacy SSE transport.
  for (const remote of server.remotes ?? []) {
    if (remote.type !== "streamable-http" || !remote.url || /\{[^{}]+\}/.test(remote.url)) continue;
    try {
      if (!["https:", "http:"].includes(new URL(remote.url).protocol)) continue;
    } catch { continue; }
    const env_schema = (remote.headers ?? []).flatMap((header) => header.name ? [{
      key: `header_${header.name.toLowerCase()}`,
      label: fieldLabel(header),
      required: header.isRequired ?? false,
    }] : []);
    return { request: {
      ...base,
      transport: "http",
      url: remote.url,
      env_schema: env_schema.length ? env_schema : [{ key: "token", label: "API token or access key", required: false }],
    } };
  }

  let error = "This server has no supported installation. Use a Streamable HTTP endpoint or an npm, PyPI, or OCI package with stdio transport.";
  for (const pkg of server.packages ?? []) {
    if (!pkg.identifier || pkg.transport?.type !== "stdio") continue;
    const runtime = { npm: "npx", pypi: "uvx", oci: "docker" }[pkg.registryType ?? ""];
    if (!runtime || (pkg.runtimeHint && pkg.runtimeHint !== runtime)) continue;
    try {
      const runtimeArgs = argumentsFor(pkg.runtimeArguments);
      const packageArgs = argumentsFor(pkg.packageArguments);
      const env_schema = (pkg.environmentVariables ?? []).flatMap((field) => field.name ? [{
        key: field.name,
        label: fieldLabel(field),
        required: field.isRequired ?? false,
      }] : []);
      const version = pkg.version && pkg.version !== "latest" ? pkg.version : undefined;
      let args: string[];
      switch (pkg.registryType) {
        case "npm":
          args = ["-y", ...runtimeArgs, `${pkg.identifier}${version ? `@${version}` : ""}`, ...packageArgs];
          break;
        case "pypi":
          args = [...runtimeArgs, `${pkg.identifier}${version ? `==${version}` : ""}`, ...packageArgs];
          break;
        case "oci":
          args = ["run", "-i", "--rm", ...runtimeArgs,
            ...env_schema.flatMap((field) => ["-e", field.key]), pkg.identifier, ...packageArgs];
          break;
        default: continue;
      }
      return { request: { ...base, transport: "stdio", command: runtime, args, env_schema } };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : error;
    }
  }
  return { error };
}
