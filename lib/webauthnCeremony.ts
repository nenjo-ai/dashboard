"use client";

// WebAuthn ceremony client helpers (BOO-26 package 4).
//
// Converts the server's webauthn-rs challenge JSON into browser
// PublicKeyCredential options, runs the ceremony, and serializes only the
// allowlisted response fields for server verification. Client extension
// results (including PRF output) never leave the browser except as explicit
// return values to the local caller.

export type ServerCreationOptions = {
  publicKey: Record<string, unknown>;
};

export type ServerRequestOptions = {
  publicKey: Record<string, unknown>;
};

type Base64UrlString = string;

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4), "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function arrayBufferToBase64Url(value: ArrayBuffer): Base64UrlString {
  return bytesToBase64Url(new Uint8Array(value));
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

type JsonWithBuffers = Record<string, unknown>;

/// Recursively converts base64url strings in known WebAuthn option fields to
/// ArrayBuffers for the browser API.
function convertOptions(value: unknown): unknown {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(convertOptions);
  }
  if (typeof value === "object" && value !== null) {
    const out: JsonWithBuffers = {};
    for (const [key, item] of Object.entries(value as JsonWithBuffers)) {
      if (key === "challenge" && typeof item === "string") {
        out[key] = toBufferSource(base64UrlToBytes(item));
      } else if (key === "user" && typeof item === "object" && item !== null) {
        const user = { ...(item as JsonWithBuffers) };
        if (typeof user.id === "string") {
          user.id = toBufferSource(base64UrlToBytes(user.id as string));
        }
        out[key] = user;
      } else if (key === "eval" && typeof item === "object" && item !== null) {
        // WebAuthn PRF evaluation inputs are ArrayBuffer or ArrayBufferView.
        const evalInputs = { ...(item as JsonWithBuffers) };
        for (const evalKey of ["first", "second"] as const) {
          const evalValue = evalInputs[evalKey];
          if (typeof evalValue === "string") {
            evalInputs[evalKey] = toBufferSource(base64UrlToBytes(evalValue));
          }
        }
        out[key] = evalInputs;
      } else if (key === "excludeCredentials" && Array.isArray(item)) {
        out[key] = item.map((credential) => {
          const entry = { ...(credential as JsonWithBuffers) };
          if (typeof entry.id === "string") {
            entry.id = toBufferSource(base64UrlToBytes(entry.id as string));
          }
          return entry;
        });
      } else if (key === "allowCredentials" && Array.isArray(item)) {
        out[key] = item.map((credential) => {
          const entry = { ...(credential as JsonWithBuffers) };
          if (typeof entry.id === "string") {
            entry.id = toBufferSource(base64UrlToBytes(entry.id as string));
          }
          return entry;
        });
      } else {
        out[key] = convertOptions(item);
      }
    }
    return out;
  }
  return value;
}

type WebAuthnError = DOMException & { name: string };

async function runCreate(options: unknown): Promise<PublicKeyCredential> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: options as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
    if (!credential) {
      throw new Error("Passkey creation was cancelled.");
    }
    return credential;
  } catch (error) {
    const name = (error as WebAuthnError)?.name;
    if (name === "NotAllowedError") {
      throw new Error("Passkey creation was cancelled or timed out.");
    }
    throw error;
  }
}

async function runGet(options: unknown): Promise<PublicKeyCredential> {
  try {
    const credential = (await navigator.credentials.get({
      publicKey: options as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    if (!credential) {
      throw new Error("Passkey verification was cancelled.");
    }
    return credential;
  } catch (error) {
    const name = (error as WebAuthnError)?.name;
    if (name === "NotAllowedError") {
      throw new Error("Passkey verification was cancelled or timed out.");
    }
    throw error;
  }
}

function attestationResponseJson(credential: PublicKeyCredential): JsonWithBuffers {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      // Public transport metadata; part of the allowlisted ceremony fields.
      transports: response.getTransports?.() ?? [],
    },
  };
}

function assertionResponseJson(credential: PublicKeyCredential): JsonWithBuffers {
  const response = credential.response as AuthenticatorAssertionResponse;
  const serialized: JsonWithBuffers = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
    },
  };
  if (response.userHandle) {
    serialized.response = {
      ...(serialized.response as JsonWithBuffers),
      userHandle: arrayBufferToBase64Url(response.userHandle),
    };
  }
  return serialized;
}

type PrfClientExtensionResults = AuthenticationExtensionsClientOutputs & {
  prf?: {
    enabled?: boolean;
    results?: { first?: ArrayBuffer };
  };
};

function prfOutputFrom(credential: PublicKeyCredential): Uint8Array | null {
  const results = (credential.getClientExtensionResults() as PrfClientExtensionResults).prf
    ?.results?.first;
  return results ? new Uint8Array(results) : null;
}

/// Runs a server-issued registration ceremony and returns the allowlisted
/// response JSON for server verification plus the created credential id.
export async function createPasskeyWithCeremony(
  options: ServerCreationOptions,
): Promise<{ responseJson: JsonWithBuffers; credentialId: string }> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof navigator.credentials?.create !== "function"
  ) {
    throw new Error("Passkeys require a secure browser context with WebAuthn support.");
  }
  const credential = await runCreate(convertOptions(options.publicKey));
  return {
    responseJson: attestationResponseJson(credential),
    credentialId: credential.id,
  };
}

/// Runs a server-issued assertion ceremony. When `prfSalt` is given, the PRF
/// extension is evaluated locally and the output is returned to the caller
/// only — it is never included in the serialized response.
export async function assertWithCeremony(params: {
  options: ServerRequestOptions;
  prfSalt?: Uint8Array;
}): Promise<{ responseJson: JsonWithBuffers; prfOutput: Uint8Array | null }> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof navigator.credentials?.get !== "function"
  ) {
    throw new Error("Passkeys require a secure browser context with WebAuthn support.");
  }
  const publicKey = {
    ...(convertOptions(params.options.publicKey) as JsonWithBuffers),
  };
  if (params.prfSalt) {
    publicKey.extensions = {
      ...((publicKey.extensions as JsonWithBuffers | undefined) ?? {}),
      prf: {
        eval: {
          first: toBufferSource(params.prfSalt),
        },
      },
    };
  }
  const credential = await runGet(publicKey);
  const prfOutput = params.prfSalt ? prfOutputFrom(credential) : null;
  if (params.prfSalt && !prfOutput) {
    throw new Error("This passkey did not return WebAuthn PRF output.");
  }
  return {
    responseJson: assertionResponseJson(credential),
    prfOutput,
  };
}
