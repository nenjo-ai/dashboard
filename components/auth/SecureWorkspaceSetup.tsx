"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildCurrentOrgContentKeyBootstrap,
  buildRecoveryBundle,
  buildTrustedDevicePayload,
  ensureAccountContentKey,
  ensureAccountSigningKeyPair,
  generateRecoveryPhrase,
  loadStoredOrgContentKey,
  storeRecoveryBundle,
} from "@/lib/cryptoContent";
import {
  bootstrapCurrentOrgContentKey,
  fetchCurrentOrgContentKeyStatus,
  putRecoveryBundle,
  putWorkerApprovalKey,
  upsertTrustedDevice,
} from "@/lib/api";
import type { RecoveryBundlePayload } from "@/lib/types";
import { Button } from "@/components/ui/Button";

const RECOVERY_DRAFT_SESSION_KEY = "nenjo_bootstrap_recovery_draft";

export function SecureWorkspaceSetup({
  userLabel,
  onContinue,
}: {
  userLabel: string;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryBundle, setRecoveryBundle] = useState<RecoveryBundlePayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmWordA, setConfirmWordA] = useState("");
  const [confirmWordB, setConfirmWordB] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const phraseWords = recoveryPhrase.split(" ").filter(Boolean);
  const promptIndexes = [2, 7] as const;
  const expectedWordA = phraseWords[promptIndexes[0]] ?? "";
  const expectedWordB = phraseWords[promptIndexes[1]] ?? "";
  const confirmed =
    confirmWordA.trim().toLowerCase() === expectedWordA &&
    confirmWordB.trim().toLowerCase() === expectedWordB;

  const initializeWorkspace = useCallback(async (regeneratePhrase = false) => {
    setError(null);
    setLoading(true);
    try {
      await ensureAccountContentKey();
      const { publicKey } = await ensureAccountSigningKeyPair();
      await putWorkerApprovalKey(publicKey);
      const trustedDevice = await buildTrustedDevicePayload({
        deviceLabel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "browser",
      });
      await upsertTrustedDevice(trustedDevice);

      let nextPhrase = "";
      let nextBundle: RecoveryBundlePayload | null = null;
      const storedDraft = !regeneratePhrase
        ? sessionStorage.getItem(RECOVERY_DRAFT_SESSION_KEY)
        : null;

      if (storedDraft) {
        const parsed = JSON.parse(storedDraft) as {
          phrase: string;
          bundle: RecoveryBundlePayload;
        };
        nextPhrase = parsed.phrase;
        nextBundle = parsed.bundle;
      } else {
        nextPhrase = generateRecoveryPhrase();
        nextBundle = await buildRecoveryBundle(nextPhrase);
        sessionStorage.setItem(
          RECOVERY_DRAFT_SESSION_KEY,
          JSON.stringify({ phrase: nextPhrase, bundle: nextBundle }),
        );
      }

      setRecoveryPhrase(nextPhrase);
      setRecoveryBundle(nextBundle);
      setConfirmWordA("");
      setConfirmWordB("");
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to secure this workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the recovery phrase to your clipboard.");
    }
  }, [recoveryPhrase]);

  const handleContinue = useCallback(async () => {
    if (!recoveryBundle || !confirmed) return;
    setSubmitting(true);
    try {
      await storeRecoveryBundle(recoveryBundle);
      await putRecoveryBundle(recoveryBundle);
      const orgContentKeyStatus = await fetchCurrentOrgContentKeyStatus();
      await loadStoredOrgContentKey(
        orgContentKeyStatus.org_id,
        orgContentKeyStatus.key_version,
      );
      const bootstrap = await buildCurrentOrgContentKeyBootstrap({
        orgId: orgContentKeyStatus.org_id,
        keyVersion: orgContentKeyStatus.key_version,
      });
      await bootstrapCurrentOrgContentKey(bootstrap);
      sessionStorage.removeItem(RECOVERY_DRAFT_SESSION_KEY);
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store the recovery bundle.");
    } finally {
      setSubmitting(false);
    }
  }, [confirmed, onContinue, recoveryBundle]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Secure Your Workspace</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This device is generating your local content key, approval signing key, and an encrypted recovery bundle for account <span className="font-medium text-gray-700 dark:text-gray-200">{userLabel}</span>.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-deep-space-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generating local encryption material and recovery bundle...
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {!loading && recoveryPhrase ? (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Save this recovery phrase now. It protects the encrypted recovery bundle created for your account.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {phraseWords.map((word, index) => (
              <div
                key={`${word}-${index}`}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <span className="mr-2 text-xs text-gray-400 dark:text-gray-500">{index + 1}.</span>
                {word}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                copied
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {copied ? "Copied!" : "Copy recovery phrase"}
            </button>
            <button
              type="button"
              onClick={() => void initializeWorkspace(true)}
              className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Regenerate phrase
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Word {promptIndexes[0] + 1}
              </span>
              <input
                value={confirmWordA}
                onChange={(event) => setConfirmWordA(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Word {promptIndexes[1] + 1}
              </span>
              <input
                value={confirmWordB}
                onChange={(event) => setConfirmWordB(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
          </div>

          <Button
            onClick={() => void handleContinue()}
            isLoading={submitting}
            disabled={!confirmed}
            className="w-full"
          >
            Continue
          </Button>
        </>
      ) : null}
    </div>
  );
}
