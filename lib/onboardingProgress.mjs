// Fresh-onboarding progress tracking (BOO-26 UX fix).
//
// The onboarding page can be remounted by background re-checks (vault gate
// re-checks, SWR revalidations). While a fresh onboarding flow is in
// progress, the entry gate must not redirect the user to the dashboard just
// because their local keys now exist — that made onboarding kick users out
// mid-flow. Progress (mode + step) is persisted alongside the flag so a
// remount resumes where the user was instead of restarting at step 1.

const FLAG_KEY = "nenjo.onboarding.fresh-in-progress";
const PROGRESS_KEY = "nenjo.onboarding.fresh-progress";

const FLAG_TTL_MS = 30 * 60 * 1000;

function safeSession() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function markFreshOnboardingInProgress() {
  const storage = safeSession();
  if (!storage) return;
  storage.setItem(FLAG_KEY, String(Date.now()));
}

export function clearFreshOnboardingInProgress() {
  const storage = safeSession();
  if (!storage) return;
  storage.removeItem(FLAG_KEY);
  storage.removeItem(PROGRESS_KEY);
}

export function isFreshOnboardingInProgress() {
  const storage = safeSession();
  if (!storage) return false;
  const raw = storage.getItem(FLAG_KEY);
  if (!raw) return false;
  const markedAt = Number(raw);
  if (!Number.isFinite(markedAt) || Date.now() - markedAt > FLAG_TTL_MS) {
    clearFreshOnboardingInProgress();
    return false;
  }
  return true;
}

export function saveFreshOnboardingProgress(progress) {
  const storage = safeSession();
  if (!storage) return;
  storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function loadFreshOnboardingProgress() {
  const storage = safeSession();
  if (!storage) return null;
  const raw = storage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      (parsed.mode === "fresh" || parsed.mode === "restore") &&
      typeof parsed.step === "number" &&
      Number.isInteger(parsed.step) &&
      parsed.step >= 1
    ) {
      return { mode: parsed.mode, step: parsed.step };
    }
  } catch {
    // fall through
  }
  return null;
}

export function clearFreshOnboardingProgress() {
  const storage = safeSession();
  if (!storage) return;
  storage.removeItem(PROGRESS_KEY);
}

/**
 * Entry-gate guard: the redirect to the dashboard that fires when local keys
 * exist must be suppressed while a fresh onboarding flow is in progress —
 * otherwise background remounts eject the user mid-setup.
 */
export function shouldSkipEntryGateRedirectForFreshOnboarding() {
  return isFreshOnboardingInProgress();
}
