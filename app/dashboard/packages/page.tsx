"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import matter from "gray-matter";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSWRConfig } from "swr";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Braces,
  ChevronDown,
  Clock3,
  Download,
  GitBranch,
  Network,
  Package,
  PlugZap,
  Plus,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";
import { SourceKnowledgeSection } from "@/components/knowledge/SourceKnowledgeSection";
import {
  PackageInstallProgressBar,
  type PackageInstallProgress,
} from "@/components/packages/PackageInstallProgressBar";
import {
  useAbilities,
  useAgents,
  useKnowledgePacks,
  useMcpServers,
  usePackageInstalls,
  usePackageSources,
  useTabParam,
} from "@/lib/hooks";
import {
  createPackageSource,
  ensureOfficialNenjoPackageSource,
  fetchPackageCatalog,
  fetchPackageInstallDetail,
  installKnowledgePack,
  installPackage,
  installSkill,
  deletePackageSource,
  domainsUrl,
  uninstallSkillAbility,
  uninstallPackageInstall,
  updateSkillRuntimeEnvNames,
  updatePackageInstall,
  updatePackageSource,
} from "@/lib/api";
import type {
  Ability,
  KnowledgePack,
  PackageInstall,
  PackageInstallDetail,
  PackageInstallResource,
  PackageSource,
  PackageSourceAdapter,
} from "@/lib/types";

type LibraryTab = "installed" | "packages" | "sources" | "imports";
type PackageDetailsTab = "readme" | "metadata";
type ImportMode = "knowledge_pack" | "skill";
type MarketplacePackageKind =
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

const LIBRARY_TABS: LibraryTab[] = [
  "installed",
  "packages",
  "sources",
  "imports",
];

interface MarketplacePackage {
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

const CLAUDE_PLUGIN_MANIFEST_PATH = ".claude-plugin/plugin.json";
const CLAUDE_MARKETPLACE_MANIFEST_PATH = ".claude-plugin/marketplace.json";

interface ClaudeMarketplaceManifest {
  plugins?: Array<{
    name?: unknown;
    title?: unknown;
    id?: unknown;
    version?: unknown;
    description?: unknown;
    source?: unknown;
    path?: unknown;
    root_path?: unknown;
    plugin_path?: unknown;
    source_path?: unknown;
    manifest_path?: unknown;
  }>;
}

type ClaudeMarketplacePlugin = NonNullable<ClaudeMarketplaceManifest["plugins"]>[number];

interface ClaudePluginManifest {
  name?: unknown;
  slug?: unknown;
  title?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  version?: unknown;
  description?: unknown;
}

interface NenjoPackagesManifest {
  packages?:
    | Array<{
        type?: MarketplacePackageKind;
        kind?: MarketplacePackageKind;
        slug: string;
        name?: string | null;
        display_name?: string | null;
        description?: string | null;
        path: string;
        manifest_path?: string | null;
        entrypoint?: string | null;
        version?: string | null;
        metadata?: Record<string, unknown> | null;
      }>
    | Record<string, string>;
}

interface NenjoModulePackageManifest {
  schema?: string;
  name?: string;
  version?: string | null;
  description?: string | null;
  dependencies?: Record<string, string>;
  modules?: Array<string | { path?: string | null }>;
}

interface GithubCommitResponse {
  sha: string;
}

interface GithubContentsEntry {
  name: string;
  path: string;
  type: string;
}

interface MarketplaceGitHubInfo {
  owner: string;
  repo: string;
  ref: string;
  resolvedCommitSha: string | null;
}

interface MarketplacePluginSourceInfo extends MarketplaceGitHubInfo {
  rootPath: string;
}

interface SkillReview {
  name: string;
  display_name: string | null;
  description: string | null;
  entrypoint: string;
  skill_path: string;
  content: string;
}

interface PackageReview {
  pkg: MarketplacePackage;
  source: PackageSource | null;
  plugin_request: {
    name: string;
    display_name: string | null;
    description: string | null;
    source: { path: string };
    version?: {
      ref_?: string | null;
      resolved_commit_sha?: string | null;
      package_version?: string | null;
    };
    skills: SkillReview[];
  };
  envNamesText: string;
  selectedSkillIndex: number;
}

interface NenjoPackageDescriptor {
  schema?: string;
  type?: MarketplacePackageKind;
  slug?: string;
  name?: string;
  version?: string;
  entry?: string;
  modules?: Array<string | { path?: string | null }>;
  dependencies?: Record<string, string>;
  depends_on?: Array<{
    name?: string | null;
    path: string;
    version?: string | null;
  }>;
  metadata?: Record<string, unknown> | null;
}

interface PackageDependency {
  name: string;
  path: string;
  version?: string | null;
}

interface LoadedPackageModule {
  title: string;
  path: string;
  value: Record<string, unknown> | null;
  kind: MarketplacePackageKind;
}

interface LoadedPackageModuleGroup {
  label: string;
  modules: LoadedPackageModule[];
}

interface LoadedPackageDetails {
  descriptor: NenjoPackageDescriptor | null;
  moduleGroups: LoadedPackageModuleGroup[];
  dependencies: PackageDependency[];
  readme: string | null;
  descriptorPath: string;
}

interface PackageDependencyRef {
  rootPath: string;
  name: string;
}

interface PackageInstallDependencyInfo {
  autoInstalled: boolean;
  dependsOn: PackageDependencyRef[];
  requiredBy: PackageDependencyRef[];
}

function formatLibraryDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function identifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function metadataText(
  metadata: Record<string, unknown>,
  path: string[],
): string | null {
  let current: unknown = metadata;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function firstTextValue(...values: unknown[]): string | null {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return null;
}

function normalizeCatalogPath(value: string): string {
  return value.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
}

function normalizePluginRootPath(value: string | null | undefined): string {
  const path = normalizeCatalogPath(value ?? "");
  return path || ".";
}

function joinRelativePath(rootPath: string, childPath: string): string {
  const root = normalizePluginRootPath(rootPath);
  const child = childPath.trim().replace(/^\/+/, "");
  return root === "." ? child : `${root}/${child}`;
}

function isClaudePluginManifestPath(path: string): boolean {
  return normalizeCatalogPath(path).endsWith(CLAUDE_PLUGIN_MANIFEST_PATH);
}

function claudePluginRootPathFromManifestPath(path: string): string {
  const normalized = normalizeCatalogPath(path);
  if (normalized === CLAUDE_PLUGIN_MANIFEST_PATH) return ".";
  const suffix = `/${CLAUDE_PLUGIN_MANIFEST_PATH}`;
  return normalized.endsWith(suffix)
    ? normalizePluginRootPath(normalized.slice(0, -suffix.length))
    : normalizePluginRootPath(normalized);
}

function marketplacePluginPath(plugin: ClaudeMarketplacePlugin): string {
  const candidates = [
    plugin.source,
    plugin.path,
    plugin.root_path,
    plugin.plugin_path,
    plugin.source_path,
    plugin.manifest_path,
  ];
  for (const candidate of candidates) {
    const direct = textValue(candidate);
    if (direct) return direct;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      const nested = firstTextValue(
        record.path,
        record.root_path,
        record.plugin_path,
        record.source_path,
        record.manifest_path,
      );
      if (nested) return nested;
    }
  }
  return "";
}

function marketplacePluginSourceInfo(
  plugin: ClaudeMarketplacePlugin,
  fallback: MarketplaceGitHubInfo,
): MarketplacePluginSourceInfo {
  const sourceRecord = isRecord(plugin.source) ? plugin.source : null;
  const sourceUrl = sourceRecord ? textValue(sourceRecord.url) : null;
  const sourceRepo = sourceUrl ? parseGitHubRepoUrl(sourceUrl) : null;
  const usesFallbackRepo = !sourceRepo;
  const resolvedCommitSha = sourceRecord
    ? firstTextValue(
        sourceRecord.resolved_commit_sha,
        sourceRecord.commit_sha,
        sourceRecord.commit,
        sourceRecord.sha,
      )
    : null;

  return {
    owner: sourceRepo?.owner ?? fallback.owner,
    repo: sourceRepo?.repo ?? fallback.repo,
    ref:
      (sourceRecord
        ? firstTextValue(
            sourceRecord.ref,
            sourceRecord.reference,
            sourceRecord.tag,
            sourceRecord.sha,
          )
        : null) ??
      (usesFallbackRepo ? fallback.ref : "main"),
    resolvedCommitSha:
      resolvedCommitSha ??
      (usesFallbackRepo ? fallback.resolvedCommitSha : null),
    rootPath: normalizePluginRootPath(marketplacePluginPath(plugin)),
  };
}

function marketplacePackageFromClaudePluginManifest(
  source: PackageSource,
  info: MarketplaceGitHubInfo,
  manifestPath: string,
  manifest: ClaudePluginManifest,
): MarketplacePackage {
  const normalizedManifestPath =
    normalizeCatalogPath(manifestPath) || CLAUDE_PLUGIN_MANIFEST_PATH;
  const rootPath = claudePluginRootPathFromManifestPath(normalizedManifestPath);
  const name =
    firstTextValue(manifest.name, manifest.slug, manifest.title) ||
    rootPath.split("/").filter(Boolean).pop() ||
    source.name ||
    "plugin";
  const displayName =
    firstTextValue(
      manifest.display_name,
      manifest.displayName,
      manifest.title,
      manifest.name,
    ) ?? name;
  const version = textValue(manifest.version);

  return {
    id: `${source.id}:plugin:${normalizedManifestPath}`,
    kind: "plugin",
    name,
    display_name: displayName,
    description: textValue(manifest.description),
    latest_version: version,
    synced_at: null,
    source_path: normalizedManifestPath,
    metadata: {
      adapter: "claude_plugin",
      source: {
        provider: "github",
        owner: info.owner,
        repo: info.repo,
        path: rootPath,
        package: name,
        manifest_path: normalizedManifestPath,
        marketplace_path: normalizedManifestPath,
      },
      version: {
        ref: info.ref,
        resolved_commit_sha: info.resolvedCommitSha,
        package_version: version,
      },
    },
  };
}

function metadataBool(
  metadata: Record<string, unknown>,
  path: string[],
): boolean | null {
  let current: unknown = metadata;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current))
      return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "boolean" ? current : null;
}

function packageInstallDependencyInfo(
  install: PackageInstall,
): PackageInstallDependencyInfo {
  const claude = isRecord(install.metadata.claude)
    ? install.metadata.claude
    : null;
  const dependencies =
    claude && isRecord(claude.dependencies) ? claude.dependencies : null;
  if (!dependencies) {
    return { autoInstalled: false, dependsOn: [], requiredBy: [] };
  }
  return {
    autoInstalled: dependencies.auto_installed === true,
    dependsOn: dependencyRefs(dependencies.depends_on),
    requiredBy: dependencyRefs(dependencies.required_by),
  };
}

function dependencyRefs(value: unknown): PackageDependencyRef[] {
  if (!Array.isArray(value)) return [];
  const refs: PackageDependencyRef[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const rootPath = textValue(item.root_path);
    if (!rootPath || seen.has(rootPath)) continue;
    refs.push({
      rootPath,
      name: textValue(item.name) ?? rootPath,
    });
    seen.add(rootPath);
  }
  return refs;
}

function dependencyRefListLabel(refs: PackageDependencyRef[]): string {
  const [first, ...rest] = refs;
  if (!first) return "";
  return rest.length ? `${first.name} +${rest.length}` : first.name;
}

function packageInstallDependencyBadges(
  info: PackageInstallDependencyInfo,
): Array<string | null> {
  return [
    info.autoInstalled ? "Auto-installed" : null,
    info.dependsOn.length
      ? `Depends on ${dependencyRefListLabel(info.dependsOn)}`
      : null,
    info.requiredBy.length
      ? `Required by ${dependencyRefListLabel(info.requiredBy)}`
      : null,
  ];
}

function installedPackageResources(
  detail: PackageInstallDetail | undefined,
): PackageInstallResource[] {
  return (detail?.resources ?? []).filter(
    (resource) => resource.install_state === "installed",
  );
}

function packageResourceActionLabel(
  resource: PackageInstallResource,
): string | null {
  switch (normalizedPackageResourceType(resource.resource_type)) {
    case "knowledge":
      return "Graph";
    case "agent":
    case "ability":
    case "domain":
    case "context_block":
    case "mcp_server":
    case "mcp":
      return "Open";
    default:
      return null;
  }
}

function runtimeResourceDetails(resource: PackageInstallResource): string[] {
  const resourceType = normalizedPackageResourceType(resource.resource_type);
  const runtime = isRecord(resource.metadata.runtime)
    ? resource.metadata.runtime
    : {};
  const details = new Set<string>();
  const add = (label: string, value: unknown) => {
    const text =
      textValue(value) ??
      (typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : null);
    if (text) details.add(`${label}: ${text}`);
  };
  switch (resourceType) {
    case "command":
      add("Command", runtime.command);
      break;
    case "hook":
      add("Event", runtime.event);
      add("Matcher", runtime.matcher);
      add("Type", runtime.type);
      break;
    case "script_tool":
      add("Tool", runtime.name);
      break;
    case "mcp_server":
    case "mcp":
      add("Transport", runtime.transport);
      add("Command", runtime.command);
      add("URL", runtime.url);
      break;
  }
  return Array.from(details);
}

function sourceLabel(metadata: Record<string, unknown>): string {
  const owner = metadataText(metadata, ["source", "owner"]);
  const repo = metadataText(metadata, ["source", "repo"]);
  return owner && repo ? `${owner}/${repo}` : "Platform";
}

function packageSelector(pkg: MarketplacePackage): string | null {
  const explicit = metadataText(pkg.metadata, ["install", "selector"]);
  if (explicit) return explicit;
  if (!packageSupportsSelector(pkg.kind)) return null;
  const owner = metadataText(pkg.metadata, ["source", "owner"]);
  const repo = metadataText(pkg.metadata, ["source", "repo"]);
  const packageName =
    metadataText(pkg.metadata, ["source", "package"]) ?? pkg.name;
  if (pkg.kind === "knowledge" || pkg.kind === "knowledge_pack") {
    return owner && repo
      ? `git://${owner}/${repo}/${packageName}`
      : `git://${pkg.name}`;
  }
  return packageName;
}

function packageSupportsSelector(kind: MarketplacePackageKind): boolean {
  return (
    kind === "knowledge" ||
    kind === "knowledge_pack" ||
    kind === "context_block"
  );
}

function packageKindFromPath(path: string): MarketplacePackageKind {
  if (path.endsWith(CLAUDE_PLUGIN_MANIFEST_PATH)) return "plugin";
  if (
    path.endsWith("/SKILL.md") ||
    path === "SKILL.md" ||
    path.includes("/skills/")
  )
    return "skill";
  if (path.includes("/agents/")) return "agent";
  if (path.includes("/abilities/")) return "ability";
  if (path.includes("/domains/")) return "domain";
  if (path.includes("/context_blocks/")) return "context_block";
  if (path.includes("/knowledge/")) return "knowledge";
  if (path.includes("/mcp/")) return "mcp";
  if (path.includes("/routines/")) return "routine";
  if (path.includes("/commands/")) return "command";
  if (path.includes("/hooks/")) return "hook";
  if (path.includes("/script_tools/")) return "script_tool";
  return "package";
}

function packageKindFromSchema(schema: string | null | undefined): MarketplacePackageKind {
  if (!schema) return "package";
  if (schema.startsWith("nenjo.agent.")) return "agent";
  if (schema.startsWith("nenjo.ability.")) return "ability";
  if (schema.startsWith("nenjo.domain.")) return "domain";
  if (schema.startsWith("nenjo.context_block.")) return "context_block";
  if (
    schema.startsWith("nenjo.knowledge.") ||
    schema.startsWith("nenjo.knowledge_pack.")
  )
    return "knowledge";
  if (schema.startsWith("nenjo.skill.")) return "skill";
  if (schema.startsWith("nenjo.plugin.")) return "plugin";
  if (schema.startsWith("nenjo.mcp.")) return "mcp";
  if (schema.startsWith("nenjo.routine.")) return "routine";
  if (schema.startsWith("nenjo.command.")) return "command";
  if (schema.startsWith("nenjo.hook.")) return "hook";
  if (schema.startsWith("nenjo.script_tool.")) return "script_tool";
  return "package";
}

function combinedPackageKind(kinds: MarketplacePackageKind[]): MarketplacePackageKind {
  const resourceKinds = kinds.filter((kind) => kind !== "package");
  if (!resourceKinds.length) return "package";
  if (resourceKinds.includes("agent")) return "agent";
  const first = resourceKinds[0];
  return resourceKinds.every((kind) => kind === first) ? first : "package";
}

function normalizedPackageResourceType(resourceType: string): string {
  return resourceType === "knowledge_pack" ? "knowledge" : resourceType;
}

function packageKindIcon(
  kind: string | null | undefined,
  className = "h-5 w-5",
) {
  switch (kind) {
    case "agent":
      return <Bot className={className} />;
    case "ability":
      return <Zap className={className} />;
    case "domain":
      return <Sparkles className={className} />;
    case "context_block":
      return <Braces className={className} />;
    case "mcp":
    case "mcp_server":
    case "plugin":
      return <PlugZap className={className} />;
    case "routine":
      return <Clock3 className={className} />;
    case "skill":
      return <Sparkles className={className} />;
    case "command":
      return <Terminal className={className} />;
    case "hook":
      return <GitBranch className={className} />;
    case "script_tool":
      return <Zap className={className} />;
    case "knowledge":
    case "knowledge_pack":
      return <BookOpen className={className} />;
    default:
      return <Package className={className} />;
  }
}

function packageInstallKey(sourceId: string, path: string): string {
  return `${sourceId}:${path}`;
}

function pluginCatalogId(
  sourceId: string,
  sourcePath: string,
  name: string,
  index: number,
): string {
  const stableName = identifier(name) || "plugin";
  return `${sourceId}:plugin:${sourcePath}:${stableName}:${index}`;
}

function sourceGitHubInfo(source: PackageSource): {
  owner: string;
  repo: string;
  ref: string;
  resolvedCommitSha: string | null;
  marketplacePath: string;
} | null {
  const packageSourceUrl = metadataText(source.metadata, ["source", "url"]);
  const parsedSourceUrl = packageSourceUrl
    ? parseGitHubRepoUrl(packageSourceUrl)
    : null;
  const owner =
    metadataText(source.metadata, ["owner"]) ?? parsedSourceUrl?.owner ?? null;
  const repo =
    metadataText(source.metadata, ["repo"]) ?? parsedSourceUrl?.repo ?? null;
  if (!owner || !repo) return null;
  return {
    owner,
    repo,
    ref:
      metadataText(source.metadata, ["ref"]) ??
      metadataText(source.metadata, ["source", "reference"]) ??
      "main",
    resolvedCommitSha: metadataText(source.metadata, ["resolved_commit_sha"]),
    marketplacePath:
      metadataText(source.metadata, ["manifest_path"]) ??
      metadataText(source.metadata, ["source", "manifest_path"]) ??
      metadataText(source.metadata, ["marketplace_path"]) ??
      "packages.yaml",
  };
}

function sourceFetchRef(info: {
  ref: string;
  resolvedCommitSha: string | null;
}): string {
  return info.resolvedCommitSha ?? info.ref;
}

function githubRawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.replace(/^\/+/, "")}`;
}

function githubContentsUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): string {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  if (!cleanPath || cleanPath === ".") {
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?ref=${encodeURIComponent(ref)}`;
  }
  const encodedPath = cleanPath.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const text = await res.text();
  return parseStructuredText<T>(text);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function fetchOptionalText(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function resolveGitHubCommitSha(
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const commit = await fetchJson<GithubCommitResponse>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  return commit.sha;
}

async function fetchMarketplacePackages(
  source: PackageSource,
): Promise<MarketplacePackage[]> {
  const info = sourceGitHubInfo(source);
  if (!info) return [];
  const catalog = await fetchPackageCatalog(source.id);
  const manifest =
    catalog.manifest as ClaudeMarketplaceManifest & NenjoPackagesManifest;
  if (manifest.packages && !Array.isArray(manifest.packages)) {
    return Promise.all(
      Object.entries(manifest.packages).map(
        async ([packageName, packagePath]) => {
          const path = normalizeCatalogPath(packagePath);
          let packageManifest: NenjoModulePackageManifest | null = null;
          try {
            packageManifest = await fetchJson<NenjoModulePackageManifest>(
              githubRawUrl(info.owner, info.repo, sourceFetchRef(info), path),
            );
          } catch {
            packageManifest = null;
          }
          const modules =
            packageManifest?.modules?.map((module) =>
              typeof module === "string" ? module : (module.path ?? ""),
            ) ?? [];
          let kind: MarketplacePackageKind = "package";
          try {
            const groups = packageManifest
              ? await resolvePackageModuleGroups(info, path, packageManifest)
              : [];
            kind = combinedPackageKind(
              groups.flatMap((group) => group.modules.map((module) => module.kind)),
            );
          } catch {
            kind = combinedPackageKind(modules.map(packageKindFromPath));
          }
          return {
            id: `${source.id}:${path || packageName}`,
            kind,
            name: packageManifest?.name ?? packageName,
            display_name: packageManifest?.name ?? packageName,
            description: packageManifest?.description ?? null,
            latest_version: packageManifest?.version ?? null,
            synced_at: null,
            source_path: path,
            metadata: {
              source: {
                provider: "github",
                owner: info.owner,
                repo: info.repo,
                path,
                package: packageManifest?.name ?? packageName,
              },
              version: {
                ref: info.ref,
                resolved_commit_sha: info.resolvedCommitSha,
                package_version: packageManifest?.version ?? null,
              },
              install: {
                kind,
                selector: packageManifest?.name ?? packageName,
              },
            },
          };
        },
      ),
    );
  }
  if (Array.isArray(manifest.packages)) {
    return Promise.all(manifest.packages.map(async (pkg) => {
      let kind = pkg.kind ?? pkg.type ?? "package";
      const path = normalizeCatalogPath(pkg.path);
      const name = pkg.slug || pkg.name || path.split("/").pop() || "package";
      try {
        const packageManifest = await fetchJson<NenjoModulePackageManifest>(
          githubRawUrl(info.owner, info.repo, sourceFetchRef(info), path),
        );
        const groups = await resolvePackageModuleGroups(info, path, packageManifest);
        kind =
          pkg.kind ??
          pkg.type ??
          combinedPackageKind(
            groups.flatMap((group) => group.modules.map((module) => module.kind)),
          );
      } catch {
        kind = pkg.kind ?? pkg.type ?? packageKindFromPath(path);
      }
      const selector = packageSupportsSelector(kind)
        ? `git://${info.owner}/${info.repo}/${name}`
        : null;
      return {
        id: `${source.id}:${path || name}`,
        kind,
        name,
        display_name: pkg.display_name ?? pkg.name ?? name,
        description:
          pkg.description ??
          metadataText((pkg.metadata ?? {}) as Record<string, unknown>, [
            "description",
          ]),
        latest_version: pkg.version ?? null,
        synced_at: null,
        source_path: path,
        metadata: {
          source: {
            provider: "github",
            owner: info.owner,
            repo: info.repo,
            path,
            package: name,
          },
          version: {
            ref: info.ref,
            resolved_commit_sha: info.resolvedCommitSha,
            package_version: pkg.version ?? null,
          },
          distribution: {
            type: "github_directory",
            path,
            ...(kind === "skill"
              ? {
                  entrypoint: pkg.entrypoint ?? pkg.manifest_path ?? "SKILL.md",
                }
              : { manifest_path: pkg.manifest_path ?? "manifest.yaml" }),
          },
          install: {
            kind,
            ...(selector ? { selector } : {}),
          },
        },
      };
    }));
  }
  if (
    source.adapter === "claude_marketplace" &&
    isClaudePluginManifestPath(info.marketplacePath)
  ) {
    return [
      marketplacePackageFromClaudePluginManifest(
        source,
        info,
        info.marketplacePath,
        manifest as ClaudePluginManifest,
      ),
    ];
  }
  return (manifest.plugins ?? []).map((plugin, index) => {
    const pluginSource = marketplacePluginSourceInfo(plugin, info);
    const path = pluginSource.rootPath === "." ? "" : pluginSource.rootPath;
    const name =
      firstTextValue(plugin.name, plugin.title, plugin.id) ||
      path.split("/").filter(Boolean).pop() ||
      "plugin";
    const sourcePath = path || name;
    return {
      id: pluginCatalogId(source.id, sourcePath, name, index),
      kind: "plugin",
      name,
      display_name: name,
      description: textValue(plugin.description),
      latest_version: textValue(plugin.version),
      synced_at: null,
      source_path: sourcePath,
      metadata: {
        adapter: "claude_plugin",
        source: {
          provider: "github",
          owner: pluginSource.owner,
          repo: pluginSource.repo,
          path: pluginSource.rootPath,
          package: name,
          marketplace_path: sourcePath,
        },
        version: {
          ref: pluginSource.ref,
          resolved_commit_sha: pluginSource.resolvedCommitSha,
          package_version: textValue(plugin.version),
        },
      },
    };
  });
}

function parseStructuredText<T>(text: string): T {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(text) as T;
  }
  if (trimmed.startsWith("---")) {
    return matter(text).data as T;
  }
  return matter(`---\n${text.trim()}\n---\n`).data as T;
}

async function fetchPackageDetails(
  source: PackageSource,
  pkg: MarketplacePackage,
): Promise<LoadedPackageDetails> {
  const info = sourceGitHubInfo(source);
  if (!info)
    throw new Error("Package source is missing GitHub owner/repo metadata");
  const descriptorPath = pkg.source_path.replace(/^\/+/, "");
  const descriptor = await fetchJson<NenjoPackageDescriptor>(
    githubRawUrl(info.owner, info.repo, sourceFetchRef(info), descriptorPath),
  );
  const dir = descriptorPath.includes("/")
    ? descriptorPath.slice(0, descriptorPath.lastIndexOf("/"))
    : "";
  const [moduleGroups, dependencies] = await Promise.all([
    resolvePackageModuleGroups(info, descriptorPath, descriptor),
    resolvePackageDependencies(info, descriptor),
  ]);
  const readme =
    (await fetchOptionalText(
      githubRawUrl(
        info.owner,
        info.repo,
        sourceFetchRef(info),
        `${dir}/README.md`,
      ),
    )) ??
    (await fetchOptionalText(
      githubRawUrl(
        info.owner,
        info.repo,
        sourceFetchRef(info),
        `${dir}/readme.md`,
      ),
    ));
  return {
    descriptor,
    moduleGroups,
    dependencies,
    readme,
    descriptorPath,
  };
}

async function resolvePackageModuleGroups(
  info: {
    owner: string;
    repo: string;
    ref: string;
    resolvedCommitSha: string | null;
  },
  descriptorPath: string,
  descriptor: Pick<NenjoPackageDescriptor, "entry" | "modules">,
): Promise<LoadedPackageModuleGroup[]> {
  const packageDir = descriptorPath.includes("/")
    ? descriptorPath.slice(0, descriptorPath.lastIndexOf("/"))
    : "";
  const rootModules = descriptor.entry?.trim()
    ? [descriptor.entry.trim()]
    : (descriptor.modules ?? [])
        .map((module) =>
          typeof module === "string" ? module : (module.path ?? ""),
        )
        .map((path) => path.trim())
        .filter(Boolean);
  const groups = await Promise.all(
    rootModules.map(async (modulePath) => ({
      label: modulePath,
      modules: await expandPackageModule(info, packageDir, modulePath, modulePath, new Set()),
    })),
  );
  return groups.filter((group) => group.modules.length > 0);
}

async function expandPackageModule(
  info: {
    owner: string;
    repo: string;
    ref: string;
    resolvedCommitSha: string | null;
  },
  packageDir: string,
  modulePath: string,
  groupLabel: string,
  seen: Set<string>,
): Promise<LoadedPackageModule[]> {
  const resolved = await fetchPackageModuleValue(info, packageDir, modulePath);
  if (seen.has(resolved.path)) return [];
  seen.add(resolved.path);

  const schema = valueString(resolved.value, "schema");
  if (schema === "nenjo.module_index.v1") {
    const indexDir = resolved.path
      .slice(packageDir ? packageDir.length + 1 : 0)
      .replace(/\/?index\.ya?ml$/, "");
    const children = packageModuleRefs(resolved.value);
    const expanded = await Promise.all(
      children.map((child) =>
        expandPackageModule(
          info,
          packageDir,
          indexDir ? `${indexDir}/${child}` : child,
          groupLabel,
          seen,
        ),
      ),
    );
    return expanded.flat();
  }

  return resourceManifestEntries(resolved.value, resolved.path);
}

async function fetchPackageModuleValue(
  info: {
    owner: string;
    repo: string;
    ref: string;
    resolvedCommitSha: string | null;
  },
  packageDir: string,
  modulePath: string,
): Promise<{ path: string; value: Record<string, unknown> }> {
  const paths = packageModuleCandidatePaths(packageDir, modulePath);
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return {
        path,
        value: await fetchJson<Record<string, unknown>>(
          githubRawUrl(info.owner, info.repo, sourceFetchRef(info), path),
        ),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Failed to fetch package manifest");
}

function packageModuleCandidatePaths(packageDir: string, modulePath: string): string[] {
  const relative = modulePath.replace(/^\/+/, "");
  const path = `${packageDir ? `${packageDir}/` : ""}${relative}`;
  if (!modulePath.trim().endsWith("/")) return [path];
  return [`${path}index.yml`, `${path}index.yaml`];
}

function packageModuleRefs(value: Record<string, unknown>): string[] {
  const modules = value.modules;
  if (!Array.isArray(modules)) return [];
  return modules
    .map((module) =>
      typeof module === "string"
        ? module
        : module && typeof module === "object" && !Array.isArray(module)
          ? (module as Record<string, unknown>).path
          : null,
    )
    .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
    .map((path) => path.trim());
}

function resourceManifestEntries(
  value: Record<string, unknown>,
  path: string,
): LoadedPackageModule[] {
  const resources = Array.isArray(value.resources)
    ? value.resources.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [value];
  return resources.map((resource, index) => {
    const manifest =
      resource.manifest && typeof resource.manifest === "object" && !Array.isArray(resource.manifest)
        ? (resource.manifest as Record<string, unknown>)
        : {};
    const name = valueString(manifest, "display_name") ?? valueString(manifest, "name");
    const schema = valueString(resource, "schema");
    return {
      title: name ?? (resources.length > 1 ? `Module ${index + 1}` : "Module"),
      path,
      value: resource,
      kind: packageKindFromSchema(schema),
    };
  });
}

async function resolvePackageDependencies(
  info: {
    owner: string;
    repo: string;
    ref: string;
    resolvedCommitSha: string | null;
    marketplacePath: string;
  },
  descriptor: NenjoPackageDescriptor,
): Promise<PackageDependency[]> {
  const dependencies = descriptor.dependencies ?? {};
  const legacy = descriptor.depends_on ?? [];
  const registry = await fetchJson<NenjoPackagesManifest>(
    githubRawUrl(info.owner, info.repo, sourceFetchRef(info), info.marketplacePath),
  ).catch(() => null);
  const pathByName = new Map<string, string>();
  if (registry?.packages && !Array.isArray(registry.packages)) {
    for (const [name, path] of Object.entries(registry.packages)) {
      pathByName.set(name, path);
    }
  } else if (Array.isArray(registry?.packages)) {
    for (const pkg of registry.packages) {
      const name = pkg.name ?? pkg.slug;
      if (name) pathByName.set(name, pkg.path);
    }
  }
  const resolved: PackageDependency[] = Object.entries(dependencies).map(([name, version]) => ({
    name,
    path: pathByName.get(name) ?? name,
    version,
  }));
  resolved.push(
    ...legacy.map((dependency) => ({
      name: dependency.name ?? dependency.path,
      path: dependency.path,
      version: dependency.version,
    })),
  );
  return resolved;
}

function knowledgeSelector(pack: KnowledgePack): string {
  return pack.selector ?? `platform:${pack.slug}`;
}

function parseGitHubRepoUrl(
  value: string,
): { owner: string; repo: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const shorthand = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com")
      return null;
    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !rawRepo) return null;
    return { owner, repo: rawRepo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export default function KnowledgePage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const {
    packs,
    isLoading: packsLoading,
    mutate: mutatePacks,
  } = useKnowledgePacks();
  const {
    mutate: mutateAgents,
  } = useAgents();
  const {
    abilities,
    isLoading: abilitiesLoading,
    mutate: mutateAbilities,
  } = useAbilities();
  const {
    isLoading: mcpLoading,
    mutate: mutateMcp,
  } = useMcpServers();
  const {
    sources,
    isLoading: sourcesLoading,
    mutate: mutateSources,
  } = usePackageSources();
  const {
    installs,
    isLoading: installsLoading,
    mutate: mutateInstalls,
  } = usePackageInstalls();
  const officialSourceEnsureInFlight = useRef(false);

  const [activeTab, setActiveTab] = useTabParam<LibraryTab>(
    "installed",
    LIBRARY_TABS,
  );
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [kindFilter, setKindFilter] = useState<MarketplacePackageKind | "all">(
    "all",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<
    Record<string, PackageInstallProgress>
  >({});
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [marketplaceRefresh, setMarketplaceRefresh] = useState(0);
  const [packageReview, setPackageReview] = useState<PackageReview | null>(
    null,
  );
  const [packageDetails, setPackageDetails] = useState<{
    pkg: MarketplacePackage;
    source: PackageSource | null;
  } | null>(null);
  const [packageInstallDetails, setPackageInstallDetails] = useState<
    Record<string, PackageInstallDetail>
  >({});
  const [envEditor, setEnvEditor] = useState<{
    ability: Ability;
    envNamesText: string;
  } | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceRepoUrl, setSourceRepoUrl] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [sourceManifestPath, setSourceManifestPath] = useState("packages.yaml");
  const [sourceAdapter, setSourceAdapter] =
    useState<PackageSourceAdapter>("nenjo_packages");
  const [importMode, setImportMode] = useState<ImportMode>("knowledge_pack");
  const [importOwner, setImportOwner] = useState("");
  const [importRepo, setImportRepo] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importRef, setImportRef] = useState("main");
  const [importName, setImportName] = useState("");

  const activePackageInstalls = useMemo(
    () => (installs ?? []).filter((install) => install.status === "installed"),
    [installs],
  );

  useEffect(() => {
    const missing = activePackageInstalls.filter(
      (install) => !packageInstallDetails[install.id],
    );
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map((install) =>
        fetchPackageInstallDetail(install.id).catch(() => null),
      ),
    ).then((details) => {
      if (cancelled) return;
      setPackageInstallDetails((current) => {
        const next = { ...current };
        for (const detail of details) {
          if (detail) next[detail.install.id] = detail;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activePackageInstalls, packageInstallDetails]);

  const packageResourceRefs = useMemo(() => {
    const refs = {
      knowledgeIds: new Set<string>(),
      knowledgePaths: new Set<string>(),
    };
    for (const install of activePackageInstalls) {
      const rootType =
        install.root_type === "knowledge_pack"
          ? "knowledge"
          : install.root_type;
      if (rootType === "knowledge") {
        if (install.root_resource_id)
          refs.knowledgeIds.add(install.root_resource_id);
        refs.knowledgePaths.add(install.root_path);
      }
    }
    for (const install of activePackageInstalls) {
      const detail = packageInstallDetails[install.id];
      for (const resource of detail?.resources ?? []) {
        if (resource.install_state !== "installed") continue;
        const resourceType = normalizedPackageResourceType(
          resource.resource_type,
        );
        if (resourceType === "knowledge") {
          refs.knowledgeIds.add(resource.resource_id);
          refs.knowledgePaths.add(resource.source_path);
        }
      }
    }
    return refs;
  }, [activePackageInstalls, packageInstallDetails]);
  const activePacks = useMemo(
    () =>
      (packs ?? []).filter((pack) => {
        if (pack.status === "archived" || pack.source_type !== "package")
          return false;
        const sourcePath = metadataText(pack.metadata, [
          "install",
          "source_path",
        ]);
        return (
          packageResourceRefs.knowledgeIds.has(pack.id) ||
          Boolean(
            sourcePath && packageResourceRefs.knowledgePaths.has(sourcePath),
          )
        );
      }),
    [packageResourceRefs, packs],
  );
  const skillAbilities = useMemo(
    () =>
      (abilities ?? []).filter((ability) => ability.source_type === "skill"),
    [abilities],
  );
  const selectedPack =
    activePacks.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedSource =
    (sources ?? []).find((source) => source.id === sourceId) ?? null;
  const installedCatalogKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const install of activePackageInstalls) {
      keys.add(packageInstallKey(install.package_source_id, install.root_path));
    }
    return keys;
  }, [activePackageInstalls]);
  const installedInstallsByKey = useMemo(() => {
    const map = new Map<string, PackageInstall>();
    for (const install of activePackageInstalls) {
      map.set(packageInstallKey(install.package_source_id, install.root_path), install);
    }
    return map;
  }, [activePackageInstalls]);
  const installedSelectors = useMemo(() => {
    const selectors = new Set<string>();
    for (const ability of skillAbilities) {
      const selector = metadataText(ability.metadata, ["install", "selector"]);
      if (selector) selectors.add(selector);
    }
    return selectors;
  }, [skillAbilities]);

  useEffect(() => {
    if (!sourceId && sources?.length) setSourceId(sources[0].id);
  }, [sourceId, sources]);

  useEffect(() => {
    if (sourcesLoading || !sources || officialSourceEnsureInFlight.current)
      return;
    const hasOfficialSource = sources.some((source) => {
      const info = sourceGitHubInfo(source);
      return (
        source.status === "active" &&
        source.source_type === "registry" &&
        source.adapter === "nenjo_packages" &&
        info?.owner === "nenjo-ai" &&
        info.repo === "packages" &&
        info.marketplacePath === "packages.yaml"
      );
    });
    if (hasOfficialSource) return;

    officialSourceEnsureInFlight.current = true;
    ensureOfficialNenjoPackageSource()
      .then((source) => {
        setSourceId((current) => current ?? source.id);
        mutateSources();
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to add Nenjo official package source",
        );
      })
      .finally(() => {
        officialSourceEnsureInFlight.current = false;
      });
  }, [mutateSources, sources, sourcesLoading]);

  useEffect(() => {
    if (!selectedPackId) return;
    if (!activePacks.some((pack) => pack.id === selectedPackId))
      setSelectedPackId(null);
  }, [activePacks, selectedPackId]);

  useEffect(() => {
    if (!selectedSource) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    setPackagesLoading(true);
    fetchMarketplacePackages(selectedSource)
      .then((nextPackages) => {
        if (!cancelled) {
          setPackages(nextPackages);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPackages([]);
          setError(
            err instanceof Error ? err.message : "Failed to load packages",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPackagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketplaceRefresh, selectedSource]);

  const filteredPacks = useMemo(() => {
    return activePacks;
  }, [activePacks]);

  const filteredSkills = useMemo(() => {
    return skillAbilities;
  }, [skillAbilities]);

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (kindFilter !== "all" && pkg.kind !== kindFilter) return false;
      return true;
    });
  }, [kindFilter, packages]);

  const resetNotice = () => {
    setError(null);
    setMessage(null);
  };

  const handleCreateSource = async () => {
    const parsed = parseGitHubRepoUrl(sourceRepoUrl);
    if (!parsed) {
      setError("Enter a valid GitHub repository URL");
      return;
    }
    const { owner, repo } = parsed;
    setBusyKey("create-source");
    resetNotice();
    try {
      const ref = sourceRef.trim() || "main";
      const resolvedCommitSha = await resolveGitHubCommitSha(owner, repo, ref);
      const manifestPath =
        sourceManifestPath.trim() ||
        (sourceAdapter === "claude_marketplace"
          ? CLAUDE_PLUGIN_MANIFEST_PATH
          : "packages.yaml");
      const created = await createPackageSource({
        name: sourceName.trim() || `${owner}/${repo}`,
        source_type: sourceAdapter === "nenjo_packages" ? "registry" : "github",
        adapter: sourceAdapter,
        metadata:
          sourceAdapter === "nenjo_packages"
            ? {
                source: {
                  kind: "git",
                  url: `https://github.com/${owner}/${repo}.git`,
                  reference: ref,
                  manifest_path: manifestPath,
                },
                resolved_commit_sha: resolvedCommitSha,
              }
            : {
                owner,
                repo,
                ref,
                resolved_commit_sha: resolvedCommitSha,
                manifest_path: manifestPath,
              },
      });
      await mutateSources();
      setSourceId(created.id);
      setSourceName("");
      setSourceRepoUrl("");
      setMarketplaceRefresh((value) => value + 1);
      setMessage("Package source added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSourceAdapterChange = (adapter: PackageSourceAdapter) => {
    setSourceAdapter(adapter);
    setSourceManifestPath((current) => {
      const trimmed = current.trim();
      if (
        adapter === "claude_marketplace" &&
        (!trimmed || trimmed === "packages.yaml")
      ) {
        return CLAUDE_PLUGIN_MANIFEST_PATH;
      }
      if (
        adapter === "nenjo_packages" &&
        (!trimmed ||
          trimmed === CLAUDE_PLUGIN_MANIFEST_PATH ||
          trimmed === CLAUDE_MARKETPLACE_MANIFEST_PATH)
      ) {
        return "packages.yaml";
      }
      return current;
    });
  };

  const handleRefreshSource = (source: PackageSource) => {
    const info = sourceGitHubInfo(source);
    if (!info) {
      setError("Package source is missing GitHub metadata");
      return;
    }
    setBusyKey(`sync:${source.id}`);
    resetNotice();
    resolveGitHubCommitSha(info.owner, info.repo, info.ref)
      .then(async (resolvedCommitSha) => {
        const sourceMetadata =
          source.metadata?.source &&
          typeof source.metadata.source === "object" &&
          !Array.isArray(source.metadata.source)
            ? {
                ...(source.metadata.source as Record<string, unknown>),
                reference: info.ref,
              }
            : undefined;
        const updated = await updatePackageSource(source.id, {
          metadata: {
            ...source.metadata,
            ...(sourceMetadata
              ? { source: sourceMetadata }
              : { ref: info.ref }),
            resolved_commit_sha: resolvedCommitSha,
          },
        });
        await mutateSources();
        setSourceId(updated.id);
        setActiveTab("packages");
        setMarketplaceRefresh((value) => value + 1);
        setMessage(
          `${source.name} refreshed to ${resolvedCommitSha.slice(0, 7)}.`,
        );
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to refresh source",
        );
      })
      .finally(() => setBusyKey(null));
  };

  const handleReviewPackage = async (pkg: MarketplacePackage) => {
    if (pkg.kind !== "plugin" && pkg.kind !== "skill") {
      setPackageDetails({ pkg, source: selectedSource });
      return;
    }
    setBusyKey(`review:${pkg.id}`);
    resetNotice();
    try {
      const review = await fetchMarketplacePackageReview(pkg, selectedSource);
      setPackageDetails(null);
      setPackageReview(review);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load skill markdown",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const mutateAgentDomainAssignments = () =>
    mutate(
      (key) =>
        typeof key === "string" &&
        key.includes("/agents/") &&
        key.endsWith("/domains"),
    );

  const handleInstallPackage = async (pkg: MarketplacePackage) => {
    setBusyKey(`install:${pkg.id}`);
    resetNotice();
    try {
      if (!selectedSource) throw new Error("Select a package source first");
      const detail = await installPackage(
        {
          source_id: selectedSource.id,
          path: pkg.source_path,
        },
        {
          onProgress: (progress) => {
            setInstallProgress((current) => ({
              ...current,
              [pkg.id]: progress,
            }));
          },
        },
      );
      setPackageInstallDetails((current) => ({
        ...current,
        [detail.install.id]: detail,
      }));
      await Promise.all([
        mutateInstalls(),
        mutatePacks(),
        mutateAbilities(),
        mutate(domainsUrl()),
        mutateAgentDomainAssignments(),
        mutateAgents(),
        mutateMcp(),
      ]);
      setPackageReview(null);
      setPackageDetails(null);
      setMessage(`${pkg.display_name ?? pkg.name} installed.`);
      setActiveTab("installed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstallProgress((current) => {
        const next = { ...current };
        delete next[pkg.id];
        return next;
      });
      setBusyKey(null);
    }
  };

  const handleUpdateInstall = async (install: PackageInstall) => {
    setBusyKey(`update-install:${install.id}`);
    resetNotice();
    try {
      const detail = await updatePackageInstall(install.id);
      setPackageInstallDetails((current) => ({
        ...current,
        [install.id]: detail,
      }));
      await Promise.all([
        mutateInstalls(),
        mutatePacks(),
        mutateAbilities(),
        mutate(domainsUrl()),
        mutateAgentDomainAssignments(),
        mutateAgents(),
        mutateMcp(),
      ]);
      setMessage(
        `${install.root_path} updated to latest ${install.requested_ref}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Package update failed");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUninstallPackageInstall = async (install: PackageInstall) => {
    const confirmed = window.confirm(
      `Uninstall ${install.root_path} and package-owned dependencies that are not used by another install?`,
    );
    if (!confirmed) return;
    setBusyKey(`uninstall-install:${install.id}`);
    resetNotice();
    try {
      await uninstallPackageInstall(install.id);
      setPackageInstallDetails((current) => {
        const next = { ...current };
        delete next[install.id];
        return next;
      });
      await Promise.all([
        mutateInstalls(),
        mutatePacks(),
        mutateAbilities(),
        mutate(domainsUrl()),
        mutateAgentDomainAssignments(),
        mutateAgents(),
        mutateMcp(),
      ]);
      setMessage(`${install.root_path} uninstalled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Package uninstall failed");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUninstallSkill = async (ability: Ability) => {
    setBusyKey(`uninstall-skill:${ability.id}`);
    resetNotice();
    try {
      await uninstallSkillAbility(ability.id);
      await mutateAbilities();
      setMessage(`${ability.name} uninstalled.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to uninstall skill",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpenEnvEditor = (ability: Ability) => {
    setEnvEditor({
      ability,
      envNamesText: abilityEnvNames(ability).join("\n"),
    });
  };

  const handleOpenAbilityPage = (ability: Ability) => {
    router.push(
      `/dashboard/agents?tab=abilities&ability=${encodeURIComponent(ability.name)}`,
    );
  };

  const handleViewInstalledSkill = async (ability: Ability) => {
    setBusyKey(`view-skill:${ability.id}`);
    resetNotice();
    try {
      const review = await fetchInstalledSkillReview(ability);
      setPackageReview(review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skill");
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveEnvEditor = async () => {
    if (!envEditor) return;
    setBusyKey(`skill-env:${envEditor.ability.id}`);
    resetNotice();
    try {
      await updateSkillRuntimeEnvNames(
        envEditor.ability.id,
        parseEnvNames(envEditor.envNamesText),
      );
      await mutateAbilities();
      setEnvEditor(null);
      setMessage(`${envEditor.ability.name} environment updated.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update skill environment",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteSource = async (source: PackageSource) => {
    setBusyKey(`delete-source:${source.id}`);
    resetNotice();
    try {
      await deletePackageSource(source.id);
      await mutateSources();
      if (sourceId === source.id) {
        setSourceId(undefined);
        setPackages([]);
      }
      setMessage(`${source.name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete source");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDirectImport = async () => {
    const owner = importOwner.trim();
    const repo = importRepo.trim();
    const path = importPath.trim().replace(/^\/+|\/+$/g, "");
    const ref = importRef.trim() || "main";
    const name = importName.trim() || path.split("/").pop() || repo;
    if (!owner || !repo || !path || !name) {
      setError("Owner, repo, path, and name are required");
      return;
    }
    setBusyKey("direct-import");
    resetNotice();
    try {
      if (importMode === "skill") {
        const selector = `repo://${owner}/${repo}/${name}`;
        const normalizedName = identifier(name);
        await installSkill({
          name: normalizedName,
          path: "repo",
          selector,
          metadata: githubInstallMetadata(
            owner,
            repo,
            path,
            name,
            ref,
            selector,
            "skill",
          ),
        });
        await mutateAbilities();
      } else {
        const selector = `repo://${owner}/${repo}/${name}`;
        await installKnowledgePack({
          name,
          slug: slugify(name),
          selector,
          source_type: "github",
          metadata: githubInstallMetadata(
            owner,
            repo,
            path,
            name,
            ref,
            selector,
            "knowledge_pack",
          ),
        });
        await mutatePacks();
      }
      setMessage(`${name} imported.`);
      setActiveTab("installed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusyKey(null);
    }
  };

  if (selectedPack) {
    return (
      <>
        <TopBar title="Packages" />
        <PageContent className="space-y-4">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/dashboard" },
              {
                label: "Packages",
                href: "/dashboard/packages",
                onClick: () => setSelectedPackId(null),
              },
              { label: selectedPack.name },
            ]}
          />
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-950 dark:text-gray-50">
                {selectedPack.name}
              </h1>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                {knowledgeSelector(selectedPack)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>
                {selectedPack.source_type === "package"
                  ? "Package"
                  : "Platform"}
              </Badge>
              {selectedPack.version ? (
                <Badge>{selectedPack.version}</Badge>
              ) : null}
              {selectedPack.read_only ? <Badge>Read-only</Badge> : null}
              {selectedPack.is_system ? <Badge>System</Badge> : null}
            </div>
          </div>
          {selectedPack.source_type === "package" && selectedPack.read_only ? (
            <SourceKnowledgeSection pack={selectedPack} />
          ) : (
            <KnowledgeSection
              packRef={selectedPack.slug}
              readOnly={selectedPack.read_only}
            />
          )}
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar title="Packages" />
      <PageContent className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Packages" },
          ]}
        />

        <div>
          <h1 className="theme-text text-2xl font-semibold">Packages</h1>
          <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
            Installed external packages, skills, plugins, and package sources
            for this org.
          </p>
        </div>

        <div className="mb-6">
          <Tabs
            tabs={[
              { id: "installed", label: "Installed" },
              { id: "packages", label: "Browse" },
              { id: "sources", label: "Sources" },
              { id: "imports", label: "Imports" },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as LibraryTab)}
            layoutId="library-tab-indicator"
          />
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}

        {activeTab === "installed" ? (
          <InstalledTab
            installs={activePackageInstalls}
            installDetails={packageInstallDetails}
            sources={sources ?? []}
            abilities={filteredSkills}
            isLoading={
              installsLoading ||
              packsLoading ||
              abilitiesLoading ||
              mcpLoading
            }
            onOpenPack={setSelectedPackId}
            onOpenAgent={(agentId) =>
              router.push(`/dashboard/agents/${agentId}`)
            }
            onOpenAbility={(abilityName) =>
              router.push(
                `/dashboard/agents?tab=abilities&ability=${encodeURIComponent(abilityName)}`,
              )
            }
            onOpenDomain={(domainName) =>
              router.push(
                `/dashboard/agents?tab=domains&domain=${encodeURIComponent(domainName)}`,
              )
            }
            onOpenContextBlock={(blockName) =>
              router.push(
                `/dashboard/agents?tab=context&block=${encodeURIComponent(blockName)}`,
              )
            }
            onOpenMcp={() => router.push("/dashboard/agents?tab=mcp")}
            onUpdateInstall={handleUpdateInstall}
            onUninstallInstall={handleUninstallPackageInstall}
            onViewSkill={handleViewInstalledSkill}
            onUninstallSkill={handleUninstallSkill}
            onEditSkillEnv={handleOpenEnvEditor}
            busyKey={busyKey}
          />
        ) : null}

        {activeTab === "packages" ? (
          <MarketplaceTab
            sources={sources ?? []}
            selectedSourceId={sourceId}
            onSourceChange={setSourceId}
            packages={filteredPackages}
            isLoading={sourcesLoading || packagesLoading}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            onOpen={handleReviewPackage}
            onOpenDetails={(pkg) =>
              setPackageDetails({ pkg, source: selectedSource })
            }
            onInstall={(pkg) => handleInstallPackage(pkg)}
            onUninstallInstall={handleUninstallPackageInstall}
            onRefresh={() => setMarketplaceRefresh((value) => value + 1)}
            installedKeys={installedCatalogKeys}
            installedInstallsByKey={installedInstallsByKey}
            installedSelectors={installedSelectors}
            busyKey={busyKey}
            installProgress={installProgress}
          />
        ) : null}

        {activeTab === "sources" ? (
          <SourcesTab
            sources={sources ?? []}
            isLoading={sourcesLoading}
            onRefresh={handleRefreshSource}
            onDelete={handleDeleteSource}
            busyKey={busyKey}
            sourceName={sourceName}
            sourceRepoUrl={sourceRepoUrl}
            sourceRef={sourceRef}
            sourceManifestPath={sourceManifestPath}
            onSourceNameChange={setSourceName}
            onSourceRepoUrlChange={setSourceRepoUrl}
            onSourceRefChange={setSourceRef}
            onSourceManifestPathChange={setSourceManifestPath}
            sourceAdapter={sourceAdapter}
            onSourceAdapterChange={handleSourceAdapterChange}
            onCreateSource={handleCreateSource}
          />
        ) : null}

        {activeTab === "imports" ? (
          <ImportsTab
            mode={importMode}
            owner={importOwner}
            repo={importRepo}
            path={importPath}
            refValue={importRef}
            name={importName}
            onModeChange={setImportMode}
            onOwnerChange={setImportOwner}
            onRepoChange={setImportRepo}
            onPathChange={setImportPath}
            onRefChange={setImportRef}
            onNameChange={setImportName}
            onImport={handleDirectImport}
            importing={busyKey === "direct-import"}
          />
        ) : null}
      </PageContent>
      <SkillReviewModal
        review={packageReview}
        busyKey={busyKey}
        onClose={() => setPackageReview(null)}
        onEnvNamesChange={(value) =>
          setPackageReview((current) =>
            current ? { ...current, envNamesText: value } : current,
          )
        }
        onSelectedSkillChange={(index) =>
          setPackageReview((current) =>
            current ? { ...current, selectedSkillIndex: index } : current,
          )
        }
        onInstall={() =>
          packageReview ? handleInstallPackage(packageReview.pkg) : undefined
        }
      />
      <PackageDetailsModal
        key={packageDetails?.pkg.id ?? "package-details"}
        pkg={packageDetails?.pkg ?? null}
        source={packageDetails?.source ?? null}
        installed={
          packageDetails
            ? isPackageInstalled(
                packageDetails.pkg,
                packageDetails.source,
                installedCatalogKeys,
                installedSelectors,
              )
            : false
        }
        busyKey={busyKey}
        onClose={() => setPackageDetails(null)}
        onInstall={() =>
          packageDetails ? handleInstallPackage(packageDetails.pkg) : undefined
        }
      />
      <SkillEnvModal
        editor={envEditor}
        busyKey={busyKey}
        onClose={() => setEnvEditor(null)}
        onChange={(value) =>
          setEnvEditor((current) =>
            current ? { ...current, envNamesText: value } : current,
          )
        }
        onSave={handleSaveEnvEditor}
      />
    </>
  );
}

function withInstallSelector(
  metadata: Record<string, unknown>,
  selector: string,
  kind: string,
): Record<string, unknown> {
  return {
    ...metadata,
    install: {
      ...(typeof metadata.install === "object" &&
      metadata.install !== null &&
      !Array.isArray(metadata.install)
        ? (metadata.install as Record<string, unknown>)
        : {}),
      selector,
      kind,
    },
  };
}

function githubInstallMetadata(
  owner: string,
  repo: string,
  path: string,
  packageName: string,
  ref: string,
  selector: string,
  kind: "knowledge_pack" | "skill",
): Record<string, unknown> {
  return {
    install: { selector, kind },
    source: { provider: "github", owner, repo, path, package: packageName },
    version: { ref, requested_ref: ref },
    distribution: {
      type: "github_directory",
      path,
      ...(kind === "skill"
        ? { entrypoint: "SKILL.md" }
        : { manifest_path: "manifest.yaml" }),
    },
  };
}

function isPackageInstalled(
  pkg: MarketplacePackage,
  source: PackageSource | null,
  installedKeys: Set<string>,
  installedSelectors: Set<string>,
): boolean {
  if (
    source &&
    installedKeys.has(packageInstallKey(source.id, pkg.source_path))
  )
    return true;
  const selector = packageSelector(pkg);
  return selector ? installedSelectors.has(selector) : false;
}

function packageSourceLabel(metadata: Record<string, unknown>): string | null {
  const owner = metadataText(metadata, ["source", "owner"]);
  const repo = metadataText(metadata, ["source", "repo"]);
  if (owner && repo) return `${owner}/${repo}`;
  return metadataText(metadata, ["source", "url"]);
}

function packageVersionBadge(metadata: Record<string, unknown>): string | null {
  const commit = metadataText(metadata, ["version", "resolved_commit_sha"]);
  if (commit) return commit.slice(0, 7);
  return (
    metadataText(metadata, ["version", "requested_ref"]) ??
    metadataText(metadata, ["version", "ref"])
  );
}

function rootInstallResource(
  install: PackageInstall,
  detail: PackageInstallDetail | undefined,
): PackageInstallResource | null {
  const resources = detail?.resources ?? [];
  if (!resources.length) return null;
  return (
    resources.find(
      (resource) => resource.resource_id === install.root_resource_id,
    ) ??
    resources.find(
      (resource) => resource.resource_type === install.root_type,
    ) ??
    resources[0] ??
    null
  );
}

function packageInstallTitle(
  install: PackageInstall,
  detail: PackageInstallDetail | undefined,
): string {
  const rootResource = rootInstallResource(install, detail);
  return (
    metadataText(rootResource?.metadata ?? {}, ["runtime", "display_name"]) ??
    metadataText(rootResource?.metadata ?? {}, ["runtime", "name"]) ??
    metadataText(rootResource?.metadata ?? {}, ["package", "name"]) ??
    metadataText(rootResource?.metadata ?? {}, ["source", "package"]) ??
    metadataText(install.metadata, ["runtime", "display_name"]) ??
    metadataText(install.metadata, ["runtime", "name"]) ??
    metadataText(install.metadata, ["package", "name"]) ??
    metadataText(install.metadata, ["source", "package"]) ??
    packageNameFromInstallPath(install.root_path) ??
    install.root_path
  );
}

function packageInstallSubtitle(
  install: PackageInstall,
  source: PackageSource | undefined,
): string {
  return (
    packageInstallSourceBadge(source) ??
    packageInstallKindLabel(install.root_type)
  );
}

function packageInstallKindLabel(rootType: string): string {
  switch (normalizedPackageResourceType(rootType)) {
    case "agent":
      return "Agent";
    case "ability":
      return "Ability";
    case "domain":
      return "Domain";
    case "context_block":
      return "Context block";
    case "knowledge":
      return "Knowledge";
    case "mcp_server":
    case "mcp":
      return "MCP";
    case "routine":
      return "Routine";
    case "skill":
      return "Skill";
    case "command":
      return "Command";
    case "hook":
      return "Hook";
    case "script_tool":
      return "Script tool";
    case "plugin":
      return "Plugin";
    default:
      return "Package";
  }
}

function packageInstallSourceBadge(
  source: PackageSource | undefined,
): string | null {
  if (!source) return null;
  if (source.adapter === "claude_marketplace") return "Claude plugins";
  if (source.adapter === "codex_plugin") return "Codex plugin";
  return source.name;
}

function packageInstallVersionBadge(install: PackageInstall): string | null {
  return install.resolved_commit_sha
    ? install.resolved_commit_sha.slice(0, 7)
    : install.requested_ref;
}

function packageInstallDescription(
  install: PackageInstall,
  detail: PackageInstallDetail | undefined,
  source: PackageSource | undefined,
): string | null {
  const rootResource = rootInstallResource(install, detail);
  return (
    metadataText(rootResource?.metadata ?? {}, ["runtime", "description"]) ??
    metadataText(rootResource?.metadata ?? {}, ["description"]) ??
    metadataText(install.metadata, ["description"]) ??
    source?.name ??
    null
  );
}

function packageInstallIcon(
  install: PackageInstall,
  detail: PackageInstallDetail | undefined,
): React.ReactNode {
  const rootResource = rootInstallResource(install, detail);
  const icon =
    metadataText(rootResource?.metadata ?? {}, ["package", "icon"]) ??
    metadataText(rootResource?.metadata ?? {}, ["runtime", "icon"]) ??
    metadataText(rootResource?.metadata ?? {}, ["icon"]) ??
    metadataText(install.metadata, ["package", "icon"]) ??
    metadataText(install.metadata, ["runtime", "icon"]) ??
    metadataText(install.metadata, ["icon"]);

  return packageIconNode(icon);
}

function packageIconNode(icon: string | null): React.ReactNode {
  if (icon && isImageIcon(icon)) {
    return (
      <span
        aria-hidden="true"
        className="h-7 w-7 rounded-md bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${JSON.stringify(icon.trim())})` }}
      />
    );
  }
  if (icon && isCompactIconGlyph(icon)) {
    return (
      <span aria-hidden="true" className="text-xl leading-none">
        {icon.trim()}
      </span>
    );
  }
  return <Package className="h-5 w-5" />;
}

function isImageIcon(value: string): boolean {
  const icon = value.trim();
  return (
    /^https?:\/\//i.test(icon) ||
    /^data:image\//i.test(icon) ||
    icon.startsWith("/")
  );
}

function isCompactIconGlyph(value: string): boolean {
  const icon = value.trim();
  return icon.length > 0 && icon.length <= 4 && !/[A-Za-z0-9/_:.-]/.test(icon);
}

function resourceNameTail(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const fragment = text.split("#").pop() ?? text;
  const segment = fragment.split("/").pop() ?? fragment;
  return segment.trim() || null;
}

function packageNameFromInstallPath(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/^\/+|\/+$/g, "");
  if (!text) return null;
  const parts = text.split("/").filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  if (last === "plugin.json" && parts[parts.length - 2] === ".claude-plugin") {
    return parts[parts.length - 3] ?? null;
  }
  if (
    last === "package.yaml" ||
    last === "package.yml" ||
    last === "nenjo.package.yaml" ||
    last === "nenjo.package.yml"
  ) {
    return parts[parts.length - 2] ?? null;
  }
  return resourceNameTail(text);
}

function runtimeResourceTitle(resource: PackageInstallResource): string {
  const resourceType = normalizedPackageResourceType(resource.resource_type);
  if (resourceType === "command") {
    return (
      metadataText(resource.metadata, ["runtime", "command"]) ??
      metadataText(resource.metadata, ["runtime", "display_name"]) ??
      resource.resource_name
    );
  }
  if (resourceType === "context_block") {
    return (
      metadataText(resource.metadata, ["runtime", "display_name"]) ??
      metadataText(resource.metadata, ["runtime", "name"]) ??
      resourceNameTail(resource.resource_name) ??
      resourceNameTail(resource.source_path) ??
      resource.resource_name
    );
  }
  return (
    metadataText(resource.metadata, ["runtime", "display_name"]) ??
    resourceNameTail(resource.resource_name) ??
    resource.resource_name
  );
}

function runtimeResourceDescription(
  resource: PackageInstallResource,
): string | null {
  return (
    metadataText(resource.metadata, ["runtime", "description"]) ??
    metadataText(resource.metadata, ["source", "package"])
  );
}

function runtimeResourceSubtitle(resource: PackageInstallResource): string {
  const event = metadataText(resource.metadata, ["runtime", "event"]);
  const matcher = metadataText(resource.metadata, ["runtime", "matcher"]);
  if (event && matcher) return `${event} · ${matcher}`;
  if (event) return event;
  return resource.source_path;
}

function runtimeResourceBadges(
  resource: PackageInstallResource,
): Array<string | null> {
  const resourceType = normalizedPackageResourceType(resource.resource_type);
  return [
    packageInstallKindLabel(resourceType),
    packageSourceLabel(resource.metadata),
    packageVersionBadge(resource.metadata),
    metadataText(resource.metadata, ["runtime", "category"]),
    metadataText(resource.metadata, ["runtime", "type"]),
    "Read-only",
  ];
}

function parseEnvNames(value: string): string[] {
  const names = new Set<string>();
  value
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    });
  return Array.from(names);
}

function abilityEnvNames(ability: Ability): string[] {
  const value = ability.metadata?.runtime;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envNames = (value as Record<string, unknown>).env_names;
  return Array.isArray(envNames)
    ? envNames.filter((name): name is string => typeof name === "string")
    : [];
}

function marketplacePackageGitHubInfo(
  pkg: MarketplacePackage,
  source: PackageSource | null,
): MarketplaceGitHubInfo | null {
  const sourceInfo = source ? sourceGitHubInfo(source) : null;
  const owner =
    metadataText(pkg.metadata, ["source", "owner"]) ??
    sourceInfo?.owner ??
    null;
  const repo =
    metadataText(pkg.metadata, ["source", "repo"]) ?? sourceInfo?.repo ?? null;
  if (!owner || !repo) return null;
  return {
    owner,
    repo,
    ref:
      metadataText(pkg.metadata, ["version", "ref"]) ??
      metadataText(pkg.metadata, ["version", "requested_ref"]) ??
      sourceInfo?.ref ??
      "main",
    resolvedCommitSha:
      metadataText(pkg.metadata, ["version", "resolved_commit_sha"]) ??
      sourceInfo?.resolvedCommitSha ??
      null,
  };
}

async function fetchGitHubContentsOptional(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<GithubContentsEntry[] | null> {
  const res = await fetch(githubContentsUrl(owner, repo, ref, path));
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Failed to fetch GitHub contents for ${path}: ${res.status}`,
    );
  }
  const text = await res.text();
  const value =
    parseStructuredText<GithubContentsEntry[] | GithubContentsEntry>(text);
  return Array.isArray(value) ? value : [value];
}

function skillReviewFromMarkdown(
  skillPath: string,
  content: string,
  fallbackName: string,
  fallbackDescription: string | null,
): SkillReview {
  const rendered = splitFrontmatter(content);
  const metadataName = frontmatterValue(rendered.frontmatter, "name");
  const metadataDescription = frontmatterValue(
    rendered.frontmatter,
    "description",
  );
  const segments = skillPath.split("/").filter(Boolean);
  const folderName =
    segments.length >= 2 ? segments[segments.length - 2] : fallbackName;
  return {
    name: metadataName ?? folderName,
    display_name: metadataName ?? fallbackName,
    description: metadataDescription ?? fallbackDescription,
    entrypoint: segments[segments.length - 1] ?? "SKILL.md",
    skill_path: skillPath,
    content,
  };
}

function packageReviewFromSkills(
  pkg: MarketplacePackage,
  source: PackageSource | null,
  info: MarketplaceGitHubInfo,
  sourcePath: string,
  skills: SkillReview[],
): PackageReview {
  return {
    pkg,
    source,
    plugin_request: {
      name: pkg.name,
      display_name: pkg.display_name,
      description: pkg.description,
      source: { path: sourcePath },
      version: {
        ref_: info.ref,
        resolved_commit_sha: info.resolvedCommitSha,
        package_version:
          pkg.latest_version ??
          metadataText(pkg.metadata, ["version", "package_version"]),
      },
      skills,
    },
    envNamesText: "",
    selectedSkillIndex: 0,
  };
}

async function fetchSkillReviewsFromPaths(
  info: MarketplaceGitHubInfo,
  paths: string[],
  pkg: MarketplacePackage,
): Promise<{ skills: SkillReview[]; lastError: unknown }> {
  const fetchRef = sourceFetchRef(info);
  const uniquePaths = Array.from(
    new Set(paths.map(normalizeCatalogPath).filter(Boolean)),
  );
  const results = await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        const content = await fetchOptionalText(
          githubRawUrl(info.owner, info.repo, fetchRef, path),
        );
        return {
          skill: content
            ? skillReviewFromMarkdown(
                path,
                content,
                pkg.display_name ?? pkg.name,
                pkg.description,
              )
            : null,
          error: null,
        };
      } catch (error) {
        return { skill: null, error };
      }
    }),
  );

  let lastError: unknown = null;
  const skills: SkillReview[] = [];
  for (const result of results) {
    if (result.error) lastError = result.error;
    if (result.skill) skills.push(result.skill);
  }
  return { skills, lastError };
}

function fallbackPluginSkillPaths(
  pkg: MarketplacePackage,
  rootPath: string,
): string[] {
  const names = new Set<string>();
  const addName = (value: string | null | undefined) => {
    if (!value) return;
    const clean = normalizeCatalogPath(value);
    if (clean && !clean.includes("/")) names.add(clean);
    const slug = slugify(value);
    if (slug) names.add(slug);
    const hyphenated = identifier(value).replace(/_/g, "-");
    if (hyphenated) names.add(hyphenated);
  };
  addName(pkg.name);
  addName(pkg.display_name ?? undefined);
  addName(metadataText(pkg.metadata, ["source", "package"]));
  addName(pkg.source_path.split("/").filter(Boolean).pop());

  return [
    ...Array.from(names).map((name) =>
      joinRelativePath(rootPath, `skills/${name}/SKILL.md`),
    ),
    joinRelativePath(rootPath, "skills/SKILL.md"),
    joinRelativePath(rootPath, "SKILL.md"),
  ];
}

async function discoverPluginSkillPaths(
  info: MarketplaceGitHubInfo,
  rootPath: string,
  pkg: MarketplacePackage,
): Promise<string[]> {
  const discovered: string[] = [];
  try {
    const rootEntries = await fetchGitHubContentsOptional(
      info.owner,
      info.repo,
      sourceFetchRef(info),
      rootPath,
    );
    const skillsEntry = rootEntries?.find(
      (entry) => entry.type === "dir" && entry.name === "skills",
    );
    if (!skillsEntry) {
      return fallbackPluginSkillPaths(pkg, rootPath);
    }
    const entries = await fetchGitHubContentsOptional(
      info.owner,
      info.repo,
      sourceFetchRef(info),
      skillsEntry.path,
    );
    for (const entry of entries ?? []) {
      if (entry.type === "dir") {
        discovered.push(joinRelativePath(entry.path, "SKILL.md"));
      } else if (
        entry.type === "file" &&
        entry.name.toLowerCase() === "skill.md"
      ) {
        discovered.push(entry.path);
      }
    }
  } catch {
    // Fall back to conventional paths when the unauthenticated GitHub API is unavailable.
  }
  return Array.from(
    new Set([...discovered, ...fallbackPluginSkillPaths(pkg, rootPath)]),
  );
}

async function fetchPluginDocumentationReview(
  pkg: MarketplacePackage,
  source: PackageSource | null,
  info: MarketplaceGitHubInfo,
  rootPath: string,
): Promise<PackageReview | null> {
  const candidates = [
    "README.md",
    "readme.md",
    CLAUDE_PLUGIN_MANIFEST_PATH,
    "plugin.json",
  ].map((path) => joinRelativePath(rootPath, path));
  const fetchRef = sourceFetchRef(info);
  for (const path of candidates) {
    const content = await fetchOptionalText(
      githubRawUrl(info.owner, info.repo, fetchRef, path),
    );
    if (!content) continue;
    const isJson = path.endsWith(".json");
    const body = isJson
      ? `# ${pkg.display_name ?? pkg.name}\n\n\`\`\`json\n${content.trim()}\n\`\`\`\n`
      : content;
    return packageReviewFromSkills(pkg, source, info, rootPath, [
      {
        name: isJson ? "plugin-manifest" : "readme",
        display_name: isJson ? "Plugin manifest" : "README",
        description: pkg.description,
        entrypoint: path.split("/").pop() ?? "README.md",
        skill_path: path,
        content: body,
      },
    ]);
  }
  return null;
}

function skillPackageEntrypointPath(pkg: MarketplacePackage): string {
  const sourcePath = normalizePluginRootPath(
    metadataText(pkg.metadata, ["source", "path"]) ?? pkg.source_path,
  );
  const entrypoint =
    metadataText(pkg.metadata, ["distribution", "entrypoint"]) ?? "SKILL.md";
  if (/\.(ya?ml|json|toml)$/i.test(sourcePath)) {
    const packageDir = sourcePath.includes("/")
      ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
      : ".";
    return joinRelativePath(packageDir, entrypoint);
  }
  return joinRelativePath(sourcePath, entrypoint);
}

async function fetchMarketplaceSkillPackageReview(
  pkg: MarketplacePackage,
  source: PackageSource | null,
  info: MarketplaceGitHubInfo,
): Promise<PackageReview> {
  const paths: string[] = [];
  if (source?.adapter === "nenjo_packages") {
    try {
      const details = await fetchPackageDetails(source, pkg);
      paths.push(
        ...details.moduleGroups.flatMap((group) =>
          group.modules
            .filter((module) => module.kind === "skill")
            .map((module) => module.path),
        ),
      );
    } catch {
      // Direct skill packages can still be previewed via their entrypoint.
    }
  }
  if (!paths.length) paths.push(skillPackageEntrypointPath(pkg));

  const { skills, lastError } = await fetchSkillReviewsFromPaths(
    info,
    paths,
    pkg,
  );
  if (!skills.length) {
    const message = `No SKILL.md found for ${pkg.display_name ?? pkg.name}`;
    if (lastError instanceof Error) throw new Error(`${message}: ${lastError.message}`);
    throw new Error(message);
  }
  return packageReviewFromSkills(
    pkg,
    source,
    info,
    pkg.source_path,
    skills,
  );
}

async function fetchMarketplacePluginReview(
  pkg: MarketplacePackage,
  source: PackageSource | null,
  info: MarketplaceGitHubInfo,
): Promise<PackageReview> {
  const rootPath = normalizePluginRootPath(
    metadataText(pkg.metadata, ["source", "path"]),
  );
  const paths = await discoverPluginSkillPaths(info, rootPath, pkg);
  const { skills, lastError } = await fetchSkillReviewsFromPaths(
    info,
    paths,
    pkg,
  );
  if (!skills.length) {
    const documentation = await fetchPluginDocumentationReview(
      pkg,
      source,
      info,
      rootPath,
    );
    if (documentation) return documentation;
    const searchRoot = rootPath === "." ? "skills/" : `${rootPath}/skills/`;
    const message = `No SKILL.md found under ${searchRoot}`;
    if (lastError instanceof Error) throw new Error(`${message}: ${lastError.message}`);
    throw new Error(message);
  }
  return packageReviewFromSkills(pkg, source, info, rootPath, skills);
}

async function fetchMarketplacePackageReview(
  pkg: MarketplacePackage,
  source: PackageSource | null,
): Promise<PackageReview> {
  const info = marketplacePackageGitHubInfo(pkg, source);
  if (!info) {
    throw new Error("Package is missing GitHub source metadata");
  }
  if (pkg.kind === "plugin") {
    return fetchMarketplacePluginReview(pkg, source, info);
  }
  return fetchMarketplaceSkillPackageReview(pkg, source, info);
}

async function fetchInstalledSkillReview(
  ability: Ability,
): Promise<PackageReview> {
  const owner = metadataText(ability.metadata, ["source", "owner"]);
  const repo = metadataText(ability.metadata, ["source", "repo"]);
  const packageName =
    metadataText(ability.metadata, ["source", "package"]) ?? ability.name;
  const sourcePath = metadataText(ability.metadata, ["source", "path"]);
  const ref =
    metadataText(ability.metadata, ["version", "ref"]) ??
    metadataText(ability.metadata, ["version", "requested_ref"]) ??
    "main";
  const resolvedCommitSha = metadataText(ability.metadata, [
    "version",
    "resolved_commit_sha",
  ]);
  const entrypoint =
    metadataText(ability.metadata, ["distribution", "entrypoint"]) ??
    "SKILL.md";
  if (!owner || !repo || !sourcePath) {
    throw new Error("Installed skill is missing GitHub source metadata");
  }
  const fetchRef = resolvedCommitSha ?? ref;
  const skillPath = `${sourcePath.replace(/\/+$/, "")}/${entrypoint.replace(/^\/+/, "")}`;
  const content = await fetchText(
    githubRawUrl(owner, repo, fetchRef, skillPath),
  );
  const pkg: MarketplacePackage = {
    id: ability.id,
    kind: "skill",
    name: packageName,
    display_name: ability.name,
    description: ability.description,
    latest_version: metadataText(ability.metadata, [
      "version",
      "package_version",
    ]),
    metadata: ability.metadata,
    synced_at: ability.updated_at,
    source_path: sourcePath,
  };
  return {
    pkg,
    source: null,
    plugin_request: {
      name: packageName,
      display_name: ability.name,
      description: ability.description,
      source: { path: sourcePath },
      version: {
        ref_: ref,
        resolved_commit_sha: resolvedCommitSha,
        package_version: metadataText(ability.metadata, [
          "version",
          "package_version",
        ]),
      },
      skills: [
        {
          name: ability.name,
          display_name: ability.name,
          description: ability.description,
          entrypoint,
          skill_path: skillPath,
          content,
        },
      ],
    },
    envNamesText: abilityEnvNames(ability).join("\n"),
    selectedSkillIndex: 0,
  };
}

function splitFrontmatter(markdown: string): {
  frontmatter: Array<[string, string]>;
  body: string;
} {
  const parsed = matter(markdown);
  return {
    frontmatter: Object.entries(parsed.data).map(([key, value]) => [
      key,
      formatFrontmatterValue(value),
    ]),
    body: parsed.content.trimStart(),
  };
}

function formatFrontmatterValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(formatFrontmatterValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function frontmatterValue(
  entries: Array<[string, string]>,
  key: string,
): string | null {
  return entries.find(([entryKey]) => entryKey === key)?.[1] || null;
}

function frontmatterEntriesWithout(
  entries: Array<[string, string]>,
  keys: string[],
): Array<[string, string]> {
  return entries.filter(([key]) => !keys.includes(key));
}

function humanizeFrontmatterKey(key: string): string {
  return key.replace(/[_-]/g, " ");
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {children}
    </span>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function PackageInstallCard({
  install,
  detail,
  source,
  onInspect,
  onUpdateInstall,
  onUninstallInstall,
  busyKey,
}: {
  install: PackageInstall;
  detail: PackageInstallDetail | undefined;
  source: PackageSource | undefined;
  onInspect: () => void;
  onUpdateInstall: (install: PackageInstall) => void;
  onUninstallInstall: (install: PackageInstall) => void;
  busyKey: string | null;
}) {
  const dependencyInfo = packageInstallDependencyInfo(install);
  const resources = installedPackageResources(detail);
  const uninstallBlocked = dependencyInfo.requiredBy.length > 0;
  const uninstallTitle = uninstallBlocked
    ? `Required by ${dependencyRefListLabel(dependencyInfo.requiredBy)}`
    : undefined;

  return (
    <AssetCard
      icon={packageInstallIcon(install, detail)}
      title={packageInstallTitle(install, detail)}
      subtitle={packageInstallSubtitle(install, source)}
      description={packageInstallDescription(install, detail, source)}
      badges={[
        packageInstallVersionBadge(install),
        ...packageInstallDependencyBadges(dependencyInfo),
        detail ? `${resources.length} resources` : null,
      ]}
      updatedAt={install.updated_at}
      isBusy={busyKey === `update-install:${install.id}`}
      actions={
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={onInspect}
          >
            <ChevronDown className="-rotate-90 h-4 w-4" />
            Inspect
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => onUpdateInstall(install)}
            isLoading={busyKey === `update-install:${install.id}`}
          >
            <RefreshCw className="h-4 w-4" />
            Update
          </Button>
          <Button
            size="sm"
            variant="danger"
            className="w-full"
            onClick={() => onUninstallInstall(install)}
            isLoading={busyKey === `uninstall-install:${install.id}`}
            disabled={uninstallBlocked}
            title={uninstallTitle}
          >
            <Trash2 className="h-4 w-4" />
            Uninstall
          </Button>
        </div>
      }
    />
  );
}

function PackageInstallInspectionModal({
  install,
  detail,
  source,
  dependencyInstallByRootPath,
  onClose,
  onOpenInstall,
  onOpenResource,
}: {
  install: PackageInstall | null;
  detail: PackageInstallDetail | undefined;
  source: PackageSource | undefined;
  dependencyInstallByRootPath: Map<string, PackageInstall>;
  onClose: () => void;
  onOpenInstall: (installId: string) => void;
  onOpenResource: (resource: PackageInstallResource) => void;
}) {
  const dependencyInfo = install
    ? packageInstallDependencyInfo(install)
    : { autoInstalled: false, dependsOn: [], requiredBy: [] };
  const resources = installedPackageResources(detail);
  return (
    <Modal
      open={Boolean(install)}
      onClose={onClose}
      title={install ? packageInstallTitle(install, detail) : "Package"}
      className="max-w-4xl"
    >
      {install ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                packageInstallKindLabel(install.root_type),
                packageInstallSourceBadge(source),
                packageInstallVersionBadge(install),
                ...packageInstallDependencyBadges(dependencyInfo),
                detail ? `${resources.length} resources` : null,
              ]
                .filter(Boolean)
                .map((badge) => (
                  <Badge key={badge}>{badge}</Badge>
                ))}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {packageInstallDescription(install, detail, source) ??
                packageInstallSubtitle(install, source)}
            </p>
          </div>
          <PackageInstallInspection
            detailLoaded={Boolean(detail)}
            dependencyInfo={dependencyInfo}
            dependencyInstallByRootPath={dependencyInstallByRootPath}
            resources={resources}
            onOpenInstall={onOpenInstall}
            onOpenResource={onOpenResource}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function PackageInstallInspection({
  detailLoaded,
  dependencyInfo,
  dependencyInstallByRootPath,
  resources,
  onOpenInstall,
  onOpenResource,
}: {
  detailLoaded: boolean;
  dependencyInfo: PackageInstallDependencyInfo;
  dependencyInstallByRootPath: Map<string, PackageInstall>;
  resources: PackageInstallResource[];
  onOpenInstall: (installId: string) => void;
  onOpenResource: (resource: PackageInstallResource) => void;
}) {
  return (
    <div className="space-y-4">
      <PackageDependencyList
        title="Dependencies"
        refs={dependencyInfo.dependsOn}
        dependencyInstallByRootPath={dependencyInstallByRootPath}
        emptyText="No plugin dependencies."
        onOpenInstall={onOpenInstall}
      />
      <PackageDependencyList
        title="Required By"
        refs={dependencyInfo.requiredBy}
        dependencyInstallByRootPath={dependencyInstallByRootPath}
        emptyText="No installed package requires this."
        onOpenInstall={onOpenInstall}
      />
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Resources
        </h4>
        {!detailLoaded ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            Loading resources...
          </p>
        ) : resources.length ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
            {resources.map((resource) => (
              <PackageResourceRow
                key={`${resource.resource_type}:${resource.id}`}
                resource={resource}
                onOpenResource={onOpenResource}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            No installed resources recorded.
          </p>
        )}
      </div>
    </div>
  );
}

function PackageDependencyList({
  title,
  refs,
  dependencyInstallByRootPath,
  emptyText,
  onOpenInstall,
}: {
  title: string;
  refs: PackageDependencyRef[];
  dependencyInstallByRootPath: Map<string, PackageInstall>;
  emptyText: string;
  onOpenInstall: (installId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h4>
      {refs.length ? (
        <div className="space-y-1.5">
          {refs.map((ref) => {
            const install = dependencyInstallByRootPath.get(ref.rootPath);
            return (
              <button
                key={ref.rootPath}
                type="button"
                disabled={!install}
                onClick={() => {
                  if (install) onOpenInstall(install.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-70 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate">
                  {ref.name}
                  <span className="ml-1 text-gray-400">{ref.rootPath}</span>
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {install ? "Inspect" : "Missing"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function PackageResourceRow({
  resource,
  onOpenResource,
}: {
  resource: PackageInstallResource;
  onOpenResource: (resource: PackageInstallResource) => void;
}) {
  const resourceType = normalizedPackageResourceType(resource.resource_type);
  const actionLabel = packageResourceActionLabel(resource);
  const details = runtimeResourceDetails(resource);
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
        {packageKindIcon(resourceType, "h-4 w-4")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {runtimeResourceTitle(resource)}
          </p>
          <span className="shrink-0 text-[11px] text-gray-400">
            {packageInstallKindLabel(resourceType)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
          {runtimeResourceSubtitle(resource)}
        </p>
        {runtimeResourceDescription(resource) ? (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {runtimeResourceDescription(resource)}
          </p>
        ) : null}
        {details.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {details.map((detail) => (
              <span
                key={detail}
                className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800/70 dark:text-gray-400"
              >
                {detail}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {actionLabel ? (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => onOpenResource(resource)}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function InstalledTab({
  installs,
  installDetails,
  sources,
  abilities,
  isLoading,
  onOpenPack,
  onOpenAgent,
  onOpenAbility,
  onOpenDomain,
  onOpenContextBlock,
  onOpenMcp,
  onUpdateInstall,
  onUninstallInstall,
  onViewSkill,
  onUninstallSkill,
  onEditSkillEnv,
  busyKey,
}: {
  installs: PackageInstall[];
  installDetails: Record<string, PackageInstallDetail>;
  sources: PackageSource[];
  abilities: Ability[];
  isLoading: boolean;
  onOpenPack: (id: string) => void;
  onOpenAgent: (id: string) => void;
  onOpenAbility: (name: string) => void;
  onOpenDomain: (name: string) => void;
  onOpenContextBlock: (name: string) => void;
  onOpenMcp: () => void;
  onUpdateInstall: (install: PackageInstall) => void;
  onUninstallInstall: (install: PackageInstall) => void;
  onViewSkill: (ability: Ability) => void;
  onUninstallSkill: (ability: Ability) => void;
  onEditSkillEnv: (ability: Ability) => void;
  busyKey: string | null;
}) {
  const [inspectingInstallId, setInspectingInstallId] = useState<string | null>(
    null,
  );
  const sourcesById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const installsByRootPath = useMemo(
    () => new Map(installs.map((install) => [install.root_path, install])),
    [installs],
  );
  const inspectingInstall =
    installs.find((install) => install.id === inspectingInstallId) ?? null;
  const openInstall = (installId: string) => setInspectingInstallId(installId);
  const openResource = (resource: PackageInstallResource) => {
    setInspectingInstallId(null);
    const resourceType = normalizedPackageResourceType(resource.resource_type);
    if (resourceType === "knowledge") {
      onOpenPack(resource.resource_id);
    } else if (resourceType === "agent") {
      onOpenAgent(resource.resource_id);
    } else if (resourceType === "ability") {
      onOpenAbility(
        metadataText(resource.metadata, ["runtime", "name"]) ??
          resource.resource_name,
      );
    } else if (resourceType === "domain") {
      onOpenDomain(
        metadataText(resource.metadata, ["runtime", "name"]) ??
          resource.resource_name,
      );
    } else if (resourceType === "context_block") {
      onOpenContextBlock(
        metadataText(resource.metadata, ["runtime", "name"]) ??
          metadataText(resource.metadata, ["runtime", "display_name"]) ??
          resource.resource_name,
      );
    } else if (resourceType === "mcp_server" || resourceType === "mcp") {
      onOpenMcp();
    }
  };

  if (isLoading) return <LoadingGrid />;
  const hasInstalledItems = installs.length || abilities.length;
  if (!hasInstalledItems)
    return <EmptyState text="No external packages installed." />;
  return (
    <div className="space-y-7">
      {installs.length ? (
        <CollapsibleAssetSection
          title="Installed Packages"
          count={installs.length}
          icon={<Package className="h-4 w-4" />}
        >
          {installs.map((install) => (
            <PackageInstallCard
              key={install.id}
              install={install}
              detail={installDetails[install.id]}
              source={sourcesById.get(install.package_source_id)}
              onInspect={() => setInspectingInstallId(install.id)}
              onUpdateInstall={onUpdateInstall}
              onUninstallInstall={onUninstallInstall}
              busyKey={busyKey}
            />
          ))}
        </CollapsibleAssetSection>
      ) : null}

      <PackageInstallInspectionModal
        install={inspectingInstall}
        detail={
          inspectingInstall
            ? installDetails[inspectingInstall.id]
            : undefined
        }
        source={
          inspectingInstall
            ? sourcesById.get(inspectingInstall.package_source_id)
            : undefined
        }
        dependencyInstallByRootPath={installsByRootPath}
        onClose={() => setInspectingInstallId(null)}
        onOpenInstall={openInstall}
        onOpenResource={openResource}
      />

      {abilities.length ? (
        <CollapsibleAssetSection
          title="Legacy Skills"
          count={abilities.length}
          icon={<Sparkles className="h-4 w-4" />}
        >
          {abilities.map((ability) => (
            <AssetCard
              key={ability.id}
              icon={<Sparkles className="h-5 w-5" />}
              title={ability.name}
              subtitle={
                metadataText(ability.metadata, ["install", "selector"]) ??
                ability.name
              }
              description={ability.description}
              badges={[
                "Skill",
                `${ability.mcp_servers.length} MCP`,
                ability.read_only ? "Read-only" : null,
              ]}
              updatedAt={ability.updated_at}
              onClick={() => onViewSkill(ability)}
              isBusy={busyKey === `view-skill:${ability.id}`}
              actions={
                !ability.is_system ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => onOpenAbility(ability.name)}
                    >
                      <Zap className="h-4 w-4" />
                      Ability
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => onEditSkillEnv(ability)}
                    >
                      Edit env
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-full"
                      onClick={() => onUninstallSkill(ability)}
                      isLoading={busyKey === `uninstall-skill:${ability.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Uninstall
                    </Button>
                  </div>
                ) : null
              }
            />
          ))}
        </CollapsibleAssetSection>
      ) : null}
    </div>
  );
}

function MarketplaceTab({
  sources,
  selectedSourceId,
  onSourceChange,
  packages,
  isLoading,
  kindFilter,
  onKindFilterChange,
  onOpen,
  onOpenDetails,
  onInstall,
  onUninstallInstall,
  onRefresh,
  installedKeys,
  installedInstallsByKey,
  installedSelectors,
  busyKey,
  installProgress,
}: {
  sources: PackageSource[];
  selectedSourceId: string | undefined;
  onSourceChange: (id: string) => void;
  packages: MarketplacePackage[];
  isLoading: boolean;
  kindFilter: MarketplacePackageKind | "all";
  onKindFilterChange: (kind: MarketplacePackageKind | "all") => void;
  onOpen: (pkg: MarketplacePackage) => void;
  onOpenDetails: (pkg: MarketplacePackage) => void;
  onInstall: (pkg: MarketplacePackage) => void;
  onUninstallInstall: (install: PackageInstall) => void;
  onRefresh: () => void;
  installedKeys: Set<string>;
  installedInstallsByKey: Map<string, PackageInstall>;
  installedSelectors: Set<string>;
  busyKey: string | null;
  installProgress: Record<string, PackageInstallProgress>;
}) {
  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Select
          value={selectedSourceId ?? ""}
          onChange={(event) => onSourceChange(event.target.value)}
          disabled={!sources.length}
        >
          {sources.length ? (
            sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))
          ) : (
            <option value="">No package sources</option>
          )}
        </Select>
        <Select
          value={kindFilter}
          onChange={(event) =>
            onKindFilterChange(
              event.target.value as MarketplacePackageKind | "all",
            )
          }
        >
          <option value="all">All package types</option>
          <option value="package">Packages</option>
          <option value="knowledge">Knowledge</option>
          <option value="agent">Agents</option>
          <option value="ability">Abilities</option>
          <option value="domain">Domains</option>
          <option value="context_block">Context blocks</option>
          <option value="mcp">MCP</option>
          <option value="routine">Routines</option>
          <option value="skill">Skills</option>
          <option value="command">Commands</option>
          <option value="hook">Hooks</option>
          <option value="script_tool">Script tools</option>
          <option value="plugin">Plugins</option>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={onRefresh}
          disabled={!selectedSourceId}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingGrid />
      ) : packages.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packages.map((pkg) => (
            <PackageCatalogCard
              key={pkg.id}
              pkg={pkg}
              installed={isPackageInstalled(
                pkg,
                selectedSource,
                installedKeys,
                installedSelectors,
              )}
              install={
                selectedSource
                  ? installedInstallsByKey.get(
                      packageInstallKey(selectedSource.id, pkg.source_path),
                    )
                  : undefined
              }
              busyKey={busyKey}
              installProgress={installProgress[pkg.id]}
              onOpen={onOpen}
              onOpenDetails={onOpenDetails}
              onInstall={onInstall}
              onUninstallInstall={onUninstallInstall}
            />
          ))}
        </div>
      ) : (
        <EmptyState text="No packages found for this source." />
      )}
    </div>
  );
}

function PackageCatalogCard({
  pkg,
  installed,
  install,
  busyKey,
  installProgress,
  onOpen,
  onOpenDetails,
  onInstall,
  onUninstallInstall,
}: {
  pkg: MarketplacePackage;
  installed: boolean;
  install?: PackageInstall;
  busyKey: string | null;
  installProgress?: PackageInstallProgress;
  onOpen: (pkg: MarketplacePackage) => void;
  onOpenDetails: (pkg: MarketplacePackage) => void;
  onInstall: (pkg: MarketplacePackage) => void;
  onUninstallInstall: (install: PackageInstall) => void;
}) {
  const isSkillLike = pkg.kind === "plugin" || pkg.kind === "skill";
  const showCatalogMetadata = pkg.kind !== "plugin";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(pkg)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(pkg);
        }
      }}
      className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-deep-space-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-deep-space-blue-700"
    >
      <AssetCard
        icon={packageKindIcon(pkg.kind)}
        title={pkg.display_name ?? pkg.name}
        subtitle={packageSelector(pkg) ?? pkg.source_path}
        description={pkg.description}
        badges={
          showCatalogMetadata
            ? [
                pkg.kind.replace("_", " "),
                sourceLabel(pkg.metadata),
                pkg.latest_version,
              ]
            : []
        }
        updatedAt={pkg.synced_at}
        framed={false}
        showMetadata={showCatalogMetadata}
        statusLabel={installed ? "Installed" : "Available"}
      />
      <div className="mt-auto" onClick={(event) => event.stopPropagation()}>
        <Button
          size="sm"
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => (isSkillLike ? onOpen(pkg) : onOpenDetails(pkg))}
          isLoading={busyKey === `review:${pkg.id}`}
        >
          <BookOpen className="h-4 w-4" />
          {isSkillLike ? "View" : "Details"}
        </Button>
        {!installed ? (
          <>
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() => onInstall(pkg)}
              isLoading={busyKey === `install:${pkg.id}`}
            >
              <Download className="h-4 w-4" />
              Install
            </Button>
            {busyKey === `install:${pkg.id}` && installProgress ? (
              <PackageInstallProgressBar
                progress={installProgress}
                className="mt-2"
              />
            ) : null}
          </>
        ) : install ? (
          <Button
            size="sm"
            variant="danger"
            className="mt-2 w-full"
            onClick={() => onUninstallInstall(install)}
            isLoading={busyKey === `uninstall-install:${install.id}`}
          >
            <Trash2 className="h-4 w-4" />
            Uninstall
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PackageDetailsModal({
  pkg,
  source,
  installed,
  busyKey,
  onClose,
  onInstall,
}: {
  pkg: MarketplacePackage | null;
  source: PackageSource | null;
  installed: boolean;
  busyKey: string | null;
  onClose: () => void;
  onInstall: () => void;
}) {
  const [current, setCurrent] = useState<MarketplacePackage | null>(pkg);
  const [history, setHistory] = useState<MarketplacePackage[]>([]);
  const [details, setDetails] = useState<LoadedPackageDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] =
    useState<PackageDetailsTab>("metadata");

  useEffect(() => {
    if (!current || !source || source.adapter !== "nenjo_packages") {
      return;
    }
    let cancelled = false;
    fetchPackageDetails(source, current)
      .then((loaded) => {
        if (!cancelled) {
          setDetails(loaded);
          setDetailsError(null);
          setActiveDetailsTab(loaded.readme ? "readme" : "metadata");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetails(null);
          setActiveDetailsTab("metadata");
          setDetailsError(
            err instanceof Error
              ? err.message
              : "Failed to load package details",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [current, source]);

  const activePkg = current ?? pkg;
  const activeKind = details?.descriptor?.type ?? activePkg?.kind ?? null;
  const sourceInfo = source ? sourceGitHubInfo(source) : null;
  const sourceOwner = activePkg
    ? (metadataText(activePkg.metadata, ["source", "owner"]) ??
      sourceInfo?.owner ??
      null)
    : null;
  const sourceRepo = activePkg
    ? (metadataText(activePkg.metadata, ["source", "repo"]) ??
      sourceInfo?.repo ??
      null)
    : null;
  const ref = activePkg
    ? (metadataText(activePkg.metadata, ["version", "ref"]) ??
      metadataText(activePkg.metadata, ["version", "requested_ref"]) ??
      sourceInfo?.ref ??
      null)
    : null;
  const sha = activePkg
    ? (metadataText(activePkg.metadata, ["version", "resolved_commit_sha"]) ??
      sourceInfo?.resolvedCommitSha ??
      null)
    : null;
  const gitRepoUrl =
    (source ? metadataText(source.metadata, ["source", "url"]) : null) ??
    (sourceOwner && sourceRepo
      ? `https://github.com/${sourceOwner}/${sourceRepo}`
      : null);
  const refDetail = ref && sha ? `${ref}  ${sha.slice(0, 7)}` : ref;
  const packageInstalled = activePkg
    ? installed && activePkg.id === pkg?.id
    : installed;
  const displayedKind =
    details && details.moduleGroups.length
      ? combinedPackageKind(
          details.moduleGroups.flatMap((group) =>
            group.modules.map((module) => module.kind),
          ),
        )
      : (details?.descriptor?.type ?? activePkg?.kind ?? null);

  const handleOpenDependency = (dependency: PackageDependency) => {
    if (!activePkg) return;
    const depName =
      dependency.name ||
      dependency.path.split("/").slice(-2, -1)[0] ||
      dependency.path.split("/").pop() ||
      "package";
    setHistory((items) => [...items, activePkg]);
    setDetails(null);
    setDetailsError(null);
    setActiveDetailsTab("metadata");
    setCurrent({
      id: `${source?.id ?? "source"}:${dependency.path}`,
      kind: "package",
      name: depName,
      display_name: depName.replace(/[-_]/g, " "),
      description: null,
      latest_version: dependency.version ?? null,
      synced_at: null,
      source_path: dependency.path,
      metadata: {
        source: {
          provider: "github",
          owner: sourceOwner,
          repo: sourceRepo,
          path: dependency.path,
          package: depName,
        },
        version: {
          ref,
          resolved_commit_sha: sha,
          package_version: dependency.version ?? null,
        },
      },
    });
  };

  const handleBack = () => {
    setHistory((items) => {
      const next = [...items];
      const previous = next.pop() ?? null;
      setDetails(null);
      setDetailsError(null);
      setActiveDetailsTab("metadata");
      setCurrent(previous);
      return next;
    });
  };

  const detailTabs = details
    ? [
        ...(details.readme
          ? [
              {
                id: "readme",
                label: "README",
                icon: <BookOpen className="h-4 w-4" />,
              },
            ]
          : []),
        {
          id: "metadata",
          label: "Metadata",
          count: details.dependencies.length,
          icon: <Braces className="h-4 w-4" />,
        },
      ]
    : [];
  const visibleDetailsTab = details?.readme ? activeDetailsTab : "metadata";

  return (
    <Modal
      open={Boolean(activePkg)}
      onClose={onClose}
      title={
        activePkg ? `${activePkg.display_name ?? activePkg.name}` : "Package"
      }
      className="!w-[96vw] !max-w-6xl"
    >
      {activePkg ? (
        <div className="space-y-5">
          {history.length ? (
            <Button size="sm" variant="secondary" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {(displayedKind ?? activePkg.kind).replace("_", " ")}
                  </Badge>
                  <Badge>{packageInstalled ? "Installed" : "Available"}</Badge>
                  {(details?.descriptor?.version ??
                  activePkg.latest_version) ? (
                    <Badge>
                      {details?.descriptor?.version ?? activePkg.latest_version}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {activePkg.description || "No description available."}
                </p>
              </div>
            </div>
          </div>

          {!details && !detailsError && source?.adapter === "nenjo_packages" ? (
            <EmptyState text="Loading package files..." />
          ) : null}
          {detailsError ? <Notice tone="error">{detailsError}</Notice> : null}
          {details ? (
            <div className="space-y-4">
              {details.readme ? (
                <Tabs
                  tabs={detailTabs}
                  activeTab={visibleDetailsTab}
                  onChange={(id) => setActiveDetailsTab(id as PackageDetailsTab)}
                  indicatorAnimation="slide"
                />
              ) : null}
              {visibleDetailsTab === "readme" && details.readme ? (
                <PackageReadmePanel readme={details.readme} />
              ) : (
                <PackageMetadataPanel
                  activeKind={activeKind}
                  activePkg={activePkg}
                  details={details}
                  displayedKind={displayedKind}
                  gitRepoUrl={gitRepoUrl}
                  onOpenDependency={handleOpenDependency}
                  refDetail={refDetail}
                  source={source}
                  sourceOwner={sourceOwner}
                  sourceRepo={sourceRepo}
                />
              )}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {!packageInstalled && activePkg.id === pkg?.id ? (
              <Button
                onClick={onInstall}
                isLoading={busyKey === `install:${pkg.id}`}
              >
                <Download className="h-4 w-4" />
                Install
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function PackageReadmePanel({ readme }: { readme: string }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
          README
        </h3>
      </div>
      <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] dark:prose-code:bg-gray-800 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-slate-800 prose-pre:bg-slate-950 prose-pre:p-4 prose-pre:text-sm prose-pre:text-gray-100 dark:prose-pre:bg-slate-950 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-table:text-sm prose-th:bg-gray-100 prose-th:px-3 prose-th:py-2 dark:prose-th:bg-gray-800 prose-td:border-t prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 dark:prose-td:border-gray-700 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
      </div>
    </section>
  );
}

function PackageMetadataPanel({
  activeKind,
  activePkg,
  details,
  displayedKind,
  gitRepoUrl,
  onOpenDependency,
  refDetail,
  source,
  sourceOwner,
  sourceRepo,
}: {
  activeKind: MarketplacePackageKind | string | null;
  activePkg: MarketplacePackage;
  details: LoadedPackageDetails;
  displayedKind: MarketplacePackageKind | string | null;
  gitRepoUrl: string | null;
  onOpenDependency: (dependency: PackageDependency) => void;
  refDetail: string | null;
  source: PackageSource | null;
  sourceOwner: string | null;
  sourceRepo: string | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="space-y-4">
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
              Source Details
            </h3>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {(displayedKind ?? activeKind) === "knowledge" ||
            activeKind === "knowledge_pack" ||
            activeKind === "context_block" ? (
              <PackageDetail
                label="Selector"
                value={packageSelector(activePkg)}
                mono
              />
            ) : null}
            <PackageDetail label="Path" value={activePkg.source_path} mono />
            <PackageDetail
              label="Source"
              value={
                source?.name ??
                (sourceOwner && sourceRepo ? `${sourceOwner}/${sourceRepo}` : null)
              }
            />
            <PackageDetail label="Git repo" value={gitRepoUrl} mono />
            <PackageDetail
              label="Adapter"
              value={
                source?.adapter?.replace("_", " ") ??
                metadataText(activePkg.metadata, ["adapter"])
              }
            />
            <PackageDetail label="Ref" value={refDetail} mono />
          </dl>
        </section>
        <PackageFilePanel
          title="Package"
          icon={<Package className="h-4 w-4" />}
          path={details.descriptorPath}
          value={details.descriptor as Record<string, unknown> | null}
          showRaw={false}
        />
        {details.moduleGroups.length ? (
          details.moduleGroups.map((group) => (
            <PackageModuleGroupPanel key={group.label} group={group} />
          ))
        ) : (
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Braces className="h-4 w-4" />
              No module manifests could be loaded.
            </div>
          </section>
        )}
      </main>
      <aside className="space-y-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
            Dependencies
          </h3>
          <span className="text-xs text-gray-400">
            {details.dependencies.length}
          </span>
        </div>
        {details.dependencies.length ? (
          details.dependencies.map((dependency) => (
            <button
              key={`${dependency.name}:${dependency.path}`}
              type="button"
              onClick={() => onOpenDependency(dependency)}
              className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-deep-space-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-deep-space-blue-700"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-gray-500">
                  {packageKindIcon("package", "h-4 w-4")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                    {dependency.name}
                  </div>
                  <div className="break-words font-mono text-xs text-gray-900 dark:text-gray-100">
                    {dependency.path}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                    Package dependency
                  </div>
                </div>
              </div>
              {dependency.version ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {dependency.version}
                </div>
              ) : null}
            </button>
          ))
        ) : (
          <EmptyState text="No dependencies." />
        )}
      </aside>
    </div>
  );
}

function PackageDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm text-gray-900 dark:text-gray-100 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value || "-"}
      </dd>
    </div>
  );
}

function PackageModuleGroupPanel({ group }: { group: LoadedPackageModuleGroup }) {
  return (
    <section className="space-y-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Network className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
          {group.label}
        </h3>
        <span className="text-xs text-gray-400">
          {group.modules.length} module{group.modules.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-3">
        {group.modules.map((module, index) => (
          <PackageFilePanel
            key={`${module.path}:${index}`}
            title={module.title}
            icon={packageKindIcon(module.kind, "h-4 w-4")}
            path={module.path}
            value={module.value}
            manifestType={module.kind}
            allowRawToggle
          />
        ))}
      </div>
    </section>
  );
}

function PackageFilePanel({
  title,
  icon,
  path,
  value,
  showRaw = true,
  allowRawToggle = false,
  manifestType,
}: {
  title: string;
  icon: React.ReactNode;
  path: string | null;
  value: Record<string, unknown> | null;
  showRaw?: boolean;
  allowRawToggle?: boolean;
  manifestType?: MarketplacePackageKind | string | null;
}) {
  const [view, setView] = useState<"parsed" | "raw">("parsed");
  const showRawView = showRaw && (!allowRawToggle || view === "raw");
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-gray-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
          {title}
        </h3>
        {path ? (
          <span className="break-all font-mono text-xs text-gray-400">
            {path}
          </span>
        ) : null}
        {allowRawToggle ? (
          <div className="ml-auto flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {(["parsed", "raw"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  view === item
                    ? "bg-sunflower-gold-500 text-gray-950"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {value && (!allowRawToggle || view === "parsed") ? (
        manifestType ? (
          <ManifestRichView type={manifestType} value={value} />
        ) : (
          <PackageRichSummary value={value} />
        )
      ) : null}
      {showRawView ? (
        <pre className="mt-4 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
          {JSON.stringify(value ?? {}, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function PackageRichSummary({ value }: { value: Record<string, unknown> }) {
  const manifestValue = value.manifest;
  const manifest =
    typeof manifestValue === "object" &&
    manifestValue !== null &&
    !Array.isArray(manifestValue)
      ? (manifestValue as Record<string, unknown>)
      : value;
  const rows = [
    ["Name", valueString(value, "name")],
    ["Version", valueString(value, "version")],
    ["Display", valueString(manifest, "display_name")],
    ["Description", valueString(manifest, "description")],
  ].filter(([, item]) => item);
  if (!rows.length) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, item]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
            {item}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ManifestRichView({
  type,
  value,
}: {
  type: MarketplacePackageKind | string;
  value: Record<string, unknown>;
}) {
  const manifest = nestedRecord(value, "manifest") ?? value;
  const rows = manifestRows(type, value, manifest);
  return (
    <div className="space-y-4">
      {rows.length ? (
        <FieldGrid rows={rows} />
      ) : (
        <EmptyState text="No parsed manifest fields." />
      )}
      {type === "knowledge" ? <KnowledgeManifestView value={value} /> : null}
      {type === "agent" ? (
        <>
          <ScopesView value={manifest} />
          <MemoryProfileView value={manifest} />
          <AssignmentsView value={manifest} />
          <PromptPreview value={manifest} />
        </>
      ) : null}
      {type === "domain" ? (
        <>
          <ScopesView value={manifest} />
          <MemoryProfileView value={manifest} />
          <AssignmentsView value={manifest} />
          <PromptPreview value={manifest} />
        </>
      ) : null}
      {type === "ability" ? (
        <>
          <ScopesView value={manifest} />
          <PromptPreview value={manifest} />
        </>
      ) : null}
      {type === "context_block" ? (
        <PromptPreview value={manifest} renderMarkdown />
      ) : null}
    </div>
  );
}

function manifestRows(
  type: string,
  root: Record<string, unknown>,
  manifest: Record<string, unknown>,
): Array<[string, string]> {
  const base: Array<[string, string | null]> = [
    ["Name", valueString(manifest, "name") ?? valueString(root, "name")],
    ["Display", valueString(manifest, "display_name")],
    ["Description", valueString(manifest, "description")],
  ];
  if (type === "knowledge") {
    base.push(
      ["Version", valueString(root, "version")],
      ["Slug", valueString(root, "slug")],
      ["Root URI", valueString(root, "root_uri")],
      ["Docs", String(arrayValue(manifest, "docs").length)],
    );
  }
  if (type === "agent") {
    base.push(["Color", valueString(manifest, "color")]);
  }
  if (type === "ability") {
    base.push(
      ["Tool", valueString(manifest, "tool_name")],
      ["Activation", valueString(manifest, "activation_condition")],
    );
  }
  if (type === "domain") {
    base.push(["Command", valueString(manifest, "command")]);
  }
  if (type === "command") {
    base.push(
      ["Command", valueString(manifest, "command")],
      ["Entry", valueString(manifest, "entry_path")],
    );
  }
  if (type === "hook") {
    base.push(
      ["Event", valueString(manifest, "event")],
      ["Matcher", valueString(manifest, "matcher")],
      ["Type", valueString(manifest, "type")],
    );
  }
  if (type === "script_tool") {
    base.push(
      ["Category", valueString(manifest, "category")],
      ["Root", valueString(manifest, "root_path")],
    );
  }
  return base.filter(([, item]) => item && item !== "0") as Array<
    [string, string]
  >;
}

function FieldGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, item]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
            {item}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function KnowledgeManifestView({ value }: { value: Record<string, unknown> }) {
  const manifest = nestedRecord(value, "manifest") ?? value;
  const docs = arrayValue(manifest, "docs").filter(isRecord);
  if (!docs.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Documents
      </h4>
      <div className="max-h-72 space-y-2 overflow-auto pr-1">
        {docs.map((doc, index) => (
          <div
            key={valueString(doc, "id") ?? index}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="text-sm font-medium text-gray-950 dark:text-gray-50">
              {valueString(doc, "title") ??
                valueString(doc, "id") ??
                "Document"}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">
              {valueString(doc, "path")}
            </div>
            {valueString(doc, "summary") ? (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {valueString(doc, "summary")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AssignmentsView({ value }: { value: Record<string, unknown> }) {
  const assignments = nestedRecord(value, "assignments");
  if (!assignments) return null;
  const groups = ["abilities", "domains", "mcp_servers", "script_tools"]
    .map((key) => [key, arrayValue(assignments, key)] as const)
    .filter(([, items]) => items.length);
  if (!groups.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Assignments
      </h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {groups.map(([key, items]) => (
          <div
            key={key}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {key.replace("_", " ")}
            </div>
            <div className="mt-2 space-y-1">
              {items.map((item, index) => (
                <div
                  key={`${key}-${index}`}
                  className="break-all font-mono text-xs text-gray-800 dark:text-gray-200"
                >
                  {String(item)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScopesView({ value }: { value: Record<string, unknown> }) {
  const scopes = arrayValue(value, "platform_scopes").filter(
    (scope): scope is string =>
      typeof scope === "string" && scope.trim().length > 0,
  );
  if (!scopes.length) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Scopes
        </h4>
        <span className="text-xs text-gray-400">{scopes.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <span
            key={scope}
            className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {scope}
          </span>
        ))}
      </div>
    </section>
  );
}

function MemoryProfileView({ value }: { value: Record<string, unknown> }) {
  const profile =
    nestedRecord(value, "memory_profile") ??
    nestedRecord(nestedRecord(value, "prompt_config") ?? {}, "memory_profile");
  if (!profile) return null;
  const groups = Object.entries(profile)
    .map(
      ([key, item]) =>
        [
          key,
          Array.isArray(item)
            ? item.filter(
                (entry): entry is string =>
                  typeof entry === "string" && entry.trim().length > 0,
              )
            : [],
        ] as const,
    )
    .filter(([, items]) => items.length);
  if (!groups.length) return null;
  const count = groups.reduce((total, [, items]) => total + items.length, 0);
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Memory Profile
        </h4>
        <span className="text-xs text-gray-400">{count}</span>
      </div>
      <div className="space-y-2">
        {groups.map(([key, items]) => (
          <div
            key={key}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {key.replace("_", " ")}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {items.map((item) => (
                <span
                  key={item}
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PromptPreview({
  value,
  renderMarkdown = false,
}: {
  value: Record<string, unknown>;
  renderMarkdown?: boolean;
}) {
  const prompt = nestedRecord(value, "prompt_config");
  const template = valueString(value, "template");
  if (!prompt && !template) return null;
  const promptEntries = prompt
    ? Object.entries(prompt).filter(
        ([, item]) => typeof item === "string" && item.trim(),
      )
    : [["template", template ?? ""]];
  const templateEntries = prompt
    ? Object.entries(nestedRecord(prompt, "templates") ?? {})
        .filter(([, item]) => typeof item === "string" && item.trim())
        .map(([key, item]) => [`templates.${key}`, item] as const)
    : [];
  const entries = [...promptEntries, ...templateEntries];
  if (!entries.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Prompts
      </h4>
      {entries.map(([key, item]) => (
        <details
          key={key}
          className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
        >
          <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100">
            {key.replace("_", " ")}
          </summary>
          {renderMarkdown ? (
            <div className="prose prose-sm mt-3 max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {String(item)}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {String(item)}
            </pre>
          )}
        </details>
      ))}
    </section>
  );
}

function valueString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item : null;
}

function nestedRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const item = value[key];
  return isRecord(item) ? item : null;
}

function arrayValue(value: Record<string, unknown>, key: string): unknown[] {
  const item = value[key];
  return Array.isArray(item) ? item : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function SkillReviewModal({
  review,
  busyKey,
  onClose,
  onEnvNamesChange,
  onSelectedSkillChange,
  onInstall,
}: {
  review: PackageReview | null;
  busyKey: string | null;
  onClose: () => void;
  onEnvNamesChange: (value: string) => void;
  onSelectedSkillChange: (index: number) => void;
  onInstall: () => void;
}) {
  const skill =
    review?.plugin_request.skills[review.selectedSkillIndex] ??
    review?.plugin_request.skills[0] ??
    null;
  const renderedSkill = skill ? splitFrontmatter(skill.content) : null;
  const metadataName = renderedSkill
    ? frontmatterValue(renderedSkill.frontmatter, "name")
    : null;
  const metadataDescription = renderedSkill
    ? frontmatterValue(renderedSkill.frontmatter, "description")
    : null;
  const metadataTools = renderedSkill
    ? frontmatterValue(renderedSkill.frontmatter, "allowed-tools")
    : null;
  const extraMetadata = renderedSkill
    ? frontmatterEntriesWithout(renderedSkill.frontmatter, [
        "name",
        "description",
        "allowed-tools",
      ])
    : [];
  return (
    <Modal
      open={Boolean(review)}
      onClose={onClose}
      title={review ? `${review.pkg.display_name ?? review.pkg.name}` : "Skill"}
      className="!w-[96vw] !max-w-7xl"
    >
      {review && skill ? (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Selector
              </div>
              <div className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
                {packageSelector(review.pkg) ?? review.pkg.source_path}
              </div>
            </div>
            <div className="space-y-1">
              {review.plugin_request.skills.map((item, index) => (
                <button
                  key={item.skill_path}
                  type="button"
                  onClick={() => onSelectedSkillChange(index)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    index === review.selectedSkillIndex
                      ? "border-deep-space-blue-500 bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {item.display_name ?? item.name}
                </button>
              ))}
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allowed env vars
              </span>
              <Textarea
                value={review.envNamesText}
                onChange={(event) => onEnvNamesChange(event.target.value)}
                placeholder="XAI_API_KEY&#10;X_BEARER_TOKEN"
                rows={5}
              />
            </label>
          </aside>
          <main className="min-w-0 space-y-3">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {skill.display_name ?? skill.name}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">
                {skill.skill_path}
              </div>
            </div>
            <div className="max-h-[68vh] overflow-auto rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              {renderedSkill?.frontmatter.length ? (
                <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Skill metadata
                    </span>
                    {metadataName ? (
                      <span className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                        {metadataName}
                      </span>
                    ) : null}
                  </div>
                  {metadataDescription ? (
                    <p className="max-w-4xl text-sm leading-6 text-gray-700 dark:text-gray-300">
                      {metadataDescription}
                    </p>
                  ) : null}
                  {metadataTools ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Allowed tools
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metadataTools
                          .split(",")
                          .map((tool) => tool.trim())
                          .filter(Boolean)
                          .map((tool) => (
                            <span
                              key={tool}
                              className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"
                            >
                              {tool}
                            </span>
                          ))}
                      </div>
                    </div>
                  ) : null}
                  {extraMetadata.length ? (
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {extraMetadata.map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {humanizeFrontmatterKey(key)}
                          </dt>
                          <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
                            {value || "-"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : null}
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] dark:prose-code:bg-gray-800 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-slate-800 prose-pre:bg-slate-950 prose-pre:p-4 prose-pre:text-sm prose-pre:text-gray-100 dark:prose-pre:bg-slate-950 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-table:text-sm prose-th:bg-gray-100 prose-th:px-3 prose-th:py-2 dark:prose-th:bg-gray-800 prose-td:border-t prose-td:border-gray-200 prose-td:px-3 prose-td:py-2 dark:prose-td:border-gray-700 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {renderedSkill?.body ?? skill.content}
                </ReactMarkdown>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={onInstall}
                isLoading={busyKey === `install:${review.pkg.id}`}
              >
                <Download className="h-4 w-4" />
                Install
              </Button>
            </div>
          </main>
        </div>
      ) : null}
    </Modal>
  );
}

function SkillEnvModal({
  editor,
  busyKey,
  onClose,
  onChange,
  onSave,
}: {
  editor: { ability: Ability; envNamesText: string } | null;
  busyKey: string | null;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      title={editor ? `Skill env: ${editor.ability.name}` : "Skill env"}
      className="!w-[min(92vw,560px)] !max-w-xl"
    >
      {editor ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Selector
            </div>
            <div className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {metadataText(editor.ability.metadata, ["install", "selector"]) ??
                editor.ability.name}
            </div>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allowed env vars
            </span>
            <Textarea
              value={editor.envNamesText}
              onChange={(event) => onChange(event.target.value)}
              placeholder="XAI_API_KEY&#10;X_BEARER_TOKEN"
              rows={8}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              isLoading={busyKey === `skill-env:${editor.ability.id}`}
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function SourcesTab(props: {
  sources: PackageSource[];
  isLoading: boolean;
  onRefresh: (source: PackageSource) => void;
  onDelete: (source: PackageSource) => void;
  busyKey: string | null;
  sourceAdapter: PackageSourceAdapter;
  sourceName: string;
  sourceRepoUrl: string;
  sourceRef: string;
  sourceManifestPath: string;
  onSourceNameChange: (value: string) => void;
  onSourceRepoUrlChange: (value: string) => void;
  onSourceRefChange: (value: string) => void;
  onSourceManifestPathChange: (value: string) => void;
  onSourceAdapterChange: (value: PackageSourceAdapter) => void;
  onCreateSource: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="space-y-3">
        {props.isLoading ? (
          <LoadingGrid />
        ) : props.sources.length ? (
          props.sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              busyKey={props.busyKey}
              onRefresh={props.onRefresh}
              onDelete={props.onDelete}
            />
          ))
        ) : (
          <EmptyState text="No package sources configured." />
        )}
      </main>
      <aside className="h-fit rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
            Import Public Packages
          </h2>
        </div>
        <div className="mt-4 space-y-3">
          <Select
            value={props.sourceAdapter}
            onChange={(event) =>
              props.onSourceAdapterChange(
                event.target.value as PackageSourceAdapter,
              )
            }
          >
            <option value="nenjo_packages">Nenjo packages</option>
            <option value="claude_marketplace">Claude plugins</option>
          </Select>
          <Input
            value={props.sourceName}
            onChange={(event) => props.onSourceNameChange(event.target.value)}
            placeholder="Display name"
          />
          <Input
            value={props.sourceRepoUrl}
            onChange={(event) =>
              props.onSourceRepoUrlChange(event.target.value)
            }
            placeholder="https://github.com/owner/repo"
          />
          <Input
            value={props.sourceRef}
            onChange={(event) => props.onSourceRefChange(event.target.value)}
            placeholder="Branch, tag, or SHA"
          />
          <Input
            value={props.sourceManifestPath}
            onChange={(event) =>
              props.onSourceManifestPathChange(event.target.value)
            }
            placeholder={
              props.sourceAdapter === "claude_marketplace"
                ? CLAUDE_PLUGIN_MANIFEST_PATH
                : "packages.yaml"
            }
          />
          <Button
            size="sm"
            className="w-full"
            onClick={props.onCreateSource}
            isLoading={props.busyKey === "create-source"}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </aside>
    </div>
  );
}

function SourceCard(props: {
  source: PackageSource;
  busyKey: string | null;
  onRefresh: (source: PackageSource) => void;
  onDelete: (source: PackageSource) => void;
}) {
  const licenseSpdx =
    metadataText(props.source.metadata, ["license", "spdx_id"]) ?? "Unknown";
  const licensePolicy = metadataText(props.source.metadata, [
    "license",
    "policy",
  ]);
  const licenseReason = metadataText(props.source.metadata, [
    "license",
    "reason",
  ]);
  const requiresReview =
    metadataBool(props.source.metadata, ["license", "requires_confirmation"]) ??
    false;
  const sourceInfo = sourceGitHubInfo(props.source);
  const sourceLabel = sourceInfo
    ? `${sourceInfo.owner}/${sourceInfo.repo}`
    : (metadataText(props.source.metadata, ["source", "url"]) ??
      "Custom package source");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-gray-950 dark:text-gray-50">
            {props.source.name}
          </h3>
          <Badge>{props.source.source_type}</Badge>
          <Badge>{props.source.adapter.replace("_", " ")}</Badge>
          <Badge>
            {licensePolicy ? `${licenseSpdx} ${licensePolicy}` : licenseSpdx}
          </Badge>
          {requiresReview ? <Badge>review required</Badge> : null}
        </div>
        <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
          {sourceLabel}
        </p>
        {licenseReason ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {licenseReason}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => props.onRefresh(props.source)}
          isLoading={props.busyKey === `sync:${props.source.id}`}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => props.onDelete(props.source)}
          isLoading={props.busyKey === `delete-source:${props.source.id}`}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function ImportsTab(props: {
  mode: ImportMode;
  owner: string;
  repo: string;
  path: string;
  refValue: string;
  name: string;
  onModeChange: (mode: ImportMode) => void;
  onOwnerChange: (value: string) => void;
  onRepoChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onRefChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Braces className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">
          Direct Worker Import
        </h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Select
          value={props.mode}
          onChange={(event) =>
            props.onModeChange(event.target.value as ImportMode)
          }
        >
          <option value="knowledge_pack">Knowledge pack</option>
          <option value="skill">Skill</option>
        </Select>
        <Input
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder="Package name"
        />
        <Input
          value={props.owner}
          onChange={(event) => props.onOwnerChange(event.target.value)}
          placeholder="GitHub owner"
        />
        <Input
          value={props.repo}
          onChange={(event) => props.onRepoChange(event.target.value)}
          placeholder="GitHub repo"
        />
        <Input
          value={props.path}
          onChange={(event) => props.onPathChange(event.target.value)}
          placeholder="Path in repo"
        />
        <Input
          value={props.refValue}
          onChange={(event) => props.onRefChange(event.target.value)}
          placeholder="Ref, tag, or SHA"
        />
      </div>
      <Button
        className="mt-4"
        onClick={props.onImport}
        isLoading={props.importing}
      >
        <Download className="h-4 w-4" />
        Import
      </Button>
    </div>
  );
}

function CollapsibleAssetSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-gray-400">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {title}
        </h2>
        <span className="text-xs text-gray-400">{count}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function AssetCard({
  icon,
  title,
  subtitle,
  description,
  badges,
  updatedAt,
  actions,
  children,
  onClick,
  isBusy = false,
  framed = true,
  statusLabel = "Installed",
  showMetadata = true,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string | null | undefined;
  badges: Array<string | null | undefined>;
  updatedAt: string | null | undefined;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  isBusy?: boolean;
  framed?: boolean;
  statusLabel?: string;
  showMetadata?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300">
          {icon}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" />
          {statusLabel}
        </span>
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">
          {title}
        </h3>
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600 dark:text-gray-300">
          {description || "No description available."}
        </p>
      </div>
      {showMetadata ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {badges.filter(Boolean).map((badge) => (
            <Badge key={badge}>{badge}</Badge>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
            <Clock3 className="h-3.5 w-3.5" />
            {isBusy ? "Loading..." : formatLibraryDate(updatedAt)}
          </span>
        </div>
      ) : null}
      {children ? (
        <div
          className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
      {actions ? (
        <div
          className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </>
  );
  if (!framed) return <div>{body}</div>;
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        className="h-full min-h-44 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xs transition-colors hover:border-deep-space-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-deep-space-blue-700"
      >
        {body}
      </div>
    );
  }
  return (
    <div className="h-full min-h-44 rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      {body}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
      {text}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div
          key={item}
          className="h-44 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
        />
      ))}
    </div>
  );
}
