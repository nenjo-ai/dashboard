export const ACTIVE_ORG_STORAGE_KEY = "nenjo.active-org-id";

type ActiveOrgListener = () => void;

const listeners = new Set<ActiveOrgListener>();

function emitStoredActiveOrgIdChange(): void {
  listeners.forEach((listener) => listener());
}

export function readStoredActiveOrgId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function subscribeStoredActiveOrgId(
  listener: ActiveOrgListener,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_ORG_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function writeStoredActiveOrgId(orgId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (orgId?.trim()) {
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId.trim());
    } else {
      localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }

  emitStoredActiveOrgIdChange();
}
