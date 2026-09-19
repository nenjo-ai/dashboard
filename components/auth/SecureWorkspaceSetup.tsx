"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildCurrentOrgContentKeyBootstrap,
  buildTrustedDevicePayload,
  ensureAccountContentKey,
  ensureAccountSigningKeyPair,
  loadStoredOrgContentKey,
} from "@/lib/cryptoContent";
import {
  bootstrapCurrentOrgContentKey,
  fetchCurrentOrgContentKeyStatus,
  putWorkerApprovalKey,
  upsertTrustedDevice,
} from "@/lib/api";
import { enrollRecoveryForPassword } from "@/lib/recoveryMethods";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SecureWorkspaceSetup({
  userLabel,
  onContinue,
}: {
  userLabel: string;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordEnrollOpen, setPasswordEnrollOpen] = useState(false);
  const [enrollPassword, setEnrollPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initializeWorkspace = useCallback(async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to secure this workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  const handlePasswordEnroll = useCallback(async () => {
    setPasswordBusy(true);
    try {
      await enrollRecoveryForPassword({
        password: enrollPassword,
        label: "Workspace password recovery",
      });
      setEnrollPassword("");
      setPasswordEnrollOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable password recovery.");
    } finally {
      setPasswordBusy(false);
    }
  }, [enrollPassword]);

  const handleContinue = useCallback(async () => {
    if (loading) return;
    setSubmitting(true);
    try {
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
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to secure the workspace.");
    } finally {
      setSubmitting(false);
    }
  }, [loading, onContinue]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Secure Your Workspace</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This device is generating your local content key, approval signing key, and registering account recovery factors for <span className="font-medium text-gray-700 dark:text-gray-200">{userLabel}</span>.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-deep-space-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generating local encryption material...
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {!loading ? (
        <>
          <div className="rounded-lg border border-deep-space-blue-200 bg-deep-space-blue-50 p-3 text-sm text-deep-space-blue-700 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-900/20 dark:text-deep-space-blue-400">
            Account recovery is enabled with your device unlock passkey or workspace
            password (verified with OPAQUE). If this browser loses its data, you can
            restore from either factor — no recovery file to store.
          </div>

          {passwordEnrollOpen ? (
            <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Enable password recovery
              </p>
              <Input
                type="password"
                value={enrollPassword}
                onChange={(event) => setEnrollPassword(event.target.value)}
                placeholder="Workspace password (min 16 characters)"
                autoComplete="new-password"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  isLoading={passwordBusy}
                  disabled={passwordBusy || enrollPassword.trim().length === 0}
                  onClick={() => void handlePasswordEnroll()}
                >
                  Enable Password Recovery
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={passwordBusy}
                  onClick={() => {
                    setPasswordEnrollOpen(false);
                    setEnrollPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          <Button
            onClick={() => void handleContinue()}
            isLoading={submitting}
            className="w-full"
          >
            Continue
          </Button>
        </>
      ) : null}
    </div>
  );
}
