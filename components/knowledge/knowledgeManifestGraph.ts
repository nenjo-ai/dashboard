import type { KnowledgeItem, KnowledgeItemEdge } from "@/lib/types";

export interface KnowledgeManifestDoc {
  id?: string;
  selector?: string;
  path?: string;
  title?: string;
  summary?: string | null;
  kind?: string | null;
  tags?: string[];
  related?: Array<{ type?: string; target?: string; note?: string | null }>;
}

export interface KnowledgeManifestEdge {
  source: string;
  target: string;
  type: string;
  note?: string | null;
}

export interface KnowledgeManifestGraph {
  name?: string;
  docs: KnowledgeManifestDoc[];
  edges?: KnowledgeManifestEdge[];
}

export function docGraphId(doc: KnowledgeManifestDoc): string {
  return doc.id || doc.selector || doc.path || doc.title || "untitled";
}

export function docGraphLabel(doc: KnowledgeManifestDoc): string {
  return doc.title || doc.selector || doc.path || doc.id || "Untitled";
}

export function knowledgeItemsToManifest(
  name: string,
  items: KnowledgeItem[],
  edges: KnowledgeItemEdge[],
): KnowledgeManifestGraph {
  const docs = items.map((item) => ({
    id: item.id,
    path: item.path ? `${item.path}/${item.filename}` : item.filename,
    title: item.title || item.filename,
    summary: item.summary,
    kind: item.kind,
    tags: item.tags,
  }));

  return {
    name,
    docs,
    edges: edges.map((edge) => ({
      source: edge.source_item_id,
      target: edge.target_item_id,
      type: edge.edge_type,
      note: edge.note,
    })),
  };
}
