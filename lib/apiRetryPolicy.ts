interface StatusError {
  status?: unknown;
}

/** Rate limits are retried only by an explicit user action or revalidation. */
export function shouldRetryDashboardRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return true;
  }

  return (error as StatusError).status !== 429;
}
