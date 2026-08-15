import { HumanReviewInbox } from "@/components/human-review/HumanReviewInbox";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ execution_id?: string; task_id?: string }>;
}) {
  const filters = await searchParams;
  return <><TopBar title="Reviews" /><PageContent>
    <div className="mb-5"><h1 className="theme-text text-2xl font-semibold">Human reviews</h1>
      <p className="theme-text-muted mt-1 text-sm">Resolve routine checkpoints waiting for an organization decision.</p></div>
    <HumanReviewInbox executionId={filters.execution_id} taskId={filters.task_id} />
  </PageContent></>;
}
