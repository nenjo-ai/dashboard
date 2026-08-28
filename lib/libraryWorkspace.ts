import type { KnowledgePack } from "./types";

export type KnowledgeGraphSourceFilter = "all" | "workspace" | "managed";

export interface KnowledgeGraphSummary {
  totalCount: number;
  workspaceCount: number;
  managedCount: number;
  recentlyUpdatedCount: number;
}

export function isLibraryKnowledgeGraph(pack: KnowledgePack): boolean {
  return pack.is_system !== true;
}

export function knowledgeGraphSourceLabel(pack: KnowledgePack): "Workspace" | "Source managed" | "Package managed" {
  if (pack.source_type === "uploaded") return "Workspace";
  return pack.source_type === "package" ? "Package managed" : "Source managed";
}

export function knowledgeGraphSourceDetail(pack: KnowledgePack): string | null {
  if (pack.source_type !== "package") return null;
  const packageMetadata = pack.metadata.package;
  if (!packageMetadata || typeof packageMetadata !== "object" || Array.isArray(packageMetadata)) return null;
  const record = packageMetadata as Record<string, unknown>;
  for (const field of ["logical_name", "name"]) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function summarizeKnowledgeGraphs(
  packs: readonly KnowledgePack[],
  now = Date.now(),
): KnowledgeGraphSummary {
  const recentThreshold = now - 7 * 24 * 60 * 60 * 1000;
  return packs.reduce<KnowledgeGraphSummary>((summary, pack) => {
    summary.totalCount += 1;
    if (pack.source_type === "uploaded") summary.workspaceCount += 1;
    else summary.managedCount += 1;
    if (new Date(pack.updated_at).getTime() >= recentThreshold) summary.recentlyUpdatedCount += 1;
    return summary;
  }, { totalCount: 0, workspaceCount: 0, managedCount: 0, recentlyUpdatedCount: 0 });
}

export function selectKnowledgeGraphs(
  packs: readonly KnowledgePack[],
  query: string,
  source: KnowledgeGraphSourceFilter,
): KnowledgePack[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return packs
    .filter((pack) => source === "all"
      || (source === "workspace" ? pack.source_type === "uploaded" : pack.source_type !== "uploaded"))
    .filter((pack) => !normalizedQuery || [
      pack.name,
      pack.description ?? "",
      pack.selector ?? `lib:${pack.slug}`,
      pack.version ?? "",
      knowledgeGraphSourceDetail(pack) ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    .toSorted((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}
