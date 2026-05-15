"use client";

import { useEffect, useMemo, useState } from "react";
import matter from "gray-matter";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Braces,
  Clock3,
  Download,
  GitBranch,
  PlugZap,
  Plus,
  RefreshCw,
  Sparkles,
  ShieldCheck,
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
import {
  useAbilities,
  useKnowledgePacks,
  useMarketplaceSources,
  useMcpServers,
  useTabParam,
} from "@/lib/hooks";
import {
  createKnowledgePack,
  createMarketplaceSource,
  installClaudePlugin,
  installKnowledgePack,
  installSkill,
  deleteMarketplaceSource,
  uninstallPluginInstall,
  uninstallSkillAbility,
  updateSkillRuntimeEnvNames,
  updateMarketplaceSource,
} from "@/lib/api";
import type {
  Ability,
  ClaudeMcpServerConfig,
  InstallClaudePluginRequest,
  KnowledgePack,
  MarketplaceSource,
  McpServer,
} from "@/lib/types";

type LibraryTab = "installed" | "marketplace" | "sources" | "imports";
type ImportMode = "knowledge_pack" | "skill" | "claude_plugin";
type MarketplacePackageKind = "knowledge_pack" | "skill" | "plugin";

const LIBRARY_TABS: LibraryTab[] = ["installed", "marketplace", "sources", "imports"];

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

interface ClaudeMarketplaceManifest {
  plugins?: Array<{
    name: string;
    version?: string | null;
    description?: string | null;
    source: string;
  }>;
}

interface GithubTreeResponse {
  tree?: Array<{ path: string; type: string }>;
}

interface GithubCommitResponse {
  sha: string;
}

interface ClaudePluginManifest {
  name?: string | null;
  version?: string | null;
  description?: string | null;
  mcpServers?: Record<string, ClaudeMcpServerConfig>;
  mcp_servers?: Record<string, ClaudeMcpServerConfig>;
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
  source: MarketplaceSource | null;
  plugin_request: Omit<InstallClaudePluginRequest, "skills"> & { skills: SkillReview[] };
  envNamesText: string;
  selectedSkillIndex: number;
}

function formatLibraryDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function metadataText(metadata: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = metadata;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function sourceLabel(metadata: Record<string, unknown>): string {
  const owner = metadataText(metadata, ["source", "owner"]);
  const repo = metadataText(metadata, ["source", "repo"]);
  return owner && repo ? `${owner}/${repo}` : "Platform";
}

function packageSelector(pkg: MarketplacePackage): string {
  const explicit = metadataText(pkg.metadata, ["install", "selector"]);
  if (explicit) return explicit;
  const owner = metadataText(pkg.metadata, ["source", "owner"]);
  const repo = metadataText(pkg.metadata, ["source", "repo"]);
  const packageName = metadataText(pkg.metadata, ["source", "package"]) ?? pkg.name;
  return owner && repo ? `repo://${owner}/${repo}/${packageName}` : `repo://${pkg.name}`;
}

function sourceGitHubInfo(source: MarketplaceSource): {
  owner: string;
  repo: string;
  ref: string;
  resolvedCommitSha: string | null;
  marketplacePath: string;
} | null {
  const owner = metadataText(source.metadata, ["owner"]);
  const repo = metadataText(source.metadata, ["repo"]);
  if (!owner || !repo) return null;
  return {
    owner,
    repo,
    ref: metadataText(source.metadata, ["ref"]) ?? "main",
    resolvedCommitSha: metadataText(source.metadata, ["resolved_commit_sha"]),
    marketplacePath: metadataText(source.metadata, ["marketplace_path"]) ?? ".claude-plugin/marketplace.json",
  };
}

function sourceFetchRef(info: { ref: string; resolvedCommitSha: string | null }): string {
  return info.resolvedCommitSha ?? info.ref;
}

function githubRawUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.replace(/^\/+/, "")}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function resolveGitHubCommitSha(owner: string, repo: string, ref: string): Promise<string> {
  const commit = await fetchJson<GithubCommitResponse>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  return commit.sha;
}

async function fetchClaudeMarketplacePackages(source: MarketplaceSource): Promise<MarketplacePackage[]> {
  const info = sourceGitHubInfo(source);
  if (!info) return [];
  const manifest = await fetchJson<ClaudeMarketplaceManifest>(
    githubRawUrl(info.owner, info.repo, sourceFetchRef(info), info.marketplacePath),
  );
  return (manifest.plugins ?? []).map((plugin) => {
    const path = plugin.source.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
    return {
      id: `${source.id}:${path || plugin.name}`,
      kind: "plugin",
      name: plugin.name,
      display_name: plugin.name,
      description: plugin.description ?? null,
      latest_version: plugin.version ?? null,
      synced_at: null,
      source_path: path,
      metadata: {
        adapter: "claude_plugin",
        source: {
          provider: "github",
          owner: info.owner,
          repo: info.repo,
          path,
          package: plugin.name,
        },
        version: {
          ref: info.ref,
          resolved_commit_sha: info.resolvedCommitSha,
          package_version: plugin.version ?? null,
        },
      },
    };
  });
}

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchClaudePluginInstallRequest(
  source: MarketplaceSource,
  pkg: MarketplacePackage,
): Promise<PackageReview["plugin_request"]> {
  const info = sourceGitHubInfo(source);
  if (!info) throw new Error("Marketplace source is missing GitHub owner/repo metadata");
  const pluginPath = pkg.source_path;
  const pluginManifest = await fetchOptionalJson<ClaudePluginManifest>(
    githubRawUrl(info.owner, info.repo, sourceFetchRef(info), `${pluginPath}/.claude-plugin/plugin.json`),
  );
  const mcpFile = await fetchOptionalJson<{ mcpServers?: Record<string, ClaudeMcpServerConfig>; mcp_servers?: Record<string, ClaudeMcpServerConfig> }>(
    githubRawUrl(info.owner, info.repo, sourceFetchRef(info), `${pluginPath}/.mcp.json`),
  );
  const tree = await fetchJson<GithubTreeResponse>(
    `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${sourceFetchRef(info)}?recursive=1`,
  );
  const skillPrefix = `${pluginPath}/skills/`;
  const skillEntries = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(skillPrefix) && entry.path.endsWith("/SKILL.md"));
  const skills: SkillReview[] = await Promise.all(skillEntries.map(async (entry) => {
      const skillName = entry.path.replace(skillPrefix, "").replace(/\/SKILL\.md$/, "");
      return {
        name: skillName,
        display_name: skillName.replace(/[-_]/g, " "),
        description: pluginManifest?.description ?? pkg.description,
        entrypoint: entry.path.replace(`${pluginPath}/`, ""),
        skill_path: entry.path,
        content: await fetchText(githubRawUrl(info.owner, info.repo, sourceFetchRef(info), entry.path)),
      };
    }));
  const mcpServers = {
    ...(mcpFile?.mcpServers ?? {}),
    ...(mcpFile?.mcp_servers ?? {}),
    ...(pluginManifest?.mcpServers ?? {}),
    ...(pluginManifest?.mcp_servers ?? {}),
  };
  return {
    name: pkg.name,
    display_name: pluginManifest?.name ?? pkg.display_name,
    description: pluginManifest?.description ?? pkg.description,
    source: { path: pluginPath },
    version: {
      ref_: info.ref,
      resolved_commit_sha: info.resolvedCommitSha,
      package_version: pluginManifest?.version ?? pkg.latest_version,
    },
    skills,
    mcp_servers: mcpServers,
  };
}

async function fetchMarketplaceSkillReview(source: MarketplaceSource, pkg: MarketplacePackage): Promise<PackageReview["plugin_request"]> {
  const info = sourceGitHubInfo(source);
  if (!info) throw new Error("Marketplace source is missing GitHub owner/repo metadata");
  const skillPath = `${pkg.source_path.replace(/\/+$/, "")}/SKILL.md`;
  const content = await fetchText(githubRawUrl(info.owner, info.repo, sourceFetchRef(info), skillPath));
  return {
    name: pkg.name,
    display_name: pkg.display_name,
    description: pkg.description,
    source: { path: pkg.source_path },
    version: {
      ref_: info.ref,
      resolved_commit_sha: info.resolvedCommitSha,
      package_version: pkg.latest_version,
    },
    skills: [{
      name: pkg.name,
      display_name: pkg.display_name,
      description: pkg.description,
      entrypoint: "SKILL.md",
      skill_path: skillPath,
      content,
    }],
    mcp_servers: {},
  };
}

function knowledgeSelector(pack: KnowledgePack): string {
  return pack.selector ?? `platform:${pack.slug}`;
}

function parseGitHubRepoUrl(value: string): { owner: string; repo: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const shorthand = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !rawRepo) return null;
    return { owner, repo: rawRepo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export default function KnowledgePage() {
  const router = useRouter();
  const { packs, isLoading: packsLoading, mutate: mutatePacks } = useKnowledgePacks();
  const { abilities, isLoading: abilitiesLoading, mutate: mutateAbilities } = useAbilities();
  const { mcpServers, isLoading: mcpLoading, mutate: mutateMcp } = useMcpServers();
  const { sources, isLoading: sourcesLoading, mutate: mutateSources } = useMarketplaceSources();

  const [activeTab, setActiveTab] = useTabParam<LibraryTab>("installed", LIBRARY_TABS);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [kindFilter, setKindFilter] = useState<MarketplacePackageKind | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [marketplaceRefresh, setMarketplaceRefresh] = useState(0);
  const [packageReview, setPackageReview] = useState<PackageReview | null>(null);
  const [envEditor, setEnvEditor] = useState<{ ability: Ability; envNamesText: string } | null>(null);

  const [packName, setPackName] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceRepoUrl, setSourceRepoUrl] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [sourceManifestPath, setSourceManifestPath] = useState(".claude-plugin/marketplace.json");
  const [importMode, setImportMode] = useState<ImportMode>("knowledge_pack");
  const [importOwner, setImportOwner] = useState("");
  const [importRepo, setImportRepo] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importRef, setImportRef] = useState("main");
  const [importName, setImportName] = useState("");

  const activePacks = useMemo(
    () => (packs ?? []).filter((pack) => pack.status !== "archived"),
    [packs],
  );
  const skillAbilities = useMemo(
    () => (abilities ?? []).filter((ability) => ability.source_type === "skill"),
    [abilities],
  );
  const pluginMcpServers = useMemo(
    () => (mcpServers ?? []).filter((server) => server.source_type === "plugin"),
    [mcpServers],
  );
  const selectedPack = activePacks.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedSource = (sources ?? []).find((source) => source.id === sourceId) ?? null;

  useEffect(() => {
    if (!sourceId && sources?.length) setSourceId(sources[0].id);
  }, [sourceId, sources]);

  useEffect(() => {
    if (!selectedPackId) return;
    if (!activePacks.some((pack) => pack.id === selectedPackId)) setSelectedPackId(null);
  }, [activePacks, selectedPackId]);

  useEffect(() => {
    if (!selectedSource) {
      setPackages([]);
      return;
    }
    let cancelled = false;
    setPackagesLoading(true);
    fetchClaudeMarketplacePackages(selectedSource)
      .then((nextPackages) => {
        if (!cancelled) {
          setPackages(nextPackages);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPackages([]);
          setError(err instanceof Error ? err.message : "Failed to load marketplace");
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

  const filteredMcp = useMemo(() => {
    return pluginMcpServers;
  }, [pluginMcpServers]);

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

  const handleCreatePack = async () => {
    const name = packName.trim();
    if (!name) {
      setError("Pack name is required");
      return;
    }
    setBusyKey("create-pack");
    resetNotice();
    try {
      const created = await createKnowledgePack({
        name,
        description: packDescription.trim() || null,
      });
      await mutatePacks();
      setSelectedPackId(created.id);
      setPackName("");
      setPackDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pack");
    } finally {
      setBusyKey(null);
    }
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
      const created = await createMarketplaceSource({
        name: sourceName.trim() || `${owner}/${repo}`,
        source_type: "github",
        metadata: {
          adapter: "claude_plugin",
          owner,
          repo,
          ref,
          resolved_commit_sha: resolvedCommitSha,
          marketplace_path: sourceManifestPath.trim() || ".claude-plugin/marketplace.json",
        },
      });
      await mutateSources();
      setSourceId(created.id);
      setSourceName("");
      setSourceRepoUrl("");
      setMarketplaceRefresh((value) => value + 1);
      setMessage("Marketplace source added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRefreshSource = (source: MarketplaceSource) => {
    const info = sourceGitHubInfo(source);
    if (!info) {
      setError("Marketplace source is missing GitHub metadata");
      return;
    }
    setBusyKey(`sync:${source.id}`);
    resetNotice();
    resolveGitHubCommitSha(info.owner, info.repo, info.ref)
      .then(async (resolvedCommitSha) => {
        const updated = await updateMarketplaceSource(source.id, {
          metadata: {
            ...source.metadata,
            ref: info.ref,
            resolved_commit_sha: resolvedCommitSha,
          },
        });
        await mutateSources();
        setSourceId(updated.id);
        setActiveTab("marketplace");
        setMarketplaceRefresh((value) => value + 1);
        setMessage(`${source.name} refreshed to ${resolvedCommitSha.slice(0, 7)}.`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to refresh source");
      })
      .finally(() => setBusyKey(null));
  };

  const handleReviewPackage = async (pkg: MarketplacePackage) => {
    if (pkg.kind !== "plugin" && pkg.kind !== "skill") {
      void handleInstallPackage(pkg);
      return;
    }
    if (!selectedSource) {
      setError("Select a marketplace source first");
      return;
    }
    setBusyKey(`review:${pkg.id}`);
    resetNotice();
    try {
      const pluginRequest = pkg.kind === "plugin"
        ? await fetchClaudePluginInstallRequest(selectedSource, pkg)
        : await fetchMarketplaceSkillReview(selectedSource, pkg);
      if (!pluginRequest.skills.length) {
        throw new Error("No SKILL.md files were found for this package");
      }
      const envNames = inferMcpEnvNames(pluginRequest.mcp_servers ?? {});
      setPackageReview({
        pkg,
        source: selectedSource,
        plugin_request: pluginRequest,
        envNamesText: envNames.join("\n"),
        selectedSkillIndex: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skill");
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallPackage = async (pkg: MarketplacePackage, review?: PackageReview) => {
    const selector = packageSelector(pkg);
    setBusyKey(`install:${pkg.id}`);
    resetNotice();
    try {
      if (pkg.kind === "plugin") {
        const source = review?.source ?? selectedSource;
        if (!source) throw new Error("Select a marketplace source first");
        const request = review
          ? pluginRequestWithRuntime(review.plugin_request, parseEnvNames(review.envNamesText))
          : pluginRequestWithRuntime(await fetchClaudePluginInstallRequest(source, pkg), []);
        await installClaudePlugin(source.id, request);
        await Promise.all([mutateAbilities(), mutateMcp()]);
      } else if (pkg.kind === "skill") {
        const name = identifier(pkg.name);
        const envNames = parseEnvNames(review?.envNamesText ?? "");
        await installSkill({
          name,
          tool_name: name,
          path: "repo",
          display_name: pkg.display_name ?? pkg.name,
          description: pkg.description ?? undefined,
          activation_condition: pkg.description ?? "",
          selector,
          metadata: {
            ...withInstallSelector(pkg.metadata, selector, "skill"),
            runtime: { env_names: envNames },
          },
        });
        await mutateAbilities();
      } else {
        await installKnowledgePack({
          name: pkg.display_name ?? pkg.name,
          slug: slugify(pkg.name),
          description: pkg.description,
          selector,
          source_type: "github",
          read_only: true,
          metadata: withInstallSelector(pkg.metadata, selector, "knowledge_pack"),
        });
        await mutatePacks();
      }
      setPackageReview(null);
      setMessage(`${pkg.display_name ?? pkg.name} installed.`);
      setActiveTab("installed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
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
      setMessage(`${ability.display_name ?? ability.name} uninstalled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to uninstall skill");
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
    router.push(`/dashboard/agents?tab=abilities&ability=${encodeURIComponent(ability.id)}`);
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
      await updateSkillRuntimeEnvNames(envEditor.ability.id, parseEnvNames(envEditor.envNamesText));
      await mutateAbilities();
      setEnvEditor(null);
      setMessage(`${envEditor.ability.display_name ?? envEditor.ability.name} environment updated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update skill environment");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUninstallPlugin = async (server: McpServer) => {
    setBusyKey(`uninstall-plugin:${server.id}`);
    resetNotice();
    try {
      await uninstallPluginInstall(server.id);
      await Promise.all([mutateAbilities(), mutateMcp()]);
      setMessage(`${server.display_name} uninstalled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to uninstall plugin");
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteSource = async (source: MarketplaceSource) => {
    setBusyKey(`delete-source:${source.id}`);
    resetNotice();
    try {
      await deleteMarketplaceSource(source.id);
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
      if (importMode === "claude_plugin") {
        const resolvedCommitSha = await resolveGitHubCommitSha(owner, repo, ref);
        const source = await createMarketplaceSource({
          name: `${owner}/${repo}`,
          source_type: "github",
          metadata: { adapter: "claude_plugin", owner, repo, ref, resolved_commit_sha: resolvedCommitSha },
        });
        const pkg: MarketplacePackage = {
          id: `${source.id}:${path}`,
          kind: "plugin",
          name,
          display_name: name,
          description: null,
          latest_version: null,
          synced_at: null,
          source_path: path,
          metadata: {
            source: { provider: "github", owner, repo, path, package: name },
            version: { ref, resolved_commit_sha: resolvedCommitSha },
          },
        };
        const request = await fetchClaudePluginInstallRequest(source, pkg);
        await installClaudePlugin(source.id, request);
        await Promise.all([mutateSources(), mutateAbilities(), mutateMcp()]);
      } else if (importMode === "skill") {
        const selector = `repo://${owner}/${repo}/${name}`;
        const normalizedName = identifier(name);
        await installSkill({
          name: normalizedName,
          tool_name: normalizedName,
          path: "repo",
          display_name: name,
          selector,
          metadata: githubInstallMetadata(owner, repo, path, name, ref, selector, "skill"),
        });
        await mutateAbilities();
      } else {
        const selector = `repo://${owner}/${repo}/${name}`;
        await installKnowledgePack({
          name,
          slug: slugify(name),
          selector,
          source_type: "github",
          read_only: true,
          metadata: githubInstallMetadata(owner, repo, path, name, ref, selector, "knowledge_pack"),
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
        <TopBar title="Library" />
        <PageContent className="space-y-4">
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Library", href: "/dashboard/knowledge", onClick: () => setSelectedPackId(null) },
              { label: selectedPack.name },
            ]}
          />
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-950 dark:text-gray-50">{selectedPack.name}</h1>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{knowledgeSelector(selectedPack)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{selectedPack.source_type === "github" ? "GitHub" : "Platform"}</Badge>
              {selectedPack.version ? <Badge>{selectedPack.version}</Badge> : null}
              {selectedPack.read_only ? <Badge>Read-only</Badge> : null}
              {selectedPack.is_system ? <Badge>System</Badge> : null}
            </div>
          </div>
          <KnowledgeSection packId={selectedPack.id} readOnly={selectedPack.read_only} />
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar title="Library" />
      <PageContent className="space-y-6">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Library" }]} />

        <div>
          <h1 className="theme-text text-2xl font-semibold">Library</h1>
          <p className="theme-text-muted mt-3 max-w-2xl text-sm leading-6">
            Installed knowledge packs, skills, plugins, and marketplace sources for this org.
          </p>
        </div>

        <div className="mb-6">
          <Tabs
            tabs={[
              { id: "installed", label: "Installed" },
              { id: "marketplace", label: "Marketplace" },
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
            packs={filteredPacks}
            abilities={filteredSkills}
            mcpServers={filteredMcp}
            isLoading={packsLoading || abilitiesLoading || mcpLoading}
            onOpenPack={setSelectedPackId}
            onViewSkill={handleViewInstalledSkill}
            onOpenAbility={handleOpenAbilityPage}
            packName={packName}
            packDescription={packDescription}
            onPackNameChange={setPackName}
            onPackDescriptionChange={setPackDescription}
            onCreatePack={handleCreatePack}
            creatingPack={busyKey === "create-pack"}
            onUninstallSkill={handleUninstallSkill}
            onEditSkillEnv={handleOpenEnvEditor}
            onUninstallPlugin={handleUninstallPlugin}
            busyKey={busyKey}
          />
        ) : null}

        {activeTab === "marketplace" ? (
          <MarketplaceTab
            sources={sources ?? []}
            selectedSourceId={sourceId}
            onSourceChange={setSourceId}
            packages={filteredPackages}
            isLoading={sourcesLoading || packagesLoading}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            onOpen={handleReviewPackage}
            onInstall={(pkg) => handleInstallPackage(pkg)}
            onRefresh={() => setMarketplaceRefresh((value) => value + 1)}
            busyKey={busyKey}
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
        onEnvNamesChange={(value) => setPackageReview((current) => current ? { ...current, envNamesText: value } : current)}
        onSelectedSkillChange={(index) => setPackageReview((current) => current ? { ...current, selectedSkillIndex: index } : current)}
        onInstall={() => packageReview ? handleInstallPackage(packageReview.pkg, packageReview) : undefined}
      />
      <SkillEnvModal
        editor={envEditor}
        busyKey={busyKey}
        onClose={() => setEnvEditor(null)}
        onChange={(value) => setEnvEditor((current) => current ? { ...current, envNamesText: value } : current)}
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
      ...(typeof metadata.install === "object" && metadata.install !== null && !Array.isArray(metadata.install)
        ? metadata.install as Record<string, unknown>
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
      ...(kind === "skill" ? { entrypoint: "SKILL.md" } : { manifest_path: "manifest.yaml" }),
    },
  };
}

function inferMcpEnvNames(servers: Record<string, ClaudeMcpServerConfig>): string[] {
  const names = new Set<string>();
  for (const server of Object.values(servers)) {
    if (!server.env || typeof server.env !== "object" || Array.isArray(server.env)) continue;
    for (const key of Object.keys(server.env)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) names.add(key);
    }
  }
  return Array.from(names).sort();
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
  return Array.isArray(envNames) ? envNames.filter((name): name is string => typeof name === "string") : [];
}

async function fetchInstalledSkillReview(ability: Ability): Promise<PackageReview> {
  const owner = metadataText(ability.metadata, ["source", "owner"]);
  const repo = metadataText(ability.metadata, ["source", "repo"]);
  const packageName = metadataText(ability.metadata, ["source", "package"]) ?? ability.name;
  const sourcePath = metadataText(ability.metadata, ["source", "path"]);
  const ref = metadataText(ability.metadata, ["version", "ref"]) ?? metadataText(ability.metadata, ["version", "requested_ref"]) ?? "main";
  const resolvedCommitSha = metadataText(ability.metadata, ["version", "resolved_commit_sha"]);
  const entrypoint = metadataText(ability.metadata, ["distribution", "entrypoint"]) ?? "SKILL.md";
  if (!owner || !repo || !sourcePath) {
    throw new Error("Installed skill is missing GitHub source metadata");
  }
  const fetchRef = resolvedCommitSha ?? ref;
  const skillPath = `${sourcePath.replace(/\/+$/, "")}/${entrypoint.replace(/^\/+/, "")}`;
  const content = await fetchText(githubRawUrl(owner, repo, fetchRef, skillPath));
  const pkg: MarketplacePackage = {
    id: ability.id,
    kind: "skill",
    name: packageName,
    display_name: ability.display_name ?? ability.name,
    description: ability.description,
    latest_version: metadataText(ability.metadata, ["version", "package_version"]),
    metadata: ability.metadata,
    synced_at: ability.updated_at,
    source_path: sourcePath,
  };
  return {
    pkg,
    source: null,
    plugin_request: {
      name: packageName,
      display_name: ability.display_name ?? ability.name,
      description: ability.description,
      source: { path: sourcePath },
      version: {
        ref_: ref,
        resolved_commit_sha: resolvedCommitSha,
        package_version: metadataText(ability.metadata, ["version", "package_version"]),
      },
      skills: [{
        name: ability.name,
        display_name: ability.display_name,
        description: ability.description,
        entrypoint,
        skill_path: skillPath,
        content,
      }],
      mcp_servers: {},
    },
    envNamesText: abilityEnvNames(ability).join("\n"),
    selectedSkillIndex: 0,
  };
}

function pluginRequestWithRuntime(
  request: PackageReview["plugin_request"],
  envNames: string[],
): InstallClaudePluginRequest {
  return {
    ...request,
    skills: request.skills.map((skill) => ({
      name: skill.name,
      display_name: skill.display_name,
      description: skill.description,
      entrypoint: skill.entrypoint,
      runtime: { env_names: envNames },
    })),
  };
}

function splitFrontmatter(markdown: string): { frontmatter: Array<[string, string]>; body: string } {
  const parsed = matter(markdown);
  return {
    frontmatter: Object.entries(parsed.data).map(([key, value]) => [key, formatFrontmatterValue(value)]),
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

function frontmatterValue(entries: Array<[string, string]>, key: string): string | null {
  return entries.find(([entryKey]) => entryKey === key)?.[1] || null;
}

function frontmatterEntriesWithout(entries: Array<[string, string]>, keys: string[]): Array<[string, string]> {
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

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const cls = tone === "error"
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function InstalledTab({
  packs,
  abilities,
  mcpServers,
  isLoading,
  onOpenPack,
  onViewSkill,
  onOpenAbility,
  packName,
  packDescription,
  onPackNameChange,
  onPackDescriptionChange,
  onCreatePack,
  creatingPack,
  onUninstallSkill,
  onEditSkillEnv,
  onUninstallPlugin,
  busyKey,
}: {
  packs: KnowledgePack[];
  abilities: Ability[];
  mcpServers: McpServer[];
  isLoading: boolean;
  onOpenPack: (id: string) => void;
  onViewSkill: (ability: Ability) => void;
  onOpenAbility: (ability: Ability) => void;
  packName: string;
  packDescription: string;
  onPackNameChange: (value: string) => void;
  onPackDescriptionChange: (value: string) => void;
  onCreatePack: () => void;
  creatingPack: boolean;
  onUninstallSkill: (ability: Ability) => void;
  onEditSkillEnv: (ability: Ability) => void;
  onUninstallPlugin: (server: McpServer) => void;
  busyKey: string | null;
}) {
  if (isLoading) return <LoadingGrid />;
  return (
    <div className="space-y-7">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400"><BookOpen className="h-4 w-4" /></span>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Knowledge Packs</h2>
            <span className="text-xs text-gray-400">{packs.length}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packs.map((pack) => (
            <button key={pack.id} type="button" onClick={() => onOpenPack(pack.id)} className="h-full text-left">
              <AssetCard
                icon={<BookOpen className="h-5 w-5" />}
                title={pack.name}
                subtitle={knowledgeSelector(pack)}
                description={pack.description}
                badges={[
                  pack.source_type === "github" ? "GitHub" : "Platform",
                  pack.version,
                  pack.read_only ? "Read-only" : null,
                  pack.is_system ? "System" : null,
                ]}
                updatedAt={pack.updated_at}
              />
            </button>
          ))}
            <CreateKnowledgePackCard
              packName={packName}
              packDescription={packDescription}
              onPackNameChange={onPackNameChange}
              onPackDescriptionChange={onPackDescriptionChange}
              onCreatePack={onCreatePack}
              creatingPack={creatingPack}
            />
          </div>
        </section>

        <AssetSection title="Skills" count={abilities.length} icon={<Sparkles className="h-4 w-4" />}>
          {abilities.map((ability) => (
            <AssetCard
              key={ability.id}
              icon={<Sparkles className="h-5 w-5" />}
              title={ability.display_name ?? ability.name}
              subtitle={metadataText(ability.metadata, ["install", "selector"]) ?? ability.tool_name}
              description={ability.description}
              badges={["Skill", `${ability.mcp_server_ids.length} MCP`, ability.read_only ? "Read-only" : null]}
              updatedAt={ability.updated_at}
              onClick={() => onViewSkill(ability)}
              isBusy={busyKey === `view-skill:${ability.id}`}
              actions={!ability.is_system ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => onOpenAbility(ability)}
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
              ) : null}
            />
          ))}
        </AssetSection>

        <AssetSection title="Plugin MCP" count={mcpServers.length} icon={<PlugZap className="h-4 w-4" />}>
          {mcpServers.map((server) => (
            <div key={server.id} className="space-y-3">
              <AssetCard
                icon={<PlugZap className="h-5 w-5" />}
                title={server.display_name}
                subtitle={metadataText(server.metadata, ["install", "selector"]) ?? server.name}
                description={server.description}
                badges={["MCP", server.transport, server.read_only ? "Read-only" : null]}
                updatedAt={server.updated_at}
              />
              {!server.is_system ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="w-full"
                  onClick={() => onUninstallPlugin(server)}
                  isLoading={busyKey === `uninstall-plugin:${server.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                  Uninstall Plugin
                </Button>
              ) : null}
            </div>
          ))}
        </AssetSection>
    </div>
  );
}

function CreateKnowledgePackCard({
  packName,
  packDescription,
  onPackNameChange,
  onPackDescriptionChange,
  onCreatePack,
  creatingPack,
}: {
  packName: string;
  packDescription: string;
  onPackNameChange: (value: string) => void;
  onPackDescriptionChange: (value: string) => void;
  onCreatePack: () => void;
  creatingPack: boolean;
}) {
  return (
    <div className="flex min-h-44 h-full flex-col rounded-lg border border-dashed border-gray-300 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">New Knowledge Pack</h3>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <Input value={packName} onChange={(event) => onPackNameChange(event.target.value)} placeholder="Pack name" />
        <Textarea
          value={packDescription}
          onChange={(event) => onPackDescriptionChange(event.target.value)}
          placeholder="Short description"
          className="min-h-16 flex-1"
        />
        <Button size="sm" className="w-full" onClick={onCreatePack} isLoading={creatingPack}>
          <Plus className="h-4 w-4" />
          Create Pack
        </Button>
      </div>
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
  onInstall,
  onRefresh,
  busyKey,
}: {
  sources: MarketplaceSource[];
  selectedSourceId: string | undefined;
  onSourceChange: (id: string) => void;
  packages: MarketplacePackage[];
  isLoading: boolean;
  kindFilter: MarketplacePackageKind | "all";
  onKindFilterChange: (kind: MarketplacePackageKind | "all") => void;
  onOpen: (pkg: MarketplacePackage) => void;
  onInstall: (pkg: MarketplacePackage) => void;
  onRefresh: () => void;
  busyKey: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Select value={selectedSourceId ?? ""} onChange={(event) => onSourceChange(event.target.value)} disabled={!sources.length}>
          {sources.length ? sources.map((source) => (
            <option key={source.id} value={source.id}>{source.name}</option>
          )) : <option value="">No marketplace sources</option>}
        </Select>
        <Select value={kindFilter} onChange={(event) => onKindFilterChange(event.target.value as MarketplacePackageKind | "all")}>
          <option value="all">All package types</option>
          <option value="knowledge_pack">Knowledge packs</option>
          <option value="skill">Skills</option>
          <option value="plugin">Plugins</option>
        </Select>
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={!selectedSourceId}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {isLoading ? <LoadingGrid /> : packages.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <AssetCard
                icon={pkg.kind === "plugin" ? <PlugZap className="h-5 w-5" /> : pkg.kind === "skill" ? <Sparkles className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                title={pkg.display_name ?? pkg.name}
                subtitle={packageSelector(pkg)}
                description={pkg.description}
                badges={[pkg.kind.replace("_", " "), sourceLabel(pkg.metadata), pkg.latest_version]}
                updatedAt={pkg.synced_at}
                framed={false}
                statusLabel="Available"
              />
              <Button
                size="sm"
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => pkg.kind === "plugin" || pkg.kind === "skill" ? onOpen(pkg) : onInstall(pkg)}
                isLoading={busyKey === `review:${pkg.id}`}
              >
                {pkg.kind === "plugin" || pkg.kind === "skill" ? <BookOpen className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {pkg.kind === "plugin" || pkg.kind === "skill" ? "View" : "Install"}
              </Button>
              {pkg.kind === "plugin" || pkg.kind === "skill" ? (
              <Button
                size="sm"
                className="mt-2 w-full"
                onClick={() => onInstall(pkg)}
                isLoading={busyKey === `install:${pkg.id}`}
              >
                <Download className="h-4 w-4" />
                Install
              </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="No packages found for this source." />
      )}
    </div>
  );
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
  const skill = review?.plugin_request.skills[review.selectedSkillIndex] ?? review?.plugin_request.skills[0] ?? null;
  const renderedSkill = skill ? splitFrontmatter(skill.content) : null;
  const metadataName = renderedSkill ? frontmatterValue(renderedSkill.frontmatter, "name") : null;
  const metadataDescription = renderedSkill ? frontmatterValue(renderedSkill.frontmatter, "description") : null;
  const metadataTools = renderedSkill ? frontmatterValue(renderedSkill.frontmatter, "allowed-tools") : null;
  const extraMetadata = renderedSkill
    ? frontmatterEntriesWithout(renderedSkill.frontmatter, ["name", "description", "allowed-tools"])
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
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Selector</div>
              <div className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">{packageSelector(review.pkg)}</div>
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
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allowed env vars</span>
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
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.display_name ?? skill.name}</div>
              <div className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">{skill.skill_path}</div>
            </div>
            <div className="max-h-[68vh] overflow-auto rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
              {renderedSkill?.frontmatter.length ? (
                <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Skill metadata</span>
                    {metadataName ? (
                      <span className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                        {metadataName}
                      </span>
                    ) : null}
                  </div>
                  {metadataDescription ? (
                    <p className="max-w-4xl text-sm leading-6 text-gray-700 dark:text-gray-300">{metadataDescription}</p>
                  ) : null}
                  {metadataTools ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Allowed tools</div>
                      <div className="flex flex-wrap gap-2">
                        {metadataTools.split(",").map((tool) => tool.trim()).filter(Boolean).map((tool) => (
                          <span key={tool} className="rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
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
                          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{humanizeFrontmatterKey(key)}</dt>
                          <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">{value || "-"}</dd>
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
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={onInstall} isLoading={busyKey === `install:${review.pkg.id}`}>
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
      title={editor ? `Skill env: ${editor.ability.display_name ?? editor.ability.name}` : "Skill env"}
      className="!w-[min(92vw,560px)] !max-w-xl"
    >
      {editor ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Selector</div>
            <div className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {metadataText(editor.ability.metadata, ["install", "selector"]) ?? editor.ability.tool_name}
            </div>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allowed env vars</span>
            <Textarea
              value={editor.envNamesText}
              onChange={(event) => onChange(event.target.value)}
              placeholder="XAI_API_KEY&#10;X_BEARER_TOKEN"
              rows={8}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={onSave} isLoading={busyKey === `skill-env:${editor.ability.id}`}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function SourcesTab(props: {
  sources: MarketplaceSource[];
  isLoading: boolean;
  onRefresh: (source: MarketplaceSource) => void;
  onDelete: (source: MarketplaceSource) => void;
  busyKey: string | null;
  sourceName: string;
  sourceRepoUrl: string;
  sourceRef: string;
  sourceManifestPath: string;
  onSourceNameChange: (value: string) => void;
  onSourceRepoUrlChange: (value: string) => void;
  onSourceRefChange: (value: string) => void;
  onSourceManifestPathChange: (value: string) => void;
  onCreateSource: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="space-y-3">
        {props.isLoading ? <LoadingGrid /> : props.sources.length ? props.sources.map((source) => (
          <div key={source.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-950 dark:text-gray-50">{source.name}</h3>
                <Badge>{source.source_type}</Badge>
                {source.is_system ? <Badge>System</Badge> : null}
              </div>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                {metadataText(source.metadata, ["owner"]) && metadataText(source.metadata, ["repo"])
                  ? `${metadataText(source.metadata, ["owner"])}/${metadataText(source.metadata, ["repo"])}`
                  : "Custom marketplace source"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => props.onRefresh(source)} isLoading={props.busyKey === `sync:${source.id}`}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              {!source.is_system ? (
                <Button size="sm" variant="danger" onClick={() => props.onDelete(source)} isLoading={props.busyKey === `delete-source:${source.id}`}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        )) : <EmptyState text="No marketplace sources configured." />}
      </main>
      <aside className="h-fit rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">Import Marketplace</h2>
        </div>
        <div className="mt-4 space-y-3">
          <Input value={props.sourceName} onChange={(event) => props.onSourceNameChange(event.target.value)} placeholder="Display name" />
          <Input value={props.sourceRepoUrl} onChange={(event) => props.onSourceRepoUrlChange(event.target.value)} placeholder="https://github.com/owner/repo" />
          <Input value={props.sourceRef} onChange={(event) => props.onSourceRefChange(event.target.value)} placeholder="Branch, tag, or SHA" />
          <Input value={props.sourceManifestPath} onChange={(event) => props.onSourceManifestPathChange(event.target.value)} placeholder="Marketplace manifest path" />
          <Button size="sm" className="w-full" onClick={props.onCreateSource} isLoading={props.busyKey === "create-source"}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </aside>
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
        <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-50">Direct GitHub Import</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Select value={props.mode} onChange={(event) => props.onModeChange(event.target.value as ImportMode)}>
          <option value="knowledge_pack">Knowledge pack</option>
          <option value="skill">Skill</option>
          <option value="claude_plugin">Claude plugin</option>
        </Select>
        <Input value={props.name} onChange={(event) => props.onNameChange(event.target.value)} placeholder="Package name" />
        <Input value={props.owner} onChange={(event) => props.onOwnerChange(event.target.value)} placeholder="GitHub owner" />
        <Input value={props.repo} onChange={(event) => props.onRepoChange(event.target.value)} placeholder="GitHub repo" />
        <Input value={props.path} onChange={(event) => props.onPathChange(event.target.value)} placeholder="Path in repo" />
        <Input value={props.refValue} onChange={(event) => props.onRefChange(event.target.value)} placeholder="Ref, tag, or SHA" />
      </div>
      <Button className="mt-4" onClick={props.onImport} isLoading={props.importing}>
        <Download className="h-4 w-4" />
        Import
      </Button>
    </div>
  );
}

function AssetSection({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
        <span className="text-xs text-gray-400">{count}</span>
      </div>
      {count ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div> : <EmptyState text={`No ${title.toLowerCase()} installed.`} />}
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
  onClick,
  isBusy = false,
  framed = true,
  statusLabel = "Installed",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string | null | undefined;
  badges: Array<string | null | undefined>;
  updatedAt: string | null | undefined;
  actions?: React.ReactNode;
  onClick?: () => void;
  isBusy?: boolean;
  framed?: boolean;
  statusLabel?: string;
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
        <h3 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">{title}</h3>
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600 dark:text-gray-300">{description || "No description available."}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {badges.filter(Boolean).map((badge) => <Badge key={badge}>{badge}</Badge>)}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
          <Clock3 className="h-3.5 w-3.5" />
          {isBusy ? "Loading..." : formatLibraryDate(updatedAt)}
        </span>
      </div>
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
  return <div className="h-full min-h-44 rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">{body}</div>;
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
        <div key={item} className="h-44 animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
      ))}
    </div>
  );
}
