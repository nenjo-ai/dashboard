"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, GitBranch, ListTree, Pencil, PlayCircle, X } from "lucide-react";

import { updateRoutine } from "@/lib/api";
import { formatExecutionRelativeTime } from "@/lib/executionHistory";
import { toast } from "@/lib/toast";
import type { RoutineDetail } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

export function RoutineMasthead({
  routine,
  onUpdated,
}: {
  routine: RoutineDetail;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(routine.description ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDescription(routine.description ?? ""), [routine.description]);
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const cancel = () => {
    setDescription(routine.description ?? "");
    setEditing(false);
  };

  const save = useCallback(async () => {
    const nextDescription = description.trim();
    if (nextDescription === (routine.description ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateRoutine(routine.id, { description: nextDescription || null });
      setEditing(false);
      onUpdated();
      toast.success("Routine description updated.");
    } catch {
      setDescription(routine.description ?? "");
      toast.error("Failed to update the routine description.");
    } finally {
      setSaving(false);
    }
  }, [description, onUpdated, routine.description, routine.id]);

  return (
    <section className="theme-surface theme-border relative overflow-hidden rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] md:p-6 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      <div className="pointer-events-none absolute -right-16 -top-24 h-52 w-52 rounded-full bg-deep-space-blue-500/[0.07] blur-3xl dark:bg-deep-space-blue-400/[0.08]" aria-hidden="true" />
      <div className="relative flex min-w-0 gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
          <GitBranch className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="theme-text truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{routine.name}</h1>
            <code className="theme-surface-muted theme-border theme-text-muted rounded-md border px-2 py-0.5 text-[11px]">{routine.slug}</code>
            {routine.is_default ? <Badge variant="ready">Default</Badge> : null}
          </div>

          {editing ? (
            <div className="mt-3 flex max-w-2xl items-start gap-1.5">
              <textarea
                aria-label="Routine description"
                className="theme-surface theme-border theme-text min-h-20 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-hidden focus:border-deep-space-blue-400 focus:ring-1 focus:ring-deep-space-blue-400"
                disabled={saving}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void save();
                  if (event.key === "Escape") cancel();
                }}
                ref={textareaRef}
                value={description}
              />
              <button aria-label="Save routine description" className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" disabled={saving} onClick={() => void save()} type="button"><Check className="h-4 w-4" /></button>
              <button aria-label="Cancel editing routine description" className="theme-text-muted rounded-md p-1.5 hover:[background:var(--app-hover)]" disabled={saving} onClick={cancel} type="button"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button className="group mt-2 flex max-w-2xl items-start gap-1.5 text-left" onClick={() => setEditing(true)} type="button">
              <span className="theme-text-muted text-sm leading-6">{routine.description || "Add a short description to explain when this workflow should be used."}</span>
              <Pencil className="theme-text-muted mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              <span className="sr-only">Edit routine description</span>
            </button>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MetadataPill icon={<ListTree className="h-3 w-3" />} label={`${routine.steps.length} ${routine.steps.length === 1 ? "step" : "steps"}`} />
            <MetadataPill icon={<GitBranch className="h-3 w-3" />} label={`${routine.edges.length} ${routine.edges.length === 1 ? "route" : "routes"}`} />
            <MetadataPill icon={<PlayCircle className="h-3 w-3" />} label={routine.last_run_at ? `Last run ${formatExecutionRelativeTime(routine.last_run_at)}` : "Not run yet"} />
            <MetadataPill icon={<Clock3 className="h-3 w-3" />} label={`Updated ${formatExecutionRelativeTime(routine.updated_at)}`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function MetadataPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="theme-surface-muted theme-border theme-text-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
      {icon}
      {label}
    </span>
  );
}
