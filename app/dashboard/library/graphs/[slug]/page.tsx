import { Suspense } from "react";

import { KnowledgeGraphDetailClient } from "@/components/library/KnowledgeGraphDetailClient";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

export default async function KnowledgeGraphPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Suspense fallback={<LoadingStatus className="min-h-72" label="Loading knowledge graph" />}><KnowledgeGraphDetailClient graphRef={slug} /></Suspense>;
}
