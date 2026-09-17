"use client";

import {
  finishPasskeyRecoveryRegistration,
  registerPasskeyUnlockCredential,
  revokeUnlockCredential,
  startPasskeyRecoveryRegistration,
} from "./api";
import { createPasskeyWithCeremony } from "./webauthnCeremony";
import { enrollRecoveryForUnlockCredential } from "./recoveryMethods";
import {
  listLocalPasskeyUnlockMethods,
  setupPasskeyUnlock,
  unlockWithPasskeyPrf,
} from "./cryptoContent";
import { commitPasskeyUnlockRegistration } from "./passkeyRegistrationCommit";
import { tryPasskeyUnlockMethods } from "./passkeyUnlockFlow";

export { tryPasskeyUnlockMethods } from "./passkeyUnlockFlow";

type PrfClientExtensionResults = AuthenticationExtensionsClientOutputs & {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
};

type PublicKeyCredentialWithPrf = PublicKeyCredential & {
  response: AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;
  getClientExtensionResults(): PrfClientExtensionResults;
};

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
  return bytesToBase64Url(new Uint8Array(value));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function randomChallenge(): ArrayBuffer {
  return bytesToArrayBuffer(crypto.getRandomValues(new Uint8Array(32)));
}

function prfOutputFromCredential(credential: PublicKeyCredentialWithPrf): Uint8Array | null {
  const output = credential.getClientExtensionResults().prf?.results?.first;
  if (!output) return null;
  return new Uint8Array(output as ArrayBuffer);
}

function requirePrfOutput(credential: PublicKeyCredentialWithPrf): Uint8Array {
  const output = prfOutputFromCredential(credential);
  if (!output) {
    throw new Error("This passkey did not return WebAuthn PRF output.");
  }
  return output;
}

function credentialTransports(response: AuthenticatorAttestationResponse): string[] {
  const transports = response.getTransports?.() ?? [];
  return Array.from(transports);
}

export function canUsePasskeyPrf(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function" &&
    typeof crypto?.subtle !== "undefined"
  );
}

export async function registerPasskeyUnlock(
  accountId: string,
  label?: string | null,
): Promise<{ recoveryEnrolled: boolean }> {
  if (!canUsePasskeyPrf()) {
    throw new Error("Device unlock requires a secure browser context with WebAuthn support.");
  }

  // Server-verified registration ceremony: the platform issues the challenge
  // and verifies the attestation against its configured RP/origin allowlist.
  // PRF extension inputs are client-side only.
  const options = await startPasskeyRecoveryRegistration();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { responseJson, credentialId } = await createPasskeyWithCeremony({
    publicKey: {
      ...options.publicKey,
      extensions: {
        ...((options.publicKey.extensions as Record<string, unknown> | undefined) ?? {}),
        prf: { eval: { first: bytesToBase64Url(salt) } },
      },
    },
  });

  const prfOutput = await requestPrfOutputForNewCredentialId(credentialId, salt);

  const registered = await commitPasskeyUnlockRegistration({
    registerRemote: async () => {
      const attestationResponse = responseJson.response as {
        attestationObject: string;
        clientDataJSON: string;
        transports?: string[];
      };
      const legacy = await registerPasskeyUnlockCredential({
        credential_id: credentialId,
        credential_type: "public-key",
        public_key: {
          raw_id: credentialId,
          attestation_object: attestationResponse.attestationObject,
          client_data_json: attestationResponse.clientDataJSON,
        },
        transports: attestationResponse.transports ?? [],
        label: label?.trim() || null,
        client_response: {
          id: credentialId,
          type: "public-key",
        },
      });
      // Promote the same credential to server-verified so it can bind as a
      // recovery factor. Best-effort: local unlock works without it.
      try {
        await finishPasskeyRecoveryRegistration({
          ceremony_id: options.ceremony_id,
          response: responseJson,
          label: label?.trim() || null,
        });
      } catch (error) {
        console.warn("Device unlock credential could not be promoted to server-verified:", error);
      }
      return legacy;
    },
    setupLocal: () =>
      setupPasskeyUnlock({
        accountId,
        credentialId,
        label: label?.trim() || null,
        salt,
        prfOutput,
      }),
    revokeRemote: (registered) => revokeUnlockCredential(registered.id),
  });

  // Recovery rides along: the unlock passkey becomes the durable recovery
  // factor automatically. Never fail the unlock setup because of it.
  let recoveryEnrolled = true;
  try {
    await enrollRecoveryForUnlockCredential({
      credentialRowId: registered.id,
      credentialId,
      prfOutput,
      prfInput: salt,
      label: label?.trim() || null,
    });
  } catch (error) {
    recoveryEnrolled = false;
    console.warn("Automatic account recovery enrollment failed:", error);
  }

  return { recoveryEnrolled };
}

/// Follow-up assertion against the just-created credential to obtain PRF
/// output when registration did not return it directly. Browser-local only.
async function requestPrfOutputForNewCredentialId(
  credentialId: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      rpId: window.location.hostname,
      userVerification: "required",
      allowCredentials: [
        {
          type: "public-key",
          id: bytesToArrayBuffer(base64UrlToBytes(credentialId)),
        },
      ],
      extensions: {
        prf: {
          eval: {
            first: bytesToArrayBuffer(salt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  }).catch(() => null)) as PublicKeyCredentialWithPrf | null;
  if (!assertion) {
    throw new Error("Device unlock setup was cancelled.");
  }
  return requirePrfOutput(assertion);
}

export async function unlockWithAnyLocalPasskey(accountId: string): Promise<void> {
  if (!canUsePasskeyPrf()) {
    throw new Error("Device unlock requires a secure browser context with WebAuthn support.");
  }

  const localMethods = await listLocalPasskeyUnlockMethods(accountId);
  if (localMethods.length === 0) {
    throw new Error("No local device unlock method is configured on this browser.");
  }

  await tryPasskeyUnlockMethods(localMethods, async (method) => {
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: window.location.hostname,
        userVerification: "required",
        allowCredentials: [
          {
            type: "public-key",
            id: bytesToArrayBuffer(base64UrlToBytes(method.credential_id)),
          },
        ],
        extensions: {
          prf: {
            eval: {
              first: bytesToArrayBuffer(base64UrlToBytes(method.salt)),
            },
          },
        } as AuthenticationExtensionsClientInputs,
      },
    }).catch(() => null)) as PublicKeyCredentialWithPrf | null;
    if (!credential) {
      return false;
    }
    const prfOutput = requirePrfOutput(credential);
    await unlockWithPasskeyPrf({
      credentialId: method.credential_id,
      prfOutput,
      accountId,
    });
    return true;
  });
}

