import type { KnowledgePack } from "./types";

export type KnowledgeGraphSourceFilter = "all" | "workspace" | "managed";

export interface KnowledgeGraphSummary {
  totalCount: number;
  workspaceCount: number;
  managedCount: number;
  recentlyUpdatedCount: number;
}

export function isLibraryKnowledgeGraph(pack: KnowledgePack): boolean {
  return pack.source_type !== "package" && !pack.is_system;
}

export function knowledgeGraphSourceLabel(pack: KnowledgePack): "Workspace" | "Source managed" {
  return pack.source_type === "uploaded" ? "Workspace" : "Source managed";
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
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    .toSorted((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}
