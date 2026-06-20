"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  bindLocalSecretVaultSession,
  enforceVaultIdleExpiry,
  hasLocalSecretVault,
  hasPasswordUnlockMethod,
  listLocalPasskeyUnlockMethods,
  loadStoredAccountContentKey,
  restoreLocalSecretVaultSession,
  touchVaultSessionActivity,
  unlockWithPassword,
} from "@/lib/cryptoContent";
import { unlockWithAnyLocalPasskey } from "@/lib/localUnlock";
import { retryEncryptedPushNotifications } from "@/lib/pushNotificationRetry";

export function LocalVaultUnlockGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  const [passwordAvailable, setPasswordAvailable] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null);
  const [autoPasskeyTried, setAutoPasskeyTried] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountId = user?.id ?? null;

  const checkVault = useCallback(async () => {
    if (!isLoaded) return;
    setChecking(true);
    try {
      if (enforceVaultIdleExpiry()) {
        setLocked(true);
        return;
      }

      const vaultConfigured = await hasLocalSecretVault();
      setHasVault(vaultConfigured);
      if (!vaultConfigured) {
        setLocked(false);
        return;
      }
      const [passwordConfigured, localPasskeys] = await Promise.all([
        hasPasswordUnlockMethod(accountId),
        listLocalPasskeyUnlockMethods(accountId),
      ]);
      setPasswordAvailable(passwordConfigured);
      setPasskeyAvailable(localPasskeys.length > 0);
      if (accountId) {
        if (!bindLocalSecretVaultSession(accountId)) {
          setLocked(true);
          return;
        }
        await restoreLocalSecretVaultSession(accountId);
      }
      await loadStoredAccountContentKey();
      retryEncryptedPushNotifications();
      setLocked(false);
    } catch {
      setLocked(true);
    } finally {
      setChecking(false);
    }
  }, [accountId, isLoaded]);

  const handleVaultExpired = useCallback(() => {
    setAutoPasskeyTried(false);
    void checkVault();
  }, [checkVault]);

  useEffect(() => {
    void checkVault();
  }, [checkVault]);

  useEffect(() => {
    if (!hasVault || locked || !accountId) return;

    const handleActivity = () => {
      if (enforceVaultIdleExpiry()) {
        handleVaultExpired();
        return;
      }
      touchVaultSessionActivity(accountId);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (enforceVaultIdleExpiry()) {
        handleVaultExpired();
      }
    };

    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibility);

    const intervalId = window.setInterval(() => {
      if (enforceVaultIdleExpiry()) {
        handleVaultExpired();
      }
    }, 30_000);

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [accountId, handleVaultExpired, hasVault, locked]);

  const handlePasswordUnlock = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    setBusy("password");
    try {
      await unlockWithPassword(password, accountId);
      setPassword("");
      await checkVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock workspace.");
    } finally {
      setBusy(null);
    }
  }, [accountId, checkVault, password]);

  const handlePasskeyUnlock = useCallback(async (automatic = false) => {
    if (!accountId) return;
    if (!automatic) setError(null);
    setBusy("passkey");
    try {
      await unlockWithAnyLocalPasskey(accountId);
      await checkVault();
    } catch (err) {
      if (!automatic) {
        setError(err instanceof Error ? err.message : "Failed to unlock with this device.");
      }
    } finally {
      setBusy(null);
    }
  }, [accountId, checkVault]);

  useEffect(() => {
    if (checking || !locked || !passkeyAvailable || autoPasskeyTried || busy !== null || !accountId) {
      return;
    }
    setAutoPasskeyTried(true);
    void handlePasskeyUnlock(true);
  }, [accountId, autoPasskeyTried, busy, checking, handlePasskeyUnlock, locked, passkeyAvailable]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Checking local vault...</span>
        </div>
      </div>
    );
  }

  if (!locked) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-deep-space-blue-500" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Unlock workspace
            </h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            This browser has a local encrypted vault. Unlock it with this device or your passphrase.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy !== null || !passkeyAvailable}
            isLoading={busy === "passkey"}
            onClick={() => void handlePasskeyUnlock()}
          >
            <KeyRound className="h-4 w-4" />
            {passkeyAvailable ? "Unlock With This Device" : "Device Unlock Unavailable"}
          </Button>

          {passwordAvailable ? (
            <div className="space-y-2">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Passphrase"
              />
              <Button
                type="button"
                className="w-full"
                disabled={busy !== null || password.length === 0}
                isLoading={busy === "password"}
                onClick={() => void handlePasswordUnlock()}
              >
                Unlock With Passphrase
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
