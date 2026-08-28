import type { PackageInstallResource } from "@/lib/types";

export type PackageHubTab = "installed" | "packages" | "sources";
export type PackageImportMode = "knowledge_pack" | "skill";
export type PackageCatalogSort = "relevance" | "name" | "recent";

export type MarketplacePackageKind =
  | "package"
  | "knowledge"
  | "agent"
  | "ability"
  | "domain"
  | "context_block"
  | "mcp"
  | "routine"
  | "knowledge_pack"
  | "skill"
  | "command"
  | "hook"
  | "script_tool"
  | "plugin";

export interface MarketplacePackage {
  id: string;
  kind: MarketplacePackageKind;
  name: string;
  display_name: string | null;
  description: string | null;
  latest_version: string | null;
  metadata: Record<string, unknown>;
  synced_at: string | null;
  source_path: string;
}

export const PACKAGE_HUB_TABS: readonly PackageHubTab[] = [
  "installed",
  "packages",
  "sources",
];

export const PACKAGE_CATALOG_PAGE_SIZE = 12;

export function filterAndSortPackages(
  packages: MarketplacePackage[],
  search: string,
  kind: MarketplacePackageKind | "all",
  sort: PackageCatalogSort,
): MarketplacePackage[] {
  const query = search.trim().toLocaleLowerCase();
  const filtered = packages.filter((pkg) => {
    if (kind !== "all" && pkg.kind !== kind) return false;
    if (!query) return true;
    return [
      pkg.display_name,
      pkg.name,
      pkg.description,
      pkg.source_path,
      pkg.kind,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });

  if (sort === "relevance") return filtered;

  return filtered.toSorted((left, right) => {
    if (sort === "name") {
      return (left.display_name ?? left.name).localeCompare(
        right.display_name ?? right.name,
      );
    }
    return timestamp(right.synced_at) - timestamp(left.synced_at);
  });
}

export interface PackageResourceGroup {
  type: string;
  label: string;
  resources: PackageInstallResource[];
}

export function groupPackageResources(
  resources: PackageInstallResource[],
  search = "",
): PackageResourceGroup[] {
  const query = search.trim().toLocaleLowerCase();
  const groups = new Map<string, PackageInstallResource[]>();

  for (const resource of resources) {
    if (
      query &&
      ![
        resource.resource_name,
        resource.source_path,
        resource.resource_type,
      ].some((value) => value.toLocaleLowerCase().includes(query))
    ) {
      continue;
    }
    const type = normalizePackageResourceType(resource.resource_type);
    const current = groups.get(type);
    if (current) current.push(resource);
    else groups.set(type, [resource]);
  }

  return Array.from(groups, ([type, groupedResources]) => ({
    type,
    label: packageResourceTypeLabel(type),
    resources: groupedResources.toSorted((left, right) =>
      left.resource_name.localeCompare(right.resource_name),
    ),
  })).toSorted((left, right) => left.label.localeCompare(right.label));
}

export function summarizePackageResources(
  resources: PackageInstallResource[],
  limit = 3,
): string {
  const groups = groupPackageResources(resources);
  if (!groups.length) return "No resources recorded";
  const visible = groups.slice(0, limit).map(
    (group) => `${group.resources.length} ${pluralize(group.label, group.resources.length)}`,
  );
  const remaining = groups
    .slice(limit)
    .reduce((count, group) => count + group.resources.length, 0);
  if (remaining) visible.push(`+${remaining} more`);
  return visible.join(" · ");
}

export function packageResourceTypeLabel(type: string): string {
  const normalized = normalizePackageResourceType(type);
  const labels: Record<string, string> = {
    ability: "abilities",
    agent: "agents",
    command: "commands",
    context_block: "context blocks",
    domain: "domains",
    hook: "hooks",
    knowledge: "knowledge graphs",
    mcp: "MCP servers",
    plugin: "plugins",
    routine: "routines",
    script_tool: "script tools",
    skill: "skills",
  };
  return labels[normalized] ?? normalized.replaceAll("_", " ");
}

export function normalizePackageResourceType(type: string): string {
  if (type === "knowledge_pack") return "knowledge";
  if (type === "mcp_server") return "mcp";
  return type;
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pluralize(label: string, count: number): string {
  if (count !== 1) return label;
  const singular: Record<string, string> = {
    abilities: "ability",
    agents: "agent",
    commands: "command",
    "context blocks": "context block",
    domains: "domain",
    hooks: "hook",
    "knowledge graphs": "knowledge graph",
    "MCP servers": "MCP server",
    plugins: "plugin",
    routines: "routine",
    "script tools": "script tool",
    skills: "skill",
  };
  return singular[label] ?? label;
}
