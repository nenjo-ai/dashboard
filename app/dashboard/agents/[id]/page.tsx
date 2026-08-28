import { Suspense } from "react";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { AgentDetailClient } from "./AgentDetailClient";

function AgentDetailFallback() {
  return <LoadingStatus className="min-h-screen" description="Preparing the agent workspace." label="Loading agent" />;
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<AgentDetailFallback />}>
      <AgentDetailClient agentRef={id} />
    </Suspense>
  );
}
