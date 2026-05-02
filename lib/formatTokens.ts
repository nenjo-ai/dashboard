export function formatCompactTokens(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return value.toLocaleString();
  if (abs < 1_000_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  if (abs < 1_000_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
}

export function formatExactTokens(value: number): string {
  return value.toLocaleString();
}
