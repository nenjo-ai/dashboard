import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboardingSource = await readFile(
  new URL(
    "../app/dashboard/onboarding/OnboardingContent.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("legacy recovery-phrase bundle path is fully removed from onboarding", () => {
  assert.doesNotMatch(onboardingSource, /buildRecoveryBundle|generateRecoveryPhrase|storeRecoveryBundle|putRecoveryBundle|RECOVERY_DRAFT_SESSION_KEY/);
});

test("onboarding creates worker credentials only after an explicit action", () => {
  assert.match(onboardingSource, /Generate worker key/);
  assert.match(onboardingSource, /onClick=\{\(\) => void createWorkerKey\(\)\}/);
  assert.doesNotMatch(onboardingSource, /\/\/ Auto-create key/);
});

test("onboarding uses workspace language and honest connection placeholders", () => {
  assert.match(onboardingSource, /Name your workspace/);
  assert.match(onboardingSource, /Create workspace/);
  assert.match(onboardingSource, /paste-your-worker-key-here/);
  assert.doesNotMatch(onboardingSource, /Create Your Organization|Organization Name/);
  assert.doesNotMatch(onboardingSource, /maskedKey/);
});
