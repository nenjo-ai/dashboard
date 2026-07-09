import { expect, test } from "@playwright/test";

test("vault unlock browser harness passes in a real browser", async ({ page }) => {
  await page.goto("/dev-harness/vault-unlock?run=1");

  const status = page.locator("#vault-harness-status");
  await expect(status).toHaveAttribute("data-status", "passed", {
    timeout: 60_000,
  });
  await expect(status).toHaveAttribute("data-passed", "4");
  await expect(page.locator("[data-test-status='failed']")).toHaveCount(0);
});

test("Chromium virtual authenticator returns WebAuthn PRF output", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "CDP WebAuthn virtual authenticators are Chromium-only.");

  await page.goto("/dev-harness/vault-unlock");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
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

  try {
    const result = await page.evaluate(async () => {
      const bytesToHex = (value: ArrayBuffer | undefined) => {
        if (!value) return null;
        return Array.from(new Uint8Array(value))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      };
      const randomBuffer = (length: number) => {
        const bytes = crypto.getRandomValues(new Uint8Array(length));
        return bytes.buffer as ArrayBuffer;
      };
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomBuffer(32),
          rp: {
            name: "Nenjo Harness",
            id: window.location.hostname,
          },
          user: {
            id: randomBuffer(16),
            name: "vault-harness@example.com",
            displayName: "Vault Harness",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
          extensions: {
            prf: {
              eval: {
                first: salt.buffer as ArrayBuffer,
              },
            },
          } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("Virtual authenticator did not create a credential.");
      }

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: randomBuffer(32),
          rpId: window.location.hostname,
          userVerification: "required",
          allowCredentials: [
            {
              type: "public-key",
              id: credential.rawId,
            },
          ],
          extensions: {
            prf: {
              eval: {
                first: salt.buffer as ArrayBuffer,
              },
            },
          } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error("Virtual authenticator did not return an assertion.");
      }

      const extensionResults = assertion.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
        prf?: {
          results?: {
            first?: ArrayBuffer;
          };
        };
      };
      const first = extensionResults.prf?.results?.first;
      return {
        credentialIdLength: credential.rawId.byteLength,
        prfOutputLength: first?.byteLength ?? 0,
        prfOutputHex: bytesToHex(first),
      };
    });

    expect(result.credentialIdLength).toBeGreaterThan(0);
    expect(result.prfOutputLength).toBe(32);
    expect(result.prfOutputHex).toMatch(/^[0-9a-f]{64}$/);
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    await cdp.send("WebAuthn.disable");
  }
});
