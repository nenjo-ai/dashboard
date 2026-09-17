"use client";

// Account recovery settings (BOO-26).
//
// Recovery is not a separate opt-in: enrolling a passkey device unlock
// automatically enrolls the same credential as the durable recovery factor.
// This section shows recovery status independently from local unlock and
// offers a one-tap migration for browsers that set up device unlock before
// automatic recovery existed.

import { useCallback, useMemo, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import useSWR from "swr";
import {
  listRecoveryMethods,
  recoveryMethodsUrl,
  revokeRecoveryMethod,
} from "@/lib/api";
import type { RecoveryMethodMetadata } from "@/lib/api";
import { enableRecoveryFromExistingUnlock } from "@/lib/recoveryMethods";
import { listLocalPasskeyUnlockMethods } from "@/lib/cryptoContent";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";

function methodStateLabel(state: string): { label: string; ready: boolean } {
  switch (state) {
    case "active":
      return { label: "Recovery enabled", ready: true };
    case "pending":
      return { label: "Setup pending", ready: false };
    case "stale":
      return { label: "Refresh required", ready: false };
    case "revoked":
      return { label: "Revoked", ready: false };
    default:
      return { label: state, ready: false };
  }
}

export function AccountRecoverySection() {
  const { data, mutate, isLoading } = useSWR(recoveryMethodsUrl(), () =>
    listRecoveryMethods(),
  );
  const [enrolling, setEnrolling] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [localPasskeyCount, setLocalPasskeyCount] = useState(0);

  const methods = useMemo(() => data ?? [], [data]);
  const activeMethods = methods.filter(
    (method) => method.state === "active" || method.state === "stale",
  );

  const refresh = useCallback(async () => {
    const localPasskeys = await listLocalPasskeyUnlockMethods(null).catch(() => []);
    setLocalPasskeyCount(localPasskeys.length);
    await mutate();
  }, [mutate]);

  const handleMigrate = useCallback(async () => {
    setEnrolling(true);
    try {
      await enableRecoveryFromExistingUnlock({ label: "Account recovery passkey" });
      await refresh();
      toast.success(
        "Account recovery enabled. This passkey can restore your workspace after browser data loss.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to enable account recovery.",
      );
    } finally {
      setEnrolling(false);
    }
  }, [refresh]);

  const handleRevoke = useCallback(
    async (method: RecoveryMethodMetadata) => {
      if (activeMethods.length === 1) {
        const confirmed = window.confirm(
          "This is your last durable recovery method. Without it, losing this browser's data requires your recovery phrase or another trusted device. Remove it anyway?",
        );
        if (!confirmed) return;
      }
      setRevokingId(method.id);
      try {
        await revokeRecoveryMethod(method.id);
        await refresh();
        toast.success("Recovery method removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove recovery method.",
        );
      } finally {
        setRevokingId(null);
      }
    },
    [activeMethods.length, refresh],
  );

  const canMigrate = activeMethods.length === 0 && localPasskeyCount > 0;

  return (
    <section className="theme-border theme-surface overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-6">
      <div className="mb-5">
        <h2 className="theme-text text-base font-semibold">Account Recovery</h2>
        <p className="theme-text-muted mt-1 text-sm leading-6">
          Recovery is enabled automatically with your device unlock passkey and
          survives clearing this browser&apos;s site data. Local device unlock
          alone does not.
        </p>
      </div>

      <div className="space-y-4">
        <div className="theme-border overflow-hidden rounded-2xl border">
          {isLoading ? (
            <div className="theme-surface-muted h-20 motion-safe:animate-pulse" />
          ) : methods.length === 0 ? (
            <div className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
              {canMigrate
                ? "Your device unlock passkey was set up before automatic recovery existed. Enable recovery to use it after browser data loss."
                : "No recovery methods yet. Configure a device unlock passkey and recovery is enabled with it."}
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/8">
              {methods.map((method) => {
                const status = methodStateLabel(method.state);
                const label =
                  typeof method.metadata?.label === "string"
                    ? method.metadata.label
                    : method.method_type === "passkey_prf"
                      ? "Passkey recovery"
                      : "Workspace password recovery";
                return (
                  <div
                    key={method.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="theme-text truncate text-sm font-medium">{label}</p>
                      <p className="theme-text-muted mt-1 text-xs">
                        {status.label}
                        {method.state === "stale"
                          ? " — sign in with this factor again to refresh it"
                          : ""}
                      </p>
                    </div>
                    {method.state !== "revoked" ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={revokingId === method.id}
                        onClick={() => void handleRevoke(method)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {revokingId === method.id ? "Removing..." : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canMigrate ? (
          <div className="theme-border rounded-2xl border px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gray-500" />
                  <p className="theme-text text-sm font-medium">Enable recovery</p>
                </div>
                <p className="theme-text-muted mt-1 text-xs">
                  Verifies your existing device unlock passkey with the server
                  and enables it as your durable recovery factor.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                isLoading={enrolling}
                onClick={() => void handleMigrate()}
              >
                Enable Recovery
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
