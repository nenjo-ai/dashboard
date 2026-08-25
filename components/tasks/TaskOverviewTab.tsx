"use client";

import type { Dispatch, SetStateAction } from "react";

import type { AgentDefinition, Project, RoutineSummary, TaskPriority, TaskWorkflowStatus } from "@/lib/types";
import { ArtifactAttachmentComposer, type useArtifactAttachments } from "@/components/artifacts/ArtifactAttachmentComposer";
import { InlineTaskLabels } from "./InlineTaskLabels";

const fieldClass = "theme-surface theme-border mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm";
type AttachmentsState = ReturnType<typeof useArtifactAttachments>;

export function TaskOverviewTab({
  title, setTitle, instructions, setInstructions, statusId, setStatusId, priority, setPriority,
  projectId, setProjectId, target, setTarget, labelIds, setLabelIds, dispatchMode,
  statuses, projects, agents, routines, pending, existingArtifactIds, setExistingArtifactIds,
  artifactAttachments,
}: {
  title: string; setTitle: Dispatch<SetStateAction<string>>;
  instructions: string; setInstructions: Dispatch<SetStateAction<string>>;
  statusId: string; setStatusId: Dispatch<SetStateAction<string>>;
  priority: TaskPriority; setPriority: Dispatch<SetStateAction<TaskPriority>>;
  projectId: string; setProjectId: Dispatch<SetStateAction<string>>;
  target: string; setTarget: Dispatch<SetStateAction<string>>;
  labelIds: string[]; setLabelIds: Dispatch<SetStateAction<string[]>>;
  dispatchMode: "manual" | "scheduled";
  statuses: TaskWorkflowStatus[] | undefined;
  projects: Project[] | undefined;
  agents: AgentDefinition[] | undefined;
  routines: RoutineSummary[] | undefined;
  pending: boolean;
  existingArtifactIds: string[];
  setExistingArtifactIds: Dispatch<SetStateAction<string[]>>;
  artifactAttachments: AttachmentsState;
}) {
  const artifactCount = existingArtifactIds.length + artifactAttachments.artifactIds.length;
  return (
    <section className="theme-surface theme-border space-y-6 rounded-2xl border p-4 sm:p-6">
      <div>
        <h2 className="theme-text text-base font-semibold">Task brief</h2>
        <p className="theme-text-muted mt-1 text-sm">Define the outcome, ownership, and context the agent receives.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="theme-text text-sm font-medium sm:col-span-2">Title<input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="theme-text text-sm font-medium sm:col-span-2">Instructions<textarea className={`${fieldClass} min-h-40 resize-y leading-6`} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        {dispatchMode === "manual" ? <label className="theme-text text-sm font-medium">Status<select className={fieldClass} value={statusId} onChange={(event) => setStatusId(event.target.value)}>{statuses?.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label> : null}
        <label className="theme-text text-sm font-medium">Priority<select className={fieldClass} value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{(["low", "medium", "high", "critical"] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="theme-text text-sm font-medium">Project<select className={fieldClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="theme-text text-sm font-medium">Dispatch to<select className={fieldClass} value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose an agent</option><optgroup label="Agents">{agents?.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>)}</optgroup><optgroup label="Routine workflows">{routines?.map((routine) => <option key={routine.id} value={`routine:${routine.id}`}>{routine.name}</option>)}</optgroup></select></label>
        <div><p className="theme-text mb-2 text-sm font-medium">Labels</p><InlineTaskLabels disabled={pending} onChange={setLabelIds} selectedIds={labelIds} /></div>
      </div>
      <div className="theme-border border-t pt-5">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="theme-text text-sm font-semibold">Input artifacts</h3><p className="theme-text-muted mt-0.5 text-xs">Files and context available to the assigned agent.</p></div><span className="theme-text-muted text-xs">{artifactCount}/16</span></div>
        {existingArtifactIds.length ? <div className="mb-3 flex flex-wrap gap-1.5">{existingArtifactIds.map((artifactId, index) => <span className="theme-border theme-surface-muted flex items-center gap-1 rounded-md border px-2 py-1 text-xs" key={artifactId}><span>Attachment {index + 1}</span><button type="button" className="theme-text-muted hover:theme-text" onClick={() => setExistingArtifactIds((current) => current.filter((id) => id !== artifactId))} aria-label={`Remove attachment ${index + 1}`}>×</button></span>)}</div> : null}
        <ArtifactAttachmentComposer attachments={artifactAttachments.attachments} canAdd={artifactAttachments.canAdd && artifactCount < 16} disabled={pending} onAdd={artifactAttachments.addFiles} onRemove={artifactAttachments.remove} onRetry={artifactAttachments.retry} />
      </div>
    </section>
  );
}
