import type { AgentDefinition } from "@/lib/types";

/** Logical (unversioned) Nenji local name used in product copy. */
export const NENJI_LOGICAL_SLUG = "nenji";

/**
 * Official package agent stable slug form:
 * `{registry_scope}-{local_slug}` e.g. `nenjo-ai-nenji`.
 *
 * Also accepts legacy bare `nenji` and transitional `nenji-v1_1_0` / `nenjo_ai-nenji`.
 */
const NENJI_SLUG_RE = /^(?:[a-z0-9_-]+-)?nenji(?:-v[\d_]+)?$/i;

function packageNameFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const pkg = metadata.package;
  if (typeof pkg === "string" && pkg.trim()) return pkg.trim();
  if (pkg && typeof pkg === "object") {
    const name = (pkg as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  const install = metadata.install;
  if (install && typeof install === "object") {
    const nested = (install as { package?: unknown }).package;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

function packageVersionFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [
    metadata.package_version,
    (metadata.package as { version?: unknown } | undefined)?.version,
    (metadata.version as { package_version?: unknown } | undefined)?.package_version,
    (metadata.install as { package_version?: unknown } | undefined)?.package_version,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Parse trailing `-v1_1_0` style suffixes from legacy versioned slugs. */
export function parseVersionedSlugSuffix(slug: string | undefined | null): number[] {
  if (!slug) return [];
  const match = slug.trim().toLowerCase().match(/-v([\d_]+)$/);
  if (!match) return [];
  return match[1]
    .split("_")
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareVersionParts(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

function parseSemverLike(version: string | null): number[] {
  if (!version) return [];
  const cleaned = version.trim().replace(/^v/i, "");
  if (!cleaned) return [];
  return cleaned
    .split(/[.\-_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/**
 * True if this agent is a Nenji instance.
 *
 * Recognizes:
 * - stable scoped slug `nenjo_ai-nenji` (and other scopes ending in `-nenji`)
 * - legacy bare `nenji`
 * - transitional versioned `nenji-v1_1_0`
 * - package metadata / human-readable name
 */
export function isNenjiAgent(
  agent: Pick<AgentDefinition, "slug" | "name" | "metadata" | "source_type">,
): boolean {
  const slug = agent.slug?.trim().toLowerCase() ?? "";
  if (slug && NENJI_SLUG_RE.test(slug)) return true;

  const name = agent.name?.trim().toLowerCase() ?? "";
  if (name === NENJI_LOGICAL_SLUG) return true;

  const packageName = packageNameFromMetadata(agent.metadata)?.toLowerCase() ?? "";
  if (
    packageName === "nenji" ||
    packageName.endsWith("/nenji") ||
    packageName === "@nenjo-ai/nenji"
  ) {
    return true;
  }

  // Package agent whose install path points at the nenji package agent module.
  const sourcePath =
    typeof agent.metadata?.install === "object" &&
    agent.metadata.install &&
    typeof (agent.metadata.install as { source_path?: unknown }).source_path === "string"
      ? (agent.metadata.install as { source_path: string }).source_path.toLowerCase()
      : "";
  if (sourcePath.includes("/nenji/") && sourcePath.includes("agent")) {
    return true;
  }

  return false;
}

function agentVersionRank(
  agent: Pick<AgentDefinition, "slug" | "metadata">,
): number[] {
  const fromSlug = parseVersionedSlugSuffix(agent.slug);
  if (fromSlug.length > 0) return fromSlug;
  return parseSemverLike(packageVersionFromMetadata(agent.metadata));
}

/**
 * Pick the preferred Nenji agent when several candidates exist.
 *
 * Prefer package-owned agents, then highest package version metadata
 * (stable identity is scope+local slug; version only lives in metadata).
 */
export function findNenjiAgent(
  agents: AgentDefinition[] | null | undefined,
): AgentDefinition | undefined {
  if (!agents?.length) return undefined;
  const matches = agents.filter(isNenjiAgent);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];

  return matches.slice().sort((left, right) => {
    // Prefer package agents over native copies when both exist.
    if (left.source_type !== right.source_type) {
      if (left.source_type === "package") return -1;
      if (right.source_type === "package") return 1;
    }
    const versionCmp = compareVersionParts(
      agentVersionRank(right),
      agentVersionRank(left),
    );
    if (versionCmp !== 0) return versionCmp;
    // Prefer stable scoped slug over legacy bare/versioned forms.
    const leftScoped = (left.slug ?? "").includes("-nenji") ? 1 : 0;
    const rightScoped = (right.slug ?? "").includes("-nenji") ? 1 : 0;
    if (leftScoped !== rightScoped) return rightScoped - leftScoped;
    // Stable tie-break: newer updated_at wins if present.
    return (right.updated_at ?? "").localeCompare(left.updated_at ?? "");
  })[0];
}

/** Effective slug to use for APIs (stable scoped form when installed as a package). */
export function nenjiAgentSlug(agent: AgentDefinition | undefined | null): string {
  return agent?.slug?.trim() || NENJI_LOGICAL_SLUG;
}
