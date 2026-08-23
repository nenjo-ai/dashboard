import { LIVE_PREVIEW_KEY, PENDING_AGENT_KEY, TOOLS_KEY } from "./constants.ts";
import type { ActiveToolEntry } from "./types";

export function readPendingAgentId(): string | null {
  try {
    return sessionStorage.getItem(PENDING_AGENT_KEY);
  } catch {
    return null;
  }
}

export function writePendingAgentId(agentId: string | null): void {
  try {
    if (agentId) sessionStorage.setItem(PENDING_AGENT_KEY, agentId);
    else sessionStorage.removeItem(PENDING_AGENT_KEY);
  } catch {
    // Browser persistence is best-effort; the active reducer remains canonical.
  }
}

export function isBrowserReload(): boolean {
  if (typeof performance === "undefined") return false;
  const [navigation] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  return navigation?.type === "reload";
}

export function readPersistedTools(): ActiveToolEntry[] {
  try {
    const raw = sessionStorage.getItem(TOOLS_KEY);
    return raw ? (JSON.parse(raw) as ActiveToolEntry[]) : [];
  } catch {
    return [];
  }
}

export function writePersistedTools(tools: ActiveToolEntry[]): void {
  try {
    if (tools.length > 0)
      sessionStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
    else sessionStorage.removeItem(TOOLS_KEY);
  } catch {
    // Best-effort transient recovery only.
  }
}

export function readPersistedLivePreview(): string | undefined {
  try {
    return sessionStorage.getItem(LIVE_PREVIEW_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writePersistedLivePreview(preview?: string): void {
  try {
    const next = preview?.trim();
    if (next) sessionStorage.setItem(LIVE_PREVIEW_KEY, next);
    else sessionStorage.removeItem(LIVE_PREVIEW_KEY);
  } catch {
    // Best-effort transient recovery only.
  }
}
