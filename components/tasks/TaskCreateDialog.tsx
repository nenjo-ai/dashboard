"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Zap } from "lucide-react";

import { createTask } from "@/lib/api";
import { useAgents, useProjects, useRoutines } from "@/lib/hooks";
import type { TaskPriority } from "@/lib/types";
import { ArtifactAttachmentComposer, useArtifactAttachments } from "@/components/artifacts/ArtifactAttachmentComposer";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const fieldClass = "theme-surface theme-border mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm";

export function TaskCreateDialog({
  open,
  onClose,
  onCreated,
  initialProjectId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialProjectId?: string;
}) {
  const router = useRouter();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const { routines } = useRoutines();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [target, setTarget] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [mode, setMode] = useState<"manual" | "scheduled">("manual");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const artifactAttachments = useArtifactAttachments();

  const reset = () => {
    setTitle("");
    setInstructions("");
    setProjectId(initialProjectId ?? "");
    setTarget("");
    setPriority("medium");
    setMode("manual");
    setError(null);
    artifactAttachments.clear();
  };
  const close = () => { if (!pending) { reset(); onClose(); } };
  const parseTarget = () => {
    if (!target) return null;
    const [type, id] = target.split(":", 2);
    return type === "agent" ? { type, id } as const : { type: "routine", id } as const;
  };

  const submit = async () => {
    if (!title.trim() || !artifactAttachments.isReady) return;
    setPending(true);
    setError(null);
    try {
      const task = await createTask({
        project_id: projectId || null,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        priority,
        execution_target: parseTarget(),
        artifact_ids: artifactAttachments.artifactIds,
      });
      reset();
      onClose();
      onCreated?.();
      router.push(`/dashboard/tasks/${task.id}${mode === "scheduled" ? "?tab=settings&setup=schedule" : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create task");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Create task">
      <div className="space-y-5 p-1">
        <div>
          <p className="theme-text text-sm font-medium">How should this task run?</p>
          <div className="theme-surface-muted theme-border mt-2 grid grid-cols-2 rounded-xl border p-1">
            {([
              { id: "manual", label: "On demand", icon: Zap },
              { id: "scheduled", label: "On a schedule", icon: CalendarClock },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${mode === id ? "theme-surface-elevated theme-border theme-text border shadow-xs" : "theme-text-muted"}`}
                key={id}
                onClick={() => setMode(id)}
                type="button"
              >
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          {mode === "scheduled" ? <p className="theme-text-muted mt-2 text-xs">You’ll set the schedule on the next screen.</p> : null}
        </div>
        <label className="theme-text block text-sm font-medium">Title
          <input autoFocus className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" />
        </label>
        <label className="theme-text block text-sm font-medium">Instructions
          <textarea className={`${fieldClass} min-h-28 resize-y`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Give the agent enough context to complete the work…" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="theme-text text-sm font-medium">Project
            <select className={fieldClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">No project</option>
              {projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="theme-text text-sm font-medium">Priority
            <select className={fieldClass} value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              {(["low", "medium", "high", "critical"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="theme-text text-sm font-medium">Dispatch to
            <select className={fieldClass} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">Choose later</option>
              <optgroup label="Agents">{agents?.map((agent) => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>)}</optgroup>
              <optgroup label="Routines">{routines?.map((routine) => <option key={routine.id} value={`routine:${routine.id}`}>{routine.name}</option>)}</optgroup>
            </select>
          </label>
        </div>
        <ArtifactAttachmentComposer
          attachments={artifactAttachments.attachments}
          canAdd={artifactAttachments.canAdd}
          disabled={pending}
          onAdd={artifactAttachments.addFiles}
          onRemove={artifactAttachments.remove}
          onRetry={artifactAttachments.retry}
        />
        {error ? <p className="text-sm text-red-500" role="alert">{error}</p> : null}
        <div className="theme-border flex justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button disabled={pending || !title.trim() || !artifactAttachments.isReady} isLoading={pending} onClick={submit}>
            {mode === "scheduled" ? "Create and schedule" : "Create task"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
