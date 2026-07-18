import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { TaskIndexClient } from "@/components/tasks/TaskIndexClient";

export default function TasksPage() {
  return (
    <>
      <TopBar title="Tasks" />
      <PageContent>
        <div className="mb-5">
          <h1 className="theme-text text-2xl font-semibold">Organization tasks</h1>
          <p className="theme-text-muted mt-1 text-sm">Plan and run work independently of projects.</p>
        </div>
        <TaskIndexClient />
      </PageContent>
    </>
  );
}
