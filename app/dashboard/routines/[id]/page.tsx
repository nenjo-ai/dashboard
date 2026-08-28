import { Suspense } from "react";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { RoutineDetailClient } from "./RoutineDetailClient";

function RoutineDetailFallback() {
  return (
    <LoadingStatus className="min-h-screen" description="Preparing the workflow workspace." label="Loading routine" />
  );
}

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<RoutineDetailFallback />}>
      <RoutineDetailClient routineRef={id} />
    </Suspense>
  );
}
