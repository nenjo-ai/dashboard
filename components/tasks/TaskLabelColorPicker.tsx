"use client";

import { Check } from "lucide-react";

import { TASK_LABEL_COLORS } from "@/lib/task-label-colors";

interface TaskLabelColorPickerProps {
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

/** Accessible fixed-palette selector for task-label colors. */
export function TaskLabelColorPicker({
  value,
  disabled = false,
  onChange,
}: TaskLabelColorPickerProps) {
  return (
    <div aria-label="Label color" className="flex flex-wrap gap-1.5" role="group">
      {TASK_LABEL_COLORS.map((color) => {
        const selected = value.toLocaleUpperCase() === color.value;
        return (
          <button
            aria-label={color.name}
            aria-pressed={selected}
            className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--app-surface-elevated)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deep-space-blue-400 disabled:opacity-50"
            disabled={disabled}
            key={color.value}
            onClick={() => onChange(color.value)}
            style={{
              backgroundColor: color.value,
              boxShadow: selected
                ? `0 0 0 2px var(--app-surface-elevated), 0 0 0 4px ${color.value}`
                : undefined,
            }}
            title={color.name}
            type="button"
          >
            {selected ? (
              <Check className="text-white drop-shadow" size={13} strokeWidth={3} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
