"use client";

import {
  buildWorkerCertificate,
  loadAccountSigningPublicKey,
  loadStoredAccountContentKey,
  loadStoredOrgContentKey,
  wrapAccountContentKeyForWorker,
  wrapOrgContentKeyForWorker,
} from "@/lib/cryptoContent";
import {
  fetchCurrentOrgContentKeyStatus,
  fetchWorkerApprovalKey,
  putWorkerApprovalKey,
} from "@/lib/api";
import type { WorkerEnrollmentStatusResponse, WrappedAccountContentKey, WrappedOrgContentKey } from "@/lib/types";
import type { WorkerCertificate } from "@/lib/types";

// ---------------------------------------------------------------------------
// Browser-side pairing attempt state (BOO-50)
// ---------------------------------------------------------------------------

/**
 * Temporary state kept in the initiating browser's localStorage so the
 * pairing link — which usually opens in a new tab — can find the onboarding
 * attempt it belongs to. Never contains the worker API key.
 */
export const PAIRING_ATTEMPT_SESSION_KEY = "nenjo_onboarding_pairing_attempt";

export interface PairingAttemptState {
  api_key_id: string;
  expires_at: string;
}

export function savePairingAttempt(attempt: PairingAttemptState): void {
  try {
    localStorage.setItem(
      PAIRING_ATTEMPT_SESSION_KEY,
      JSON.stringify(attempt),
    );
  } catch {
    // Storage failures degrade to manual code approval.
  }
}

export function loadPairingAttempt(): PairingAttemptState | null {
  try {
    const raw = localStorage.getItem(PAIRING_ATTEMPT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairingAttemptState;
    if (!parsed.api_key_id || !parsed.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPairingAttempt(): void {
  try {
    localStorage.removeItem(PAIRING_ATTEMPT_SESSION_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// URL fragment handling
// ---------------------------------------------------------------------------

export interface PairingFragment {
  token: string;
}

/**
 * Captured once per page load. React StrictMode double-invokes effects in
 * development: the first pass strips the fragment from the URL (by design),
 * so a naive second pass would read an empty hash and silently discard the
 * token. Memoizing the capture makes it idempotent across remounts.
 */
let capturedPairing: PairingFragment | null | undefined;

/**
 * Capture and remove the `#pair=<token>` fragment before normal navigation or
 * telemetry runs. Loading or previewing the URL must never consume the
 * attempt — this only reads the fragment.
 *
 * The token is an opaque one-time value minted by the platform at enrollment
 * registration; the harness to approve is resolved from the browser's
 * onboarding attempt state, and the platform verifies the token server-side.
 */
export function capturePairingFragment(): PairingFragment | null {
  if (capturedPairing !== undefined) return capturedPairing;
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#pair=")) {
    capturedPairing = null;
    return null;
  }
  const token = hash.slice("#pair=".length).trim();
  if (!token) {
    capturedPairing = null;
    return null;
  }
  // Remove the fragment from the address bar and history entry so the token
  // does not leak through referrers, screen sharing, or analytics.
  try {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  } catch {
    // ignore
  }
  capturedPairing = { token };
  return capturedPairing;
}

// ---------------------------------------------------------------------------
// Shared approval material
// ---------------------------------------------------------------------------

export interface RuntimeApprovalMaterial {
  certificate: WorkerCertificate;
  wrappedAck: WrappedAccountContentKey;
  wrappedOck: WrappedOrgContentKey | null;
  orgId: string;
}

/**
 * Build the browser-side approval payload shared by manual code approval and
 * automatic pairing approval: sign the worker certificate with the account
 * signing key and wrap the account/workspace content keys for the worker.
 * Plaintext content keys never leave the browser.
 */
export async function buildRuntimeApprovalMaterial(
  enrollment: WorkerEnrollmentStatusResponse,
  fallbackOrgId: string,
): Promise<RuntimeApprovalMaterial> {
  const [ack, signingPublicKey, orgContentStatus] = await Promise.all([
    loadStoredAccountContentKey(),
    loadAccountSigningPublicKey(),
    fetchCurrentOrgContentKeyStatus(),
  ]);
  if (!ack) {
    throw new Error(
      "This browser is missing the local account content key needed to approve the runtime.",
    );
  }
  if (!signingPublicKey) {
    throw new Error(
      "This browser is missing the account signing key needed to approve the runtime.",
    );
  }
  const orgId = orgContentStatus.org_id || fallbackOrgId;
  if (!orgId) {
    throw new Error("Could not resolve the workspace id for runtime approval.");
  }
  const localOck = await loadStoredOrgContentKey(
    orgContentStatus.org_id,
    orgContentStatus.key_version,
  );
  if (!localOck) {
    throw new Error(
      "This browser does not have the workspace content key needed to approve the runtime. Re-secure the workspace or restore from recovery.",
    );
  }

  // Keep the registered approval signing key in sync with this browser's
  // account signing key before signing the certificate.
  const remoteApprovalKey = await fetchWorkerApprovalKey().catch(() => ({
    public_key: null as string | null,
  }));
  if (remoteApprovalKey.public_key !== signingPublicKey) {
    await putWorkerApprovalKey(signingPublicKey);
  }

  const certificate = await buildWorkerCertificate({
    accountId: orgId,
    apiKeyId: enrollment.api_key_id,
    encPublicKey: enrollment.request.enc_public_key,
    signPublicKey: enrollment.request.sign_public_key,
  });
  const wrappedAck = await wrapAccountContentKeyForWorker({
    workerPublicKey: enrollment.request.enc_public_key,
  });
  const wrappedOck = await wrapOrgContentKeyForWorker({
    orgId,
    keyVersion: orgContentStatus.key_version,
    workerPublicKey: enrollment.request.enc_public_key,
  });

  return { certificate, wrappedAck, wrappedOck, orgId };
}
