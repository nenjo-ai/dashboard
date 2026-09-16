"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { useAppAuth } from "@/components/auth/AppAuth";
import {
  approveWorkerEnrollment,
  fetchWorkerEnrollment,
  fetchWorkerStatus,
  listWorkerEnrollments,
  pairApproveWorkerEnrollment,
} from "@/lib/api";
import { useWorkerStatus } from "@/lib/hooks";
import { normalizeRuntimeVerificationCode } from "@/lib/runtimeApproval";
import {
  buildRuntimeApprovalMaterial,
  capturePairingFragment,
  clearPairingAttempt,
  loadPairingAttempt,
  type PairingFragment,
} from "@/lib/workerPairing";
import type { WorkerEnrollmentStatusResponse } from "@/lib/types";
import { useSafeRouter } from "@/lib/safeRouter";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { LocalVaultUnlockGate } from "@/components/auth/LocalVaultUnlockGate";
import {
  NENJI_GREETING_DELAY_MS,
  primeNenjiWelcome,
  type PrimedWelcome,
} from "@/lib/nenjiWelcome";
import { NenjiPrimingCard } from "@/components/onboarding/NenjiPrimingCard";

type PairingPhase =
  | "capturing"
  | "auto-approving"
  | "approved-waiting"
  | "connected"
  | "manual-confirm"
  | "error";

const LOCKED_VAULT_MESSAGE =
  "Encrypted workspace vault is locked. Unlock it before approving this harness.";


async function withLockedVaultMessage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await Promise.resolve(operation());
  } catch (err) {
    if (err instanceof Error && /vault is locked/i.test(err.message)) {
      throw new Error(LOCKED_VAULT_MESSAGE);
    }
    throw err;
  }
}

/**
 * Landing page for the harness terminal pairing link
 * (`/dashboard/onboarding/harness#pair=<one-time-token>`).
 *
 * Rendered behind the local vault unlock gate: the link usually opens in a
 * NEW tab where the in-memory vault is empty, so the gate first restores (or
 * prompts for) the vault unlock before any approval is attempted — this is
 * the "login/unlock continuation" from the pairing plan.
 *
 * Automatic approval only happens when every check passes: the fragment
 * matches a fresh onboarding attempt in this browser, the signed-in user and
 * workspace match it, the browser vault is unlocked (enforced by the gate),
 * and the pairing token verifies on the backend. Any other situation falls
 * back to a confirmation page keyed to the terminal's verification code
 * (RFC 8628-style), mitigating phishing via arbitrary links.
 */
export default function HarnessPairingContent() {
  return (
    <LocalVaultUnlockGate>
      <HarnessPairingInner />
    </LocalVaultUnlockGate>
  );
}

function HarnessPairingInner() {
  const { user, isLoaded } = useAppAuth();
  const router = useSafeRouter();
  const [fragment, setFragment] = useState<PairingFragment | null>(null);
  const [phase, setPhase] = useState<PairingPhase>("capturing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<WorkerEnrollmentStatusResponse | null>(null);
  const [approvalCode, setApprovalCode] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [nenjiPrimed, setNenjiPrimed] = useState<PrimedWelcome | null>(null);
  const attemptedAutoApprove = useRef(false);

  // Capture and strip the fragment before anything else (navigation,
  // telemetry). Loading or previewing the URL never consumes the attempt.
  useEffect(() => {
    setFragment(capturePairingFragment());
    setPhase("capturing");
  }, []);

  const finishConnected = useCallback(() => {
    setPhase("connected");
    clearPairingAttempt();
    // Prime Nenji exactly like the normal onboarding connect step: create the
    // welcome session, seed the greeting, brief priming pause, then chat.
    (async () => {
      try {
        const displayName =
          user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "there";
        const primed = await primeNenjiWelcome(displayName);
        setNenjiPrimed(primed);
        window.setTimeout(() => {
          router.push(
            primed ? `/dashboard/chat?session=${primed.sessionId}` : "/dashboard/chat",
          );
        }, NENJI_GREETING_DELAY_MS);
      } catch {
        setNenjiPrimed(null);
        router.push("/dashboard/chat");
      }
    })();
  }, [router, user]);

  // Automatic approval path: every check must pass. Expiry is enforced
  // authoritatively by the platform — the browser only needs the attempt to
  // know which harness this link belongs to.
  const runAutoApprove = useCallback(
    async (pairing: PairingFragment) => {
      setPhase("auto-approving");
      setErrorMessage(null);
      try {
        const attempt = loadPairingAttempt();
        if (!attempt) {
          setErrorMessage(
            "No onboarding attempt was found in this browser. Open the pairing link from the same browser where you created the worker key, or restart onboarding to generate a new link.",
          );
          setPhase("manual-confirm");
          return;
        }
        const apiKeyId = attempt.api_key_id;

        const status = await fetchWorkerEnrollment(apiKeyId);
        setEnrollment(status);
        if (status.state !== "pending") {
          if (status.state === "active") {
            setPhase("approved-waiting");
          } else {
            setErrorMessage("This harness enrollment is no longer pending. Re-run the startup command to register again.");
            setPhase("error");
          }
          return;
        }

        const material = await withLockedVaultMessage(() =>
          buildRuntimeApprovalMaterial(status, ""),
        );
        await pairApproveWorkerEnrollment(apiKeyId, {
          pairing_token: pairing.token,
          certificate: material.certificate,
          wrapped_ack: material.wrappedAck,
          wrapped_ock: material.wrappedOck,
        });
        setPhase("approved-waiting");
      } catch (err) {
        if (isLockedVaultError(err)) {
          setErrorMessage(
            "Unlock your workspace vault in this browser, then reopen the pairing link from the terminal.",
          );
        } else {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Automatic pairing failed. Confirm the code shown in the terminal instead.",
          );
        }
        setPhase("manual-confirm");
      }
    },
    [],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) return;
    if (attemptedAutoApprove.current) return;
    if (!fragment) {
      setErrorMessage(
        "No pairing token was found in this link. Reopen the exact link printed by the harness terminal.",
      );
      setPhase("manual-confirm");
      return;
    }
    attemptedAutoApprove.current = true;
    void runAutoApprove(fragment);
  }, [fragment, isLoaded, runAutoApprove, user]);

  // Redirect signed-out visitors to login; they return here afterwards.
  useEffect(() => {
    if (isLoaded && !user) {
      const timeout = setTimeout(() => {
        router.replace("/dashboard/login?returnTo=/dashboard/onboarding/harness");
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded, router, user]);

  // Poll the enrollment: show "Approved — waiting for harness" until that
  // exact enrollment connects. Another connected worker never satisfies it.
  const approvedApiKeyId = enrollment?.api_key_id ?? null;
  useEffect(() => {
    if (phase !== "approved-waiting" || !approvedApiKeyId) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const status = await fetchWorkerEnrollment(approvedApiKeyId);
          setEnrollment(status);
          if (status.state !== "active") return;
          // Connected requires live worker presence for this exact api key.
          const workerStatus = await fetchWorkerStatus();
          const thisWorker = (workerStatus.workers ?? []).find(
            (worker) => worker.api_key_id === approvedApiKeyId,
          );
          if (thisWorker?.connected) {
            finishConnected();
          }
        } catch {
          // keep polling
        }
      })();
    }, 3000);
    return () => clearInterval(interval);
  }, [approvedApiKeyId, finishConnected, phase]);

  // Manual confirmation fallback (phishing mitigation per RFC 8628 §3.3.1).
  const handleManualApprove = useCallback(async () => {
    if (!approvalCode.trim()) return;
    setApprovalBusy(true);
    setErrorMessage(null);
    try {
      const status =
        enrollment ??
        (await (async () => {
          const pending = (await listWorkerEnrollments()).find(
            (item) => item.state === "pending",
          );
          if (!pending) {
            throw new Error(
              "No pending harness registration found. Run the startup command first, then retry.",
            );
          }
          return pending;
        })());
      setEnrollment(status);
      const material = await withLockedVaultMessage(() =>
        buildRuntimeApprovalMaterial(status, ""),
      );
      await approveWorkerEnrollment(status.api_key_id, {
        verification_code: normalizeRuntimeVerificationCode(approvalCode),
        certificate: material.certificate,
        wrapped_ack: material.wrappedAck,
        wrapped_ock: material.wrappedOck,
      });
      setApprovalCode("");
      setPhase("approved-waiting");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to approve this harness.",
      );
    } finally {
      setApprovalBusy(false);
    }
  }, [approvalCode, enrollment]);

  return (
    <div className="theme-app-bg flex min-h-screen items-center justify-center p-6">
      <div className="theme-border theme-surface w-full max-w-2xl space-y-5 rounded-2xl border p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="theme-text text-lg font-semibold">Connect this harness</h1>
            <p className="theme-text-muted text-xs">
              One-time pairing link for your Nenjo workspace.
            </p>
          </div>
        </div>

        {phase === "capturing" || (isLoaded && !user) ? (
          <LoadingStatus
            label="Checking pairing link"
            description={
              isLoaded && !user
                ? "Sign in to continue connecting this harness."
                : "Validating the one-time pairing token."
            }
          />
        ) : null}

        {phase === "auto-approving" ? (
          <LoadingStatus
            label="Approving harness"
            description="Verifying the pairing token against this browser's onboarding session."
          />
        ) : null}

        {phase === "approved-waiting" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">Approved — waiting for harness</span>
            </div>
            <p className="theme-text-muted text-sm leading-6">
              The harness was approved. This page finishes automatically as soon
              as that exact harness connects.
            </p>
            <LoadingStatus label="Waiting for the harness to connect" />
          </div>
        ) : null}

        {phase === "connected" ? (
          <div className="space-y-3">
            <NenjiPrimingCard
              roleId={nenjiPrimed?.roleId ?? "nenji"}
              color={nenjiPrimed?.color ?? "#b8841a"}
              animate
              headline="Priming Nenji"
              subline="Preparing your first Nenji chat."
              chips={[
                "Worker link: stable",
                `Priming for at least ${Math.round(NENJI_GREETING_DELAY_MS / 1000)} seconds`,
              ]}
            />
          </div>
        ) : null}

        {phase === "manual-confirm" ? (
          <div className="space-y-4">
            {errorMessage ? (
              <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
                {errorMessage}
              </div>
            ) : null}
            <p className="theme-text-muted text-sm leading-6">
              This link could not be approved automatically. To protect your
              workspace, confirm the verification code shown in the harness
              terminal before granting access.
            </p>
            <Input
              aria-label="Harness verification code"
              autoComplete="one-time-code"
              className="font-mono tracking-[0.12em]"
              onChange={(event) => setApprovalCode(event.target.value)}
              placeholder="Enter verification code"
              spellCheck={false}
              value={approvalCode}
            />
            <Button
              className="w-full"
              disabled={!approvalCode.trim()}
              isLoading={approvalBusy}
              onClick={() => void handleManualApprove()}
            >
              Approve harness
            </Button>
            <p className="theme-text-muted text-center text-xs">
              Not expecting this?{" "}
              <Link className="underline underline-offset-4" href="/dashboard">
                Go to your workspace
              </Link>
            </p>
          </div>
        ) : null}

        {phase === "error" && errorMessage ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
              {errorMessage}
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => router.replace("/dashboard")}
            >
              Go to workspace
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function isLockedVaultError(err: unknown): boolean {
  return err instanceof Error && err.message === LOCKED_VAULT_MESSAGE;
}
