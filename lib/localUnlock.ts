"use client";

import {
  fetchPasskeyRegistrationOptions,
  registerPasskeyUnlockCredential,
  revokeUnlockCredential,
} from "./api";
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

async function requestPrfOutputForNewCredential(
  credential: PublicKeyCredentialWithPrf,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const registrationPrf = credential.getClientExtensionResults().prf;
  if (registrationPrf?.enabled === false) {
    throw new Error("This passkey does not support WebAuthn PRF.");
  }

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
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
            first: bytesToArrayBuffer(salt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredentialWithPrf | null;

  if (!assertion) {
    throw new Error("Device unlock setup was cancelled.");
  }
  return requirePrfOutput(assertion);
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

export async function registerPasskeyUnlock(accountId: string, label?: string | null): Promise<void> {
  if (!canUsePasskeyPrf()) {
    throw new Error("Device unlock requires a secure browser context with WebAuthn support.");
  }

  const options = await fetchPasskeyRegistrationOptions();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: {
        name: "Nenjo",
        id: window.location.hostname,
      },
      user: {
        id: bytesToArrayBuffer(new TextEncoder().encode(options.user_id)),
        name: options.user_name,
        displayName: options.user_display_name,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      excludeCredentials: options.existing_credential_ids.map((id) => ({
        type: "public-key",
        id: bytesToArrayBuffer(base64UrlToBytes(id)),
      })),
      extensions: {
        prf: {
          eval: {
            first: bytesToArrayBuffer(salt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredentialWithPrf | null;

  if (!credential) {
    throw new Error("Device unlock setup was cancelled.");
  }
  const prfOutput = prfOutputFromCredential(credential) ??
    (await requestPrfOutputForNewCredential(credential, salt));
  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = arrayBufferToBase64Url(credential.rawId);

  await commitPasskeyUnlockRegistration({
    registerRemote: () =>
      registerPasskeyUnlockCredential({
        credential_id: credentialId,
        credential_type: "public-key",
        transports: credentialTransports(response),
        public_key: {
          raw_id: credentialId,
          attestation_object: arrayBufferToBase64Url(response.attestationObject),
          client_data_json: arrayBufferToBase64Url(response.clientDataJSON),
        },
        label: label?.trim() || null,
        client_response: {
          id: credential.id,
          type: credential.type,
        },
      }),
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

/// Ceremony for the account-recovery restore flow: obtains fresh WebAuthn PRF
/// output for the recovery salt using the enrolled passkey. Only the public
/// PRF input travels in the request; PRF output never leaves this module's
/// caller (the recovery crypto layer).
export async function requestPrfOutputForRestore(params: {
  prfSalt: Uint8Array;
  credentialId: string | null;
}): Promise<Uint8Array> {
  if (!canUsePasskeyPrf()) {
    throw new Error("Passkey recovery requires a secure browser context with WebAuthn support.");
  }

  const allowCredentials = params.credentialId
    ? [
        {
          type: "public-key" as const,
          id: bytesToArrayBuffer(base64UrlToBytes(params.credentialId)),
        },
      ]
    : undefined;

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      rpId: window.location.hostname,
      userVerification: "required",
      ...(allowCredentials ? { allowCredentials } : {}),
      extensions: {
        prf: {
          eval: {
            first: bytesToArrayBuffer(params.prfSalt),
          },
        },
      } as AuthenticationExtensionsClientInputs,
    },
  }).catch(() => null)) as PublicKeyCredentialWithPrf | null;

  if (!credential) {
    throw new Error("Passkey restore was cancelled.");
  }
  return requirePrfOutput(credential);
}
