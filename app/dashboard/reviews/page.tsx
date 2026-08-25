import { HumanReviewInbox } from "@/components/human-review/HumanReviewInbox";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { PageIntro } from "@/components/ui/PageIntro";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ execution_id?: string; task_id?: string }>;
}) {
  const filters = await searchParams;
  return <><TopBar title="Reviews" /><PageContent>
    <PageIntro
      title="Human reviews"
      description="Inspect agent output and resolve routine checkpoints waiting for an organization decision."
    />
    <HumanReviewInbox executionId={filters.execution_id} taskId={filters.task_id} />
  </PageContent></>;
}
