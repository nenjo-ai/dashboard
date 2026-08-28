import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard exposes vLLM as a dedicated model provider", async () => {
  const [types, modelsSection, agentForm, onboarding] = await Promise.all([
    readFile(new URL("../lib/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/agents/ModelsSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/agents/AgentFormModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/onboarding/OnboardingContent.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(types, /\| "vllm"/);
  assert.match(types, /id: "vllm",\s+label: "vLLM \(Local\)"/);

  for (const surface of [modelsSection, agentForm]) {
    assert.match(surface, /form\.provider === "vllm"/);
    assert.match(surface, /http:\/\/localhost:8000\/v1/);
  }

  assert.match(onboarding, /setModel\(providerInfo\.models\[0\] \?\? ""\)/);
  assert.match(onboarding, /provider === "vllm" \|\| provider === "openai-compatible"/);
  assert.match(onboarding, /base_url: endpoint \|\| undefined/);
  assert.match(onboarding, /http:\/\/localhost:8000\/v1/);
});
