import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [onboardingSource, modelsSource] = await Promise.all([
  readFile(
    new URL(
      "../app/dashboard/onboarding/OnboardingContent.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../components/agents/ModelsSection.tsx", import.meta.url),
    "utf8",
  ),
]);

test("onboarding collects and saves an optional model context window", () => {
  assert.match(onboardingSource, /id="nenji-context-window"/);
  assert.match(onboardingSource, /Number\.isSafeInteger\(parsedContextWindow\)/);
  assert.match(onboardingSource, /context_window: parsedContextWindow/);
});

test("Models tab exposes and validates the model context window", () => {
  assert.match(modelsSource, /<Label>Context window<\/Label>/);
  assert.match(modelsSource, /value=\{form\.contextWindow \?\? ""\}/);
  assert.match(modelsSource, /setField\(\s*"contextWindow"/);
  assert.match(modelsSource, /Number\.isSafeInteger\(form\.contextWindow\)/);
  assert.match(modelsSource, /context_window: form\.contextWindow/);
  assert.match(modelsSource, /Leave blank to use the provider default/);
});
