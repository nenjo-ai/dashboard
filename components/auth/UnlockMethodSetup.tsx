"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
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
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy("password");
    try {
      await setupPasswordUnlock(password, accountId);
      setPassword("");
      setConfirmPassword("");
      setCompleted("Password unlock is ready on this browser.");
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
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-deep-space-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Local vault unlock
          </h3>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

      <div className={cn("grid gap-3", showDeviceUnlock && showPasswordUnlock && "md:grid-cols-2")}>
        {showDeviceUnlock ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Device unlock</p>
            </div>
            <p className="mt-1 min-h-10 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Uses this device&apos;s passkey, Touch ID, or native unlock prompt when supported.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              disabled={!passkeyAvailable || busy !== null}
              isLoading={busy === "passkey"}
              onClick={() => void handlePasskey()}
            >
              {passkeyAvailable ? "Set Up Device Unlock" : "Device Unlock Unavailable"}
            </Button>
          </div>
        ) : null}

        {showPasswordUnlock ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-gray-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Passphrase</p>
            </div>
            <div className="mt-3 space-y-2">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Passphrase"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm passphrase"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={busy !== null || password.length < 12 || confirmPassword.length < 12}
                isLoading={busy === "password"}
                onClick={() => void handlePassword()}
              >
                Set Passphrase Unlock
              </Button>
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
