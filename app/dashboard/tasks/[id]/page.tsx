import { Suspense } from "react";
import { TaskDetailClient } from "@/components/tasks/TaskDetailClient";
import { Skeleton } from "@/components/ui/Skeleton";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><TaskDetailClient taskId={id} /></Suspense>;
}
