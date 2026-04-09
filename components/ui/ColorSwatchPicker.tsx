"use client";

import { AGENT_COLOR_PALETTE } from "@/lib/agent-colors";

interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export function ColorSwatchPicker({
  value,
  onChange,
  disabled,
}: ColorSwatchPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {AGENT_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          className="h-7 w-7 rounded-full border-2 transition-all disabled:opacity-50"
          style={{
            backgroundColor: color,
            borderColor: value === color ? color : "transparent",
            boxShadow:
              value === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : "none",
          }}
          title={color}
        />
      ))}
    </div>
  );
}
