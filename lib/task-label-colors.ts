/** Curated, reusable colors for organization task labels. */
export const TASK_LABEL_COLORS = [
  { name: "Slate", value: "#64748B" },
  { name: "Red", value: "#EF4444" },
  { name: "Orange", value: "#F97316" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Lime", value: "#84CC16" },
  { name: "Green", value: "#22C55E" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
] as const;

export const DEFAULT_TASK_LABEL_COLOR = TASK_LABEL_COLORS[0].value;
