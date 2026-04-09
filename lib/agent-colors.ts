/** 16-color palette for agent colors (matches backend COLOR_PALETTE). */
export const AGENT_COLOR_PALETTE = [
  "#0EA5E9", "#F59E0B", "#F43F5E", "#8B5CF6",
  "#6366F1", "#10B981", "#EC4899", "#14B8A6",
  "#EF4444", "#3B82F6", "#A855F7", "#22C55E",
  "#F97316", "#06B6D4", "#E11D48", "#84CC16",
] as const;

/** Parse hex (#RRGGBB) → [R, G, B] 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Light tinted background (15% opacity on white). */
export function agentColorBg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Darkened color (70%) for text on light backgrounds. */
export function agentColorText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const dark = (c: number) => Math.round(c * 0.7);
  return `rgb(${dark(r)}, ${dark(g)}, ${dark(b)})`;
}
