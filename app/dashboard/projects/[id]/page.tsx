import { Suspense } from "react";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { ProjectDetailClient } from "./ProjectDetailClient";

function ProjectDetailFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] dark:bg-[#05070b]">
      <LoadingStatus className="min-h-screen" label="Loading project" description="Gathering project context and recent work." />
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<ProjectDetailFallback />}>
      <ProjectDetailClient projectRef={id} />
    </Suspense>
  );
}
