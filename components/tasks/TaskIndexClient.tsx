"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import type { TaskFilters } from "@/lib/api";
import {
  useAgents,
  useCurrentOrg,
  useOrgMembers,
  useProjects,
  useQueryParam,
  useRoutines,
  useTaskLabels,
  useTasks,
  useTaskStatuses,
} from "@/lib/hooks";
import { partitionTasksByDispatch } from "@/lib/taskLifecycle";
import { useSafeRouter } from "@/lib/safeRouter";
import {
  selectTaskWorkspaceTasks,
  summarizeTaskWorkspace,
  type TaskWorkspaceView,
} from "@/lib/taskWorkspace";
import { TaskList } from "@/components/project/TaskList";
import { TaskWorkspaceSummary } from "@/components/tasks/TaskWorkspaceSummary";
import { Button } from "@/components/ui/Button";

const filterClass = "theme-surface theme-border min-w-0 rounded-xl border px-3 py-2.5 text-sm";

/** Organization-wide task work queue with URL-backed, shareable filter state. */
export function TaskIndexClient() {
  const router = useSafeRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query = "", setQuery] = useQueryParam("q", "");
  const [rawView = "all", setView] = useQueryParam("view", "all");
  const [statusId = "", setStatusId] = useQueryParam("status", "");
  const [projectId = "", setProjectId] = useQueryParam("project", "");
  const [labelId = "", setLabelId] = useQueryParam("label", "");
  const [assigneeId = "", setAssigneeId] = useQueryParam("assignee", "");
  const [agentId = "", setAgentId] = useQueryParam("agent", "");
  const [routineId = "", setRoutineId] = useQueryParam("routine", "");
  const view: TaskWorkspaceView = rawView === "manual" || rawView === "scheduled" ? rawView : "all";
  const deferredQuery = useDeferredValue(query);
  const filters = useMemo<TaskFilters>(() => ({
    status_id: statusId || undefined,
    project_id: projectId || undefined,
    label_id: labelId || undefined,
    assignee_user_id: assigneeId || undefined,
    assigned_agent_id: agentId || undefined,
    routine_id: routineId || undefined,
  }), [agentId, assigneeId, labelId, projectId, routineId, statusId]);

  const { tasks, isLoading, isError, mutate } = useTasks(filters, 3000);
  const { statuses } = useTaskStatuses();
  const { labels } = useTaskLabels();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const { routines } = useRoutines();
  const { currentOrg } = useCurrentOrg();
  const { members } = useOrgMembers(currentOrg?.org_id);
  const allTasks = useMemo(() => tasks ?? [], [tasks]);
  const partitioned = useMemo(() => partitionTasksByDispatch(allTasks), [allTasks]);
  const summary = useMemo(() => summarizeTaskWorkspace(allTasks), [allTasks]);
  const visibleTasks = useMemo(
    () => selectTaskWorkspaceTasks(allTasks, view, deferredQuery),
    [allTasks, deferredQuery, view],
  );
  const activeFilterCount = [statusId, projectId, labelId, assigneeId, agentId, routineId].filter(Boolean).length;
  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["status", "project", "label", "assignee", "agent", "routine"]) params.delete(key);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };
  const viewOptions: Array<{ id: TaskWorkspaceView; label: string; count: number }> = [
    { id: "all", label: "All", count: allTasks.length },
    { id: "manual", label: "Manual", count: partitioned.manual.length },
    { id: "scheduled", label: "Scheduled", count: partitioned.scheduled.length },
  ];

  return (
    <div className="space-y-4">
      <TaskWorkspaceSummary summary={summary} />
      <section className="theme-surface theme-border space-y-3 rounded-2xl border p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search tasks</span>
            <Search className="theme-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              className={`${filterClass} w-full pl-9`}
              onChange={(event) => setQuery(event.target.value || undefined)}
              placeholder="Search title, ID, project, or label…"
              type="search"
              value={query}
            />
          </label>
          <div className="theme-surface-muted theme-border grid grid-cols-3 rounded-xl border p-1 lg:w-auto" aria-label="Task view">
            {viewOptions.map((option) => (
              <button
                aria-pressed={view === option.id}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${view === option.id ? "theme-surface-elevated theme-border theme-text border shadow-xs" : "theme-text-muted"}`}
                key={option.id}
                onClick={() => setView(option.id === "all" ? undefined : option.id)}
                type="button"
              >
                {option.label} <span className="ml-1 opacity-70">{option.count}</span>
              </button>
            ))}
          </div>
          <Button variant="secondary" className="justify-between lg:hidden" onClick={() => setShowFilters((visible) => !visible)}>
            <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Filters</span>
            {activeFilterCount ? <span className="theme-selection-accent-soft theme-selected-text rounded-full px-2 py-0.5 text-[11px] font-semibold">{activeFilterCount}</span> : null}
          </Button>
        </div>
        <div className={`${showFilters ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4`}>
          <select aria-label="Workflow status" className={filterClass} value={statusId} onChange={(event) => setStatusId(event.target.value || undefined)}>
            <option value="">All statuses</option>{statuses?.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select>
          <select aria-label="Project" className={filterClass} value={projectId} onChange={(event) => setProjectId(event.target.value || undefined)}>
            <option value="">All projects</option>{projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select aria-label="Assignee" className={filterClass} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value || undefined)}>
            <option value="">All assignees</option>{members?.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>)}
          </select>
          <button className="theme-text-muted flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium hover:[background:var(--app-hover)]" onClick={() => setShowAdvanced((visible) => !visible)} type="button">
            More filters <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
          {showAdvanced ? <>
            <select aria-label="Label" className={filterClass} value={labelId} onChange={(event) => setLabelId(event.target.value || undefined)}>
              <option value="">All labels</option>{labels?.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
            </select>
            <select aria-label="Agent" className={filterClass} value={agentId} onChange={(event) => setAgentId(event.target.value || undefined)}>
              <option value="">All agents</option>{agents?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
            <select aria-label="Routine" className={filterClass} value={routineId} onChange={(event) => setRoutineId(event.target.value || undefined)}>
              <option value="">All routines</option>{routines?.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}
            </select>
          </> : null}
          {activeFilterCount ? <button className="theme-text-muted flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium hover:[background:var(--app-hover)]" onClick={clearFilters} type="button"><X className="h-3.5 w-3.5" />Clear {activeFilterCount}</button> : null}
        </div>
      </section>
      <TaskList
        description={view === "all" ? "Manual and scheduled work in one prioritized queue" : view === "manual" ? "On-demand work dispatched by a person" : "Worker-owned recurring work"}
        emptyMessage={query || activeFilterCount ? "Try clearing a search or filter to broaden the queue." : view === "scheduled" ? "Create a task and choose On a schedule to automate recurring work." : "Create the first task to start organizing work."}
        heading={view === "all" ? "Work queue" : view === "manual" ? "Manual tasks" : "Scheduled tasks"}
        isError={isError}
        isLoading={isLoading}
        onDeleted={() => mutate()}
        statusDisplay={view === "scheduled" ? "scheduled" : "workflow"}
        tasks={visibleTasks}
      />
    </div>
  );
}
