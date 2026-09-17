"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppAuth } from "@/components/auth/AppAuth";
import useSWR from "swr";
import { KeyRound, LockKeyhole, Trash2 } from "lucide-react";
import {
  listRecoveryMethods,
  listUnlockCredentials,
  recoveryMethodsUrl,
  revokeUnlockCredential,
  unlockCredentialsUrl,
} from "@/lib/api";
import { useSWRConfig } from "swr";
import type { UnlockCredential } from "@/lib/types";
import {
  hasPasswordUnlockMethod,
  listLocalPasskeyUnlockMethods,
  removeLocalPasskeyUnlock,
  removePasswordUnlockMethod,
} from "@/lib/cryptoContent";
import { UnlockMethodSetup } from "@/components/auth/UnlockMethodSetup";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import {
  canRemoveLocalPasskeyUnlock,
  canRemovePasswordUnlock,
  shouldShowUnlockMethodSetup,
  unlockMethodSetupVisibility,
} from "@/lib/unlockMethodVisibility.mjs";

function methodLabel(credential: UnlockCredential): string {
  return credential.label || credential.credential_id;
}

export function UnlockMethodsSection() {
  const { user } = useAppAuth();
  const accountId = user?.id ?? null;
  const { data, mutate, isLoading } = useSWR(unlockCredentialsUrl(), () => listUnlockCredentials());
  const { data: recoveryMethods } = useSWR(recoveryMethodsUrl(), () => listRecoveryMethods());
  const swrConfig = useSWRConfig();
  const [hasPassword, setHasPassword] = useState(false);
  const [localPasskeyIds, setLocalPasskeyIds] = useState<Set<string>>(new Set());
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingPassword, setRemovingPassword] = useState(false);

  const refreshLocal = useCallback(async () => {
    const [passwordConfigured, localPasskeys] = await Promise.all([
      hasPasswordUnlockMethod(accountId),
      listLocalPasskeyUnlockMethods(accountId),
    ]);
    setHasPassword(passwordConfigured);
    setLocalPasskeyIds(new Set(localPasskeys.map((item) => item.credential_id)));
  }, [accountId]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const handleSetupComplete = async () => {
    await Promise.all([refreshLocal(), mutate()]);
    toast.success("Unlock method updated.");
  };

  const handleRevoke = async (credential: UnlockCredential, canRemoveSafely: boolean) => {
    const isLocal = localPasskeyIds.has(credential.credential_id);
    if (
      isLocal &&
      !canRemoveSafely &&
      !window.confirm(
        hasAccountRecovery
          ? "Remove this device unlock? Your account recovery method stays active."
          : "This is your only local unlock method and no account recovery is active. After removing it, you will need your recovery phrase or another trusted device to regain access on this browser. Remove anyway?",
      )
    ) {
      return;
    }

    setRevokingId(credential.id);
    try {
      await revokeUnlockCredential(credential.id);
      await removeLocalPasskeyUnlock(credential.credential_id);
      await Promise.all([refreshLocal(), mutate()]);
      // Revoking the credential transactionally revokes its recovery method.
      await swrConfig.mutate(recoveryMethodsUrl());
      toast.success("Device unlock removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove device unlock.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemovePassword = async () => {
    if (
      !canRemovePasswordUnlock({
        localPasskeyCount: localPasskeyIds.size,
        hasAccountRecovery,
      })
    ) {
      toast.error("Add device unlock before removing your passphrase unlock.");
      return;
    }

    setRemovingPassword(true);
    try {
      await removePasswordUnlockMethod();
      await refreshLocal();
      toast.success("Passphrase unlock removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove passphrase unlock.");
    } finally {
      setRemovingPassword(false);
    }
  };

  const credentials = data ?? [];
  // An active (or stale-but-restorable) recovery method substitutes for a
  // second unlock method when removing the last one.
  const hasAccountRecovery = (recoveryMethods ?? []).some(
    (method) => method.state === "active" || method.state === "stale",
  );
  const canAddUnlockMethod = shouldShowUnlockMethodSetup({
    localPasskeyCount: localPasskeyIds.size,
    hasPassword,
  });
  const setupVisibility = unlockMethodSetupVisibility({
    localPasskeyCount: localPasskeyIds.size,
    hasPassword,
  });
  const canRemovePassword = canRemovePasswordUnlock({
    localPasskeyCount: localPasskeyIds.size,
    hasAccountRecovery,
  });

  return (
    <section className="theme-border theme-surface overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-6">
      <div className="mb-5">
        <h2 className="theme-text text-base font-semibold">Workspace Unlock</h2>
        <p className="theme-text-muted mt-1 text-sm leading-6">
          Manage local unlock methods for this browser&apos;s encrypted vault.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Local unlock summary">
          <UnlockMetric label="Vault coverage" value={hasPassword || localPasskeyIds.size > 0 ? "Protected" : "Needs setup"} ready={hasPassword || localPasskeyIds.size > 0} />
          <UnlockMetric label="Passphrase" value={hasPassword ? "Configured" : "Not configured"} ready={hasPassword} />
          <UnlockMetric label="Device unlocks" value={localPasskeyIds.size} ready={localPasskeyIds.size > 0} />
        </div>

        {canAddUnlockMethod ? (
          <UnlockMethodSetup
            compact
            allowSkip={false}
            showDeviceUnlock={setupVisibility.showDeviceUnlock}
            showPasswordUnlock={setupVisibility.showPasswordUnlock}
            onComplete={() => void handleSetupComplete()}
          />
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="theme-border rounded-2xl border px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <LockKeyhole className="h-4 w-4 text-gray-500" />
                  <p className="theme-text text-sm font-medium">Passphrase Unlock</p>
                </div>
                <p className="theme-text-muted mt-1 text-xs">
                  {hasPassword
                    ? "Configured locally on this browser."
                    : "No local passphrase unlock is configured yet."}
                </p>
              </div>
              {hasPassword ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={removingPassword || !canRemovePassword}
                  title={
                    canRemovePassword
                      ? undefined
                      : "Add device unlock before removing your passphrase unlock."
                  }
                  onClick={() => void handleRemovePassword()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {removingPassword ? "Removing..." : "Remove"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="theme-border rounded-2xl border px-4 py-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              <p className="theme-text text-sm font-medium">Device Unlock Records</p>
            </div>
            <p className="theme-text-muted mt-1 text-xs">
              {localPasskeyIds.size > 0
                ? `${localPasskeyIds.size} device unlock record${localPasskeyIds.size === 1 ? "" : "s"} on this browser.`
                : "No local device unlock record is configured yet."}
            </p>
          </div>
        </div>

        <div className="theme-border overflow-hidden rounded-2xl border">
          {isLoading ? (
            <div className="theme-surface-muted h-20 motion-safe:animate-pulse" />
          ) : credentials.length === 0 ? (
            <div className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
              No device unlock records registered yet.
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/8">
              {credentials.map((credential) => {
                const isLocal = localPasskeyIds.has(credential.credential_id);
                const canRemoveDeviceUnlock =
                  !isLocal ||
                  canRemoveLocalPasskeyUnlock({
                    localPasskeyCount: localPasskeyIds.size,
                    hasPassword,
                    hasAccountRecovery,
                  });
                return (
                  <div key={credential.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="theme-text truncate text-sm font-medium">
                        {methodLabel(credential)}
                      </p>
                      <p className="theme-text-muted mt-1 text-xs">
                        {isLocal
                          ? hasAccountRecovery
                            ? "Available on this browser · recovery active"
                            : "Available on this browser · no account recovery"
                          : "Registered, but no local unlock record on this browser"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={revokingId === credential.id}
                      onClick={() => void handleRevoke(credential, canRemoveDeviceUnlock)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {revokingId === credential.id ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UnlockMetric({ label, value, ready }: { label: string; value: string | number; ready: boolean }) {
  return (
    <div className="theme-border theme-surface-muted rounded-xl border px-4 py-3">
      <p className={ready ? "text-sm font-semibold text-emerald-600 dark:text-emerald-300" : "theme-text text-sm font-semibold"}>{value}</p>
      <p className="theme-text-muted mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}
