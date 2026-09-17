import assert from "node:assert/strict";
import test from "node:test";

import {
  clearFreshOnboardingInProgress,
  clearFreshOnboardingProgress,
  isFreshOnboardingInProgress,
  loadFreshOnboardingProgress,
  markFreshOnboardingInProgress,
  saveFreshOnboardingProgress,
  shouldSkipEntryGateRedirectForFreshOnboarding,
} from "../lib/onboardingProgress.mjs";

// Minimal sessionStorage mock (node has none).
class SessionStorageMock {
  #map = new Map();
  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(key, value) {
    this.#map.set(key, String(value));
  }
  removeItem(key) {
    this.#map.delete(key);
  }
}

test.beforeEach(() => {
  globalThis.window = { sessionStorage: new SessionStorageMock() };
});

test.afterEach(() => {
  delete globalThis.window;
});

test("fresh onboarding flag suppresses the entry-gate dashboard redirect", () => {
  assert.equal(isFreshOnboardingInProgress(), false);
  assert.equal(shouldSkipEntryGateRedirectForFreshOnboarding(), false);

  markFreshOnboardingInProgress();
  assert.equal(isFreshOnboardingInProgress(), true);
  assert.equal(shouldSkipEntryGateRedirectForFreshOnboarding(), true);

  clearFreshOnboardingInProgress();
  assert.equal(shouldSkipEntryGateRedirectForFreshOnboarding(), false);
});

test("fresh onboarding flag expires after the TTL", () => {
  markFreshOnboardingInProgress();
  // Age the flag past the 30-minute TTL.
  const storage = globalThis.window.sessionStorage;
  storage.setItem("nenjo.onboarding.fresh-in-progress", String(Date.now() - 31 * 60 * 1000));
  assert.equal(isFreshOnboardingInProgress(), false);
});

test("onboarding progress survives a remount and validates its shape", () => {
  assert.equal(loadFreshOnboardingProgress(), null);

  saveFreshOnboardingProgress({ mode: "fresh", step: 2 });
  assert.deepEqual(loadFreshOnboardingProgress(), { mode: "fresh", step: 2 });

  saveFreshOnboardingProgress({ mode: "restore", step: 1 });
  assert.deepEqual(loadFreshOnboardingProgress(), { mode: "restore", step: 1 });

  saveFreshOnboardingProgress({ mode: "fresh", step: 99 });
  assert.deepEqual(loadFreshOnboardingProgress(), { mode: "fresh", step: 99 });

  saveFreshOnboardingProgress({ mode: "sideways", step: 2 });
  assert.equal(loadFreshOnboardingProgress(), null, "invalid mode rejected");

  saveFreshOnboardingProgress({ mode: "fresh", step: 0 });
  assert.equal(loadFreshOnboardingProgress(), null, "invalid step rejected");

  clearFreshOnboardingProgress();
  assert.equal(loadFreshOnboardingProgress(), null);
});

test("clearing the flag also clears progress", () => {
  markFreshOnboardingInProgress();
  saveFreshOnboardingProgress({ mode: "fresh", step: 3 });
  clearFreshOnboardingInProgress();
  assert.equal(loadFreshOnboardingProgress(), null);
  assert.equal(isFreshOnboardingInProgress(), false);
});

test("missing sessionStorage degrades to no-op", () => {
  delete globalThis.window;
  assert.doesNotThrow(() => markFreshOnboardingInProgress());
  assert.equal(isFreshOnboardingInProgress(), false);
  assert.doesNotThrow(() => clearFreshOnboardingInProgress());
});
