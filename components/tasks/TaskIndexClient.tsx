"use client";

import { useMemo, useState } from "react";

import {
  useAgents,
  useCurrentOrg,
  useOrgMembers,
  useProjects,
  useRoutines,
  useTaskLabels,
  useTasks,
  useTaskStatuses,
} from "@/lib/hooks";
import type { TaskFilters } from "@/lib/api";
import { partitionTasksByDispatch } from "@/lib/taskLifecycle";
import { TaskList } from "@/components/project/TaskList";

const filterClass = "theme-surface theme-border rounded-lg border px-3 py-2 text-sm";

/** Organization-wide task browser with independently cached filter catalogs. */
export function TaskIndexClient() {
  const [statusId, setStatusId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [labelId, setLabelId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [routineId, setRoutineId] = useState("");
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
  const partitionedTasks = useMemo(
    () => partitionTasksByDispatch(tasks ?? []),
    [tasks],
  );

  return (
    <div className="space-y-4">
      <div className="theme-surface theme-border grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-6">
        <select aria-label="Workflow status" className={filterClass} value={statusId} onChange={(event) => setStatusId(event.target.value)}>
          <option value="">All statuses</option>
          {statuses?.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
        </select>
        <select aria-label="Project" className={filterClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">All projects</option>
          {projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select aria-label="Label" className={filterClass} value={labelId} onChange={(event) => setLabelId(event.target.value)}>
          <option value="">All labels</option>
          {labels?.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
        </select>
        <select aria-label="Assignee" className={filterClass} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">All assignees</option>
          {members?.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>)}
        </select>
        <select aria-label="Agent" className={filterClass} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          <option value="">All agents</option>
          {agents?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        <select aria-label="Routine" className={filterClass} value={routineId} onChange={(event) => setRoutineId(event.target.value)}>
          <option value="">All routines</option>
          {routines?.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}
        </select>
      </div>
      <div className="space-y-4">
        <TaskList
          description="On-demand work dispatched by a person"
          emptyMessage="No manual tasks match these filters."
          heading="Manual tasks"
          isError={isError}
          isLoading={isLoading}
          onDeleted={() => mutate()}
          tasks={partitionedTasks.manual}
        />
        <TaskList
          description="Worker-owned recurring work"
          emptyMessage="No scheduled tasks match these filters."
          heading="Scheduled tasks"
          isError={isError}
          isLoading={isLoading}
          onDeleted={() => mutate()}
          showCreate={false}
          statusDisplay="scheduled"
          tasks={partitionedTasks.scheduled}
        />
      </div>
    </div>
  );
}
