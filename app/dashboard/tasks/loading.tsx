import { Skeleton } from "@/components/ui/Skeleton";

export default function TasksLoading() {
  return <div className="space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
}
