"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";

import { createTaskLabel, updateTaskLabel } from "@/lib/api";
import { useTaskLabels } from "@/lib/hooks";
import { DEFAULT_TASK_LABEL_COLOR } from "@/lib/task-label-colors";
import { TaskLabelColorPicker } from "./TaskLabelColorPicker";

interface InlineTaskLabelsProps {
  selectedIds: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => Promise<void> | void;
}

const inputClass =
  "theme-surface theme-border min-w-0 rounded-md border px-2 py-1.5 text-xs";

/** Linear-style inline label picker with assignment, creation, and editing. */
export function InlineTaskLabels({
  selectedIds,
  disabled = false,
  onChange,
}: InlineTaskLabelsProps) {
  const { labels = [], mutate } = useTaskLabels();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_TASK_LABEL_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery("");
    setName("");
    setColor(DEFAULT_TASK_LABEL_COLOR);
    setEditingId(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, open]);

  const selected = labels.filter((label) => selectedIds.includes(label.id));
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? labels.filter((label) =>
          label.name.toLocaleLowerCase().includes(normalized),
        )
      : labels;
  }, [labels, query]);

  const toggle = async (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id];
    setBusy(true);
    setError(null);
    try {
      await onChange(next);
      closePicker();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to update labels",
      );
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const label = await createTaskLabel({ name: trimmed, color });
      await mutate((current = []) => [...current, label], { revalidate: false });
      setName("");
      await onChange([...selectedIds, label.id]);
      closePicker();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create label");
    } finally {
      setBusy(false);
    }
  };

  const saveDefinition = async (id: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTaskLabel(id, { name: trimmed, color });
      await mutate(
        (current = []) => current.map((label) => (label.id === id ? updated : label)),
        { revalidate: false },
      );
      setEditingId(null);
      setName("");
      closePicker();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update label");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={pickerRef}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {selected.map((label) => (
          <span
            className="theme-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
            key={label.id}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            {label.name}
          </span>
        ))}
        <div className="relative">
          <button
            aria-expanded={open}
            aria-haspopup="dialog"
            className="theme-border theme-text-muted flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
            disabled={disabled}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <Plus size={12} /> Labels
          </button>
          {open ? (
            <div
              className="theme-surface-elevated theme-border absolute left-0 z-50 mt-2 w-72 rounded-lg border p-2 shadow-xl"
              role="dialog"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <input
                  aria-label="Search labels"
                  className={`${inputClass} min-w-0 flex-1`}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search labels…"
                  value={query}
                />
                <button
                  aria-label="Close labels"
                  className="theme-text-muted rounded p-1.5"
                  onClick={closePicker}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {filtered.map((label) => (
                  <div className="flex items-center gap-1" key={label.id}>
                    <button
                      className="hover:theme-surface-muted flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                      disabled={disabled || busy}
                      onClick={() => void toggle(label.id)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="theme-text min-w-0 flex-1 truncate">
                        {label.name}
                      </span>
                      {selectedIds.includes(label.id) ? (
                        <Check size={13} />
                      ) : null}
                    </button>
                    <button
                      aria-label={`Edit ${label.name}`}
                      className="theme-text-muted rounded p-1.5"
                      onClick={() => {
                        setEditingId(label.id);
                        setName(label.name);
                        setColor(label.color);
                      }}
                      type="button"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="theme-border mt-2 space-y-2 border-t pt-2">
                <TaskLabelColorPicker
                  disabled={disabled || busy}
                  onChange={setColor}
                  value={color}
                />
                <div className="flex items-center gap-2">
                  <input
                    aria-label={editingId ? "Edit label name" : "New label name"}
                    className={`${inputClass} flex-1`}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void (editingId ? saveDefinition(editingId) : create());
                    }}
                    placeholder={editingId ? "Label name" : "Create a label…"}
                    value={name}
                  />
                  <button
                    className="theme-text rounded px-2 py-1 text-xs font-medium"
                    disabled={disabled || busy || !name.trim()}
                    onClick={() =>
                      void (editingId ? saveDefinition(editingId) : create())
                    }
                    type="button"
                  >
                    {editingId ? "Save" : "Add"}
                  </button>
                </div>
              </div>
              {editingId ? (
                <button
                  className="theme-text-muted mt-1 text-xs"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setColor(DEFAULT_TASK_LABEL_COLOR);
                  }}
                  type="button"
                >
                  Cancel edit
                </button>
              ) : null}
              {error ? (
                <p className="mt-2 text-xs text-red-500">{error}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {!selected.length ? (
        <p className="theme-text-muted text-xs">No labels assigned.</p>
      ) : null}
    </div>
  );
}
