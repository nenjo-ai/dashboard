import type { TraceEventPage } from "./types";

export const TRACE_EVENT_PAGE_LIMIT = 500;

/** Follow a strictly advancing trace cursor until the server reports EOF. */
export async function collectTraceEventPages<T>(
  loadPage: (after: number, limit: number) => Promise<TraceEventPage<T>>,
): Promise<TraceEventPage<T>> {
  const events: T[] = [];
  let after = 0;
  let truncated = false;

  for (;;) {
    const page = await loadPage(after, TRACE_EVENT_PAGE_LIMIT);
    events.push(...page.events);
    truncated ||= page.truncated;
    if (!page.has_more) {
      return { events, truncated, has_more: false, next_after: null };
    }
    if (page.next_after === null || page.next_after <= after) {
      throw new Error("Trace event pagination did not advance");
    }
    after = page.next_after;
  }
}
