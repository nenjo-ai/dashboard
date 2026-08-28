"use client";

import { useCallback, useMemo, useState } from "react";
import { ListFilter, ListTree, Plus, Search, TriangleAlert, Workflow } from "lucide-react";

import { deleteRoutine } from "@/lib/api";
import { useRoutines } from "@/lib/hooks";
import {
  filterAndSortRoutines,
  summarizeRoutineWorkspace,
  type RoutineSort,
} from "@/lib/routineWorkspace";
import { toast } from "@/lib/toast";
import type { RoutineSummary } from "@/lib/types";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { MotionItem, MotionList } from "@/components/ui/motion";
import { PageIntro } from "@/components/ui/PageIntro";
import { Select } from "@/components/ui/Select";
import { CreateRoutineDialog } from "./CreateRoutineDialog";
import { RoutineCard } from "./RoutineCard";

interface RoutineSectionProps {
  allowCreate?: boolean;
}

export function RoutineSection({ allowCreate = true }: RoutineSectionProps) {
  const { routines, isLoading, isError, error, mutate } = useRoutines();
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RoutineSort>("updated");
  const [confirmDelete, setConfirmDelete] = useState<RoutineSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summary = useMemo(() => summarizeRoutineWorkspace(routines ?? []), [routines]);
  const visibleRoutines = useMemo(
    () => filterAndSortRoutines(routines ?? [], query, sort),
    [query, routines, sort],
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteRoutine(confirmDelete.id);
      toast.success(`“${confirmDelete.name}” deleted.`);
      setConfirmDelete(null);
      await mutate();
    } catch {
      toast.error("Failed to delete routine.");
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, mutate]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="hidden md:block">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Routines" }]} />
      </div>

      <PageIntro
        actions={allowCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New routine
          </Button>
        ) : undefined}
        className="mb-0"
        description="Design reusable agent workflows, attach them to tasks, and review every run from one focused workspace."
        eyebrow="Workflow library"
        title="Routines"
      />

      {!isLoading && !isError && routines?.length ? (
        <section aria-label="Routine summary" className="theme-surface theme-border grid overflow-hidden rounded-2xl border sm:grid-cols-3">
          <SummaryMetric label="Routines" value={summary.routines} />
          <SummaryMetric className="theme-border border-t sm:border-l sm:border-t-0" label="Workflow steps" value={summary.steps} />
          <SummaryMetric className="theme-border border-t sm:border-l sm:border-t-0" label="With run history" value={summary.previouslyRun} />
        </section>
      ) : null}

      {isLoading ? (
        <LoadingStatus className="min-h-72" description="Gathering workflow structure and recent run activity." label="Loading routines" />
      ) : isError ? (
        <EmptyState
          action={<Button onClick={() => void mutate()} variant="secondary">Try again</Button>}
          description={error?.message ?? "Check the local worker connection and try again."}
          icon={<TriangleAlert className="h-5 w-5" />}
          title="Routines could not be loaded"
          tone="error"
        />
      ) : routines?.length ? (
        <>
          <div className="theme-surface theme-border flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search routines</span>
              <Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
              <Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search routines" value={query} />
            </label>
            <label className="relative w-full sm:w-48">
              <span className="sr-only">Sort routines</span>
              <ListFilter className="theme-text-muted pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
              <Select className="pl-9" onChange={(event) => setSort(event.target.value as RoutineSort)} value={sort}>
                <option value="updated">Recently updated</option>
                <option value="name">Name</option>
                <option value="steps">Most steps</option>
              </Select>
            </label>
          </div>

          {visibleRoutines.length ? (
            <MotionList className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {visibleRoutines.map((routine) => (
                <MotionItem className="h-full" key={routine.id}>
                  <RoutineCard
                    isDeleting={deleting && confirmDelete?.id === routine.id}
                    onDelete={setConfirmDelete}
                    routine={routine}
                  />
                </MotionItem>
              ))}
            </MotionList>
          ) : (
            <EmptyState
              action={<Button onClick={() => setQuery("")} variant="secondary">Clear search</Button>}
              description="Try a different name, description, or routine slug."
              icon={<Search className="h-5 w-5" />}
              title="No matching routines"
            />
          )}
        </>
      ) : (
        <EmptyState
          action={allowCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create routine
            </Button>
          ) : undefined}
          description="Start with a task entry, add agent or review steps, then connect the paths that move work forward."
          icon={<ListTree className="h-5 w-5" />}
          title="Create your first routine"
        />
      )}

      <CreateRoutineDialog
        onClose={() => setCreateOpen(false)}
        onCreated={() => void mutate()}
        open={allowCreate && createOpen}
      />
      <ConfirmDialog
        confirmLabel="Delete routine"
        loading={deleting}
        message={`Delete “${confirmDelete?.name}”? Assigned tasks will no longer be able to use this workflow. This action cannot be undone.`}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        open={Boolean(confirmDelete)}
        title="Delete routine"
        variant="danger"
      />
    </div>
  );
}

function SummaryMetric({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 sm:px-5 ${className ?? ""}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
        <Workflow className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="theme-text text-lg font-semibold leading-none">{value}</p>
        <p className="theme-text-muted mt-1 text-xs">{label}</p>
      </div>
    </div>
  );
}
