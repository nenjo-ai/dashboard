/** Normalize old push links while preserving any concrete conversation target. */
export function normalizeLegacyNotificationUrl(
  pathname: string,
  query: string,
): string | null {
  const params = new URLSearchParams(query);
  if (params.get("channel") !== "notifications") return null;
  params.delete("channel");
  return params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
}
