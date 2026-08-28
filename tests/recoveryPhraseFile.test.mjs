import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RECOVERY_PHRASE_FILENAME,
  RECOVERY_PHRASE_MIME_TYPE,
  isRecoveryDownloadComplete,
  recoveryPhraseFileContents,
} from "../lib/recoveryPhraseFile.ts";

const onboardingSource = await readFile(
  new URL(
    "../app/dashboard/onboarding/OnboardingContent.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("recovery phrase download uses a clear text filename and media type", () => {
  assert.equal(RECOVERY_PHRASE_FILENAME, "nenjo-recovery-phrase.txt");
  assert.equal(RECOVERY_PHRASE_MIME_TYPE, "text/plain;charset=utf-8");
});

test("recovery phrase file contains only the normalized phrase", () => {
  assert.equal(
    recoveryPhraseFileContents("  alpha   beta\ngamma  "),
    "alpha beta gamma\n",
  );
});

test("recovery phrase file rejects empty content", () => {
  assert.throws(
    () => recoveryPhraseFileContents("  \n  "),
    /recovery phrase is required/i,
  );
});

test("onboarding continues only after the recovery file is downloaded and acknowledged", () => {
  assert.equal(
    isRecoveryDownloadComplete({
      hasRecoveryBundle: true,
      recoveryFileDownloaded: true,
      backupAcknowledged: true,
    }),
    true,
  );

  for (const incomplete of [
    {
      hasRecoveryBundle: false,
      recoveryFileDownloaded: true,
      backupAcknowledged: true,
    },
    {
      hasRecoveryBundle: true,
      recoveryFileDownloaded: false,
      backupAcknowledged: true,
    },
    {
      hasRecoveryBundle: true,
      recoveryFileDownloaded: true,
      backupAcknowledged: false,
    },
  ]) {
    assert.equal(isRecoveryDownloadComplete(incomplete), false);
  }
});

test("onboarding step two downloads recovery instead of confirming phrase words", () => {
  assert.match(onboardingSource, /anchor\.download = RECOVERY_PHRASE_FILENAME/);
  assert.match(onboardingSource, /"Download recovery file"/);
  assert.match(onboardingSource, /disabled=\{!recoveryDownloadComplete\}/);
  assert.match(onboardingSource, /will not display its recovery contents on this screen/);
  assert.doesNotMatch(onboardingSource, /phraseWords/);
  assert.doesNotMatch(onboardingSource, /confirmWordA|confirmWordB|Type word #/);
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
