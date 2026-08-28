import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeRuntimeVerificationCode,
  runtimeApprovalCanSubmit,
} from "../lib/runtimeApproval.ts";

test("runtime approval requires a non-empty normalized verification code and local key authority", () => {
  assert.equal(normalizeRuntimeVerificationCode("  verify-123  "), "verify-123");
  assert.equal(runtimeApprovalCanSubmit({ verificationCode: " ", hasAccountContentKey: true, hasSigningKey: true, busy: false }), false);
  assert.equal(runtimeApprovalCanSubmit({ verificationCode: "verify-123", hasAccountContentKey: false, hasSigningKey: true, busy: false }), false);
  assert.equal(runtimeApprovalCanSubmit({ verificationCode: "verify-123", hasAccountContentKey: true, hasSigningKey: true, busy: false }), true);
  assert.equal(runtimeApprovalCanSubmit({ verificationCode: "verify-123", hasAccountContentKey: true, hasSigningKey: true, busy: true }), false);
});

test("Settings lazily loads rich tabs and gives every workspace explicit context", async () => {
  const page = await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");

  assert.match(page, /dynamic\(\(\) => import\("@\/components\/settings\/OrgSettingsSection"\)/);
  assert.match(page, /general: \{ eyebrow:/);
  assert.match(page, /runtime: \{ eyebrow:/);
  assert.match(page, /devices: \{ eyebrow:/);
  assert.match(page, /keys: \{ eyebrow:/);
  assert.match(page, /Runtime trust/);
});

test("runtime and onboarding approvals submit typed verification codes instead of displaying request secrets", async () => {
  const [runtime, onboarding] = await Promise.all([
    readFile(new URL("../components/settings/ContentEncryptionSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/onboarding/OnboardingContent.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(runtime, /verification_code: verificationCode/);
  assert.match(runtime, /Enter the code shown in the runtime before approving/);
  assert.doesNotMatch(runtime, /enrollment\.request\.verification_code/);
  assert.match(onboarding, /aria-label="Runtime verification code"/);
  assert.match(onboarding, /verification_code: verificationCode/);
  assert.doesNotMatch(onboarding, /auto-approving|request\.verification_code/);
});

test("Settings loading and progress surfaces avoid rotating spinners", async () => {
  const sources = await Promise.all([
    "../app/dashboard/settings/page.tsx",
    "../components/settings/ApiKeysSection.tsx",
    "../components/settings/ContentEncryptionSection.tsx",
    "../components/settings/UnlockMethodsSection.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

  for (const source of sources) assert.doesNotMatch(source, /animate-spin/);
});
