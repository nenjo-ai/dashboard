import { Suspense } from "react";

import { KnowledgeGraphIndexClient } from "@/components/library/KnowledgeGraphIndexClient";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

export default function KnowledgeGraphsPage() {
  return <Suspense fallback={<LoadingStatus className="min-h-72" label="Loading knowledge graphs" />}><KnowledgeGraphIndexClient /></Suspense>;
}
