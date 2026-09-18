"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppAuth } from "@/components/auth/AppAuth";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
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
import {
  listRestorableMethods,
  restoreWithPasskeyRecoveryMethod,
  restoreWithPasswordRecoveryMethod,
  EVENT_VAULT_RESTORED,
  RECOVERY_METHOD_TYPE_PASSKEY,
  RECOVERY_METHOD_TYPE_PASSWORD,
} from "@/lib/recoveryMethods";
import { retryEncryptedPushNotifications } from "@/lib/pushNotificationRetry";
import { useSafeRouter } from "@/lib/safeRouter";

export function LocalVaultUnlockGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useAppAuth();
  const router = useSafeRouter();
  const [checking, setChecking] = useState(true);
  // True once the first vault check completed: background re-checks must
  // never unmount children (a remount resets onboarding state mid-flow).
  const [everReady, setEverReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [passwordAvailable, setPasswordAvailable] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null);
  const [autoPasskeyTried, setAutoPasskeyTried] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [recoveryMethods, setRecoveryMethods] = useState<
    import("@/lib/api").RecoveryMethodMetadata[]
  >([]);
  const [restoreNeeded, setRestoreNeeded] = useState(false);
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
        // Seamless recovery: the browser lost its local crypto material. Ask
        // the backend for enrolled recovery methods and surface the device
        // unlock prompt instead of silently proceeding without keys.
        setRestoreNeeded(true);
        setRecoveryMethods(await listRestorableMethods());
        // The local unlock records are gone with the vault; stale availability
        // flags would render a second password input bound to the same state.
        setPasswordAvailable(false);
        setPasskeyAvailable(false);
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
      setEverReady(true);
    }
  }, [accountId, isLoaded]);

  const handleVaultExpired = useCallback(() => {
    setAutoPasskeyTried(false);
    void checkVault();
  }, [checkVault]);

  useEffect(() => {
    void checkVault();
  }, [checkVault]);

  // A restore completed elsewhere (e.g. onboarding): re-check the vault so
  // the restore prompt dismisses immediately.
  useEffect(() => {
    const handleVaultRestored = () => {
      setRestoreNeeded(false);
      setRecoveryMethods([]);
      void checkVault();
    };
    window.addEventListener(EVENT_VAULT_RESTORED, handleVaultRestored);
    return () =>
      window.removeEventListener(EVENT_VAULT_RESTORED, handleVaultRestored);
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

  const handleRestoreDevice = useCallback(() => {
    setError(null);
    router.push("/dashboard/onboarding?restore=1");
  }, [router]);

  const handlePasskeyRecoveryRestore = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    setBusy("passkey");
    try {
      const method = recoveryMethods.find(
        (candidate) => candidate.method_type === RECOVERY_METHOD_TYPE_PASSKEY,
      );
      if (!method) {
        throw new Error("No passkey recovery method is enrolled for this account.");
      }
      await restoreWithPasskeyRecoveryMethod(method, { accountId });
      setRestoreNeeded(false);
      setRecoveryMethods([]);
      await checkVault();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore this device.",
      );
    } finally {
      setBusy(null);
    }
  }, [accountId, checkVault, recoveryMethods]);

  const passkeyRecoveryAvailable = recoveryMethods.some(
    (method) => method.method_type === RECOVERY_METHOD_TYPE_PASSKEY,
  );
  const passwordRecoveryMethod = recoveryMethods.find(
    (method) => method.method_type === RECOVERY_METHOD_TYPE_PASSWORD,
  );

  const handlePasswordRecoveryRestore = useCallback(async () => {
    if (!accountId || !passwordRecoveryMethod) return;
    setError(null);
    setBusy("password");
    try {
      await restoreWithPasswordRecoveryMethod(passwordRecoveryMethod, {
        accountId,
        password,
      });
      setPassword("");
      setRestoreNeeded(false);
      setRecoveryMethods([]);
      await checkVault();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore this device.",
      );
    } finally {
      setBusy(null);
    }
  }, [accountId, checkVault, password, passwordRecoveryMethod]);

  useEffect(() => {
    if (checking || !locked || !passkeyAvailable || autoPasskeyTried || busy !== null || !accountId) {
      return;
    }
    setAutoPasskeyTried(true);
    void handlePasskeyUnlock(true);
  }, [accountId, autoPasskeyTried, busy, checking, handlePasskeyUnlock, locked, passkeyAvailable]);

  // Initial check: nothing to preserve yet, show a plain spinner.
  if (checking && !everReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Checking local vault...</span>
        </div>
      </div>
    );
  }

  const showRestoreOverlay = restoreNeeded && recoveryMethods.length > 0;
  const showLockedOverlay = locked;
  const showRecheckOverlay = checking && everReady;

  const gateModal = (
    <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-deep-space-blue-500" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {restoreNeeded ? "Restore this device" : "Unlock workspace"}
            </h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {restoreNeeded
              ? "This browser no longer has its local encryption keys. Restore your workspace with your device unlock method."
              : "This browser has a local encrypted vault. Unlock it with this device or your passphrase."}
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          {restoreNeeded ? (
            <>
              <Button
                type="button"
                className="w-full"
                disabled={busy !== null || !passkeyRecoveryAvailable}
                isLoading={busy === "passkey"}
                onClick={() => void handlePasskeyRecoveryRestore()}
              >
                <KeyRound className="h-4 w-4" />
                Restore With Device Unlock
              </Button>
              {passwordRecoveryMethod ? (
                <div className="space-y-2">
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Workspace password"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy !== null || password.length === 0}
                    isLoading={busy === "password"}
                    onClick={() => void handlePasswordRecoveryRestore()}
                  >
                    Restore With Password
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
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
          )}

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

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy !== null}
            onClick={handleRestoreDevice}
          >
            <ShieldCheck className="h-4 w-4" />
            Restore with recovery phrase or another device
          </Button>
        </div>
      </div>
  );

  if (showLockedOverlay) {
    // Locked vault keeps the dedicated full-page unlock screen.
    return (
      <div className="flex min-h-screen items-center justify-center px-4">{gateModal}</div>
    );
  }

  // After the initial check children stay mounted: background re-checks and
  // the restore prompt overlay the page instead of replacing it — unmounting
  // resets in-flight flows such as fresh onboarding.
  return (
    <div className="relative min-h-screen">
      {children}
      {showRestoreOverlay ? (
        <div className="absolute inset-0 z-50 overflow-y-auto bg-gray-100/95 p-4 dark:bg-gray-950/95 flex items-start justify-center">
          <div className="w-full max-w-md pt-[10vh]">{gateModal}</div>
        </div>
      ) : null}
      {showRecheckOverlay ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex justify-center pt-3">
          <span className="rounded-full border border-black/10 bg-white/90 px-3 py-1 text-xs text-gray-500 shadow-sm dark:border-white/10 dark:bg-gray-900/90 dark:text-gray-400">
            Checking local vault…
          </span>
        </div>
      ) : null}
    </div>
  );
}
