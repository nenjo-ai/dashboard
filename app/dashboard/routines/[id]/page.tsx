import { Suspense } from "react";
import { RoutineDetailClient } from "./RoutineDetailClient";

function RoutineDetailFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
      Loading routine...
    </div>
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
