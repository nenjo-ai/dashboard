"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useRoutine,
  useAgents,
  useCouncils,
  useRoutineExecutions,
  useTasks,
} from "@/lib/hooks";
import { updateRoutine } from "@/lib/api";
import { TopBar } from "@/components/layout/TopBar";
import { PageContent } from "@/components/ui/PageContent";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { RoutineEditor } from "@/components/routine/RoutineEditor";
import { TaskList } from "@/components/project/TaskList";
import { TaskExecutionHistory } from "@/components/tasks/TaskExecutionHistory";

export function RoutineDetailClient({ routineRef }: { routineRef: string }) {
  const id = routineRef;
  const router = useRouter();

  const { routine, isLoading, isError, mutate: mutateRoutine } = useRoutine(id);
  const { agents, isLoading: agentsLoading } = useAgents();
  const { councils } = useCouncils();
  const { tasks, isLoading: tasksLoading, isError: tasksError, mutate: mutateTasks } = useTasks({ routine_id: id });
  const {
    executions,
    isLoading: executionsLoading,
    isError: executionsError,
    mutate: mutateExecutions,
  } = useRoutineExecutions(id);

  const handleSaved = useCallback(() => {
    mutateRoutine();
  }, [mutateRoutine]);

  // ── Loading / Error ─────────────────────────────────────────────────────
  if (isLoading || agentsLoading) {
    return (
      <>
        <TopBar title="Routine" />
        <PageContent>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
          <div className="mt-4 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
        </PageContent>
      </>
    );
  }

  if (isError || !routine) {
    return (
      <>
        <TopBar title="Routine" />
        <PageContent>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              Routine not found or failed to load.
            </p>
          </div>
        </PageContent>
      </>
    );
  }

  return (
    <>
      <TopBar title={routine.name} />
      <PageContent>
        {/* Back + header */}
        <div className="mb-1">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/routines")}>
            <BackArrow />
            Routines
          </Button>
        </div>

        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
              {routine.name}
            </h2>
            <div className="mt-1">
              <InlineDescription
                routineId={routine.id}
                value={routine.description}
                onSaved={handleSaved}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={routine.is_active ? "active" : "inactive"}>
              {routine.is_active ? "Active" : "Inactive"}
            </Badge>
            {routine.is_default && <Badge variant="ready">Default</Badge>}
          </div>
        </div>

        <div className="space-y-5">
          <div
            className="theme-border theme-surface overflow-hidden rounded-xl border"
            style={{ height: "calc(100vh - 18rem)" }}
          >
            <RoutineEditor
              routine={routine}
              agents={agents ?? []}
              councils={councils}
              onSaved={handleSaved}
            />
          </div>
          <TaskExecutionHistory
            executions={executions}
            isError={executionsError}
            isLoading={executionsLoading}
            onRefresh={() => {
              void mutateExecutions();
              void mutateTasks();
            }}
          />
          <section>
            <h2 className="theme-text mb-3 font-semibold">Assigned tasks</h2>
            <TaskList
              isError={tasksError}
              isLoading={tasksLoading}
              onDeleted={() => mutateTasks()}
              tasks={tasks}
            />
          </section>
        </div>
      </PageContent>
    </>
  );
}

// ---------------------------------------------------------------------------
// Back arrow icon
// ---------------------------------------------------------------------------

function BackArrow() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable description (reused pattern)
// ---------------------------------------------------------------------------

function InlineDescription({
  routineId,
  value,
  onSaved,
}: {
  routineId: string;
  value: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateRoutine(routineId, { description: trimmed });
      onSaved();
    } catch {
      setDraft(value ?? "");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, value, routineId, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder="Add a description..."
        className="w-full rounded-sm border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 disabled:opacity-50"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-full text-left group flex items-center gap-1"
      title="Click to edit description"
    >
      <span className={value ? "" : "italic"}>
        {value || "Add a description..."}
      </span>
      <svg
        className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 shrink-0"
        fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
      </svg>
    </button>
  );
}
