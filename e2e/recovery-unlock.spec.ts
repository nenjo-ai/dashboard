import { expect, test } from "@playwright/test";

// BOO-26 tier-1 E2E: the browser-side recovery crypto chain under a virtual
// WebAuthn authenticator with PRF support (Chromium CDP only).
//
// Tier boundaries (per the recovery plan):
//  - This suite proves the in-browser flow and state machine: PRF acquisition,
//    envelope AEAD/AAD behavior, and completion-statement signing.
//  - It does NOT prove real-credential PRF portability; the documented
//    real-device compatibility matrix (package 8) remains a separate,
//    non-CI requirement before enabling enrollment.

test("recovery harness passes with a PRF-capable virtual authenticator", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "CDP WebAuthn virtual authenticators are Chromium-only.");

  await page.goto("/dev-harness/recovery-unlock");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });

  const status = page.locator("#recovery-harness-status");
  await page.getByRole("button", { name: "Run Harness" }).click();
  await expect(status).toHaveAttribute("data-status", "passed", {
    timeout: 60_000,
  });
  await expect(status).toHaveAttribute("data-passed", "8");
  await expect(page.locator("[data-test-status='failed']")).toHaveCount(0);
});
