"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { canUsePasskeyPrf, registerPasskeyUnlock } from "@/lib/localUnlock";
import { setupPasswordUnlock } from "@/lib/cryptoContent";

export function UnlockMethodSetup({
  onComplete,
  allowSkip = true,
  compact = false,
  showDeviceUnlock = true,
  showPasswordUnlock = true,
}: {
  onComplete?: () => void;
  allowSkip?: boolean;
  compact?: boolean;
  showDeviceUnlock?: boolean;
  showPasswordUnlock?: boolean;
}) {
  const { user } = useUser();
  const accountId = user?.id ?? null;
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<"passkey" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  const normalizedPassword = password.trim();
  const normalizedConfirmPassword = confirmPassword.trim();
  const passwordTooShort =
    normalizedPassword.length > 0 && normalizedPassword.length < 12;
  const confirmPasswordTooShort =
    normalizedConfirmPassword.length > 0 && normalizedConfirmPassword.length < 12;

  useEffect(() => {
    setPasskeyAvailable(canUsePasskeyPrf());
  }, []);

  const handlePasskey = async () => {
    setError(null);
    if (!accountId) {
      setError("Sign in before setting up device unlock.");
      return;
    }
    setBusy("passkey");
    try {
      await registerPasskeyUnlock(accountId, "Device unlock");
      setCompleted("Device unlock is ready on this browser.");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set up device unlock.");
    } finally {
      setBusy(null);
    }
  };

  const handlePassword = async () => {
    setError(null);
    if (!accountId) {
      setError("Sign in before setting up passphrase unlock.");
      return;
    }
    if (normalizedPassword.length < 12 || normalizedConfirmPassword.length < 12) {
      setError("Use a passphrase with at least 12 characters.");
      return;
    }
    if (normalizedPassword !== normalizedConfirmPassword) {
      setError("Passphrases do not match.");
      return;
    }
    setBusy("password");
    try {
      await setupPasswordUnlock(normalizedPassword, accountId);
      setPassword("");
      setConfirmPassword("");
      setCompleted("Passphrase unlock is ready on this browser.");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set passphrase unlock.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={compact ? "space-y-4" : "rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"}>
      <div>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-deep-space-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Local vault unlock
          </h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Add device unlock or a passphrase for this browser&apos;s encrypted vault.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {completed ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
          {completed}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {showDeviceUnlock ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-gray-500" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Device unlock</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Uses this device&apos;s passkey, Touch ID, or native unlock prompt when supported.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto sm:min-w-52"
                disabled={!passkeyAvailable || busy !== null}
                isLoading={busy === "passkey"}
                onClick={() => void handlePasskey()}
              >
                {passkeyAvailable ? "Set Up Device Unlock" : "Device Unlock Unavailable"}
              </Button>
            </div>
          </div>
        ) : null}

        {showPasswordUnlock ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 shrink-0 text-gray-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Passphrase</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Keep a local passphrase as a backup unlock method for this browser.
            </p>
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Passphrase"
                  error={passwordTooShort}
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm passphrase"
                  error={confirmPasswordTooShort}
                />
              </div>
              {passwordTooShort || confirmPasswordTooShort ? (
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Use at least 12 characters.
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto sm:min-w-52"
                  disabled={busy !== null}
                  isLoading={busy === "password"}
                  onClick={() => void handlePassword()}
                >
                  Set Passphrase Unlock
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {allowSkip ? (
        <Button type="button" variant="ghost" className="w-full" disabled={busy !== null} onClick={onComplete}>
          Skip For Now
        </Button>
      ) : null}
    </section>
  );
}
