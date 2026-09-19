"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  hasLocalSecretVault,
  hasPasswordUnlockMethod,
  listLocalPasskeyUnlockMethods,
  loadStoredAccountContentKey,
  loadStoredOrgContentKey,
  lockLocalSecretVault,
  resetLocalEncryptedWorkspaceForRestore,
  setStoredAccountContentKey,
  setStoredOrgContentKey,
  setupPasskeyUnlock,
  setupPasswordUnlock,
  unlockWithPasskeyPrf,
  unlockWithPassword,
} from "@/lib/cryptoContent";

type HarnessStatus = "pending" | "running" | "passed" | "failed";

type HarnessResult = {
  name: string;
  status: HarnessStatus;
  detail?: string;
};

type HarnessTest = {
  name: string;
  run: () => Promise<void>;
};

const DB_NAME = "nenjo-crypto";
const STORE_NAME = "secrets";
const ACCOUNT_A = "browser-harness-account-a";
const ACCOUNT_B = "browser-harness-account-b";
const PASSPHRASE = "browser harness passphrase";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

function randomBytes(length = 32): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomBase64(length = 32): string {
  const bytes = randomBytes(length);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function openHarnessDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readSecretKeys(): Promise<string[]> {
  const db = await openHarnessDb();
  try {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      return [];
    }
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB keys."));
      request.onsuccess = () =>
        resolve(request.result.filter((key): key is string => typeof key === "string").sort());
    });
  } finally {
    db.close();
  }
}

async function cleanSlate(): Promise<void> {
  await resetLocalEncryptedWorkspaceForRestore();
  lockLocalSecretVault();
}

export function VaultUnlockHarnessClient() {
  const searchParams = useSearchParams();
  const autoRun = searchParams.get("run") === "1";
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<HarnessResult[]>([]);

  const tests = useMemo<HarnessTest[]>(
    () => [
      {
        name: "Browser exposes secure IndexedDB and WebCrypto",
        run: async () => {
          assert(window.isSecureContext, "Harness must run in a secure browser context.");
          assert(indexedDB, "IndexedDB is unavailable.");
          assert(crypto.subtle, "WebCrypto subtle API is unavailable.");
        },
      },
      {
        name: "Passphrase unlock survives lock and rejects wrong account",
        run: async () => {
          await cleanSlate();
          const accountContentKey = randomBase64();
          await setStoredAccountContentKey(accountContentKey);
          assert(
            (await loadStoredAccountContentKey()) === accountContentKey,
            "Initial account content key did not round-trip before vault setup.",
          );

          await setupPasswordUnlock(PASSPHRASE, ACCOUNT_A);
          assert(await hasLocalSecretVault(), "Passphrase setup did not enable the local vault.");
          assert(await hasPasswordUnlockMethod(ACCOUNT_A), "Passphrase method was not visible for its account.");
          assert(
            !(await hasPasswordUnlockMethod(ACCOUNT_B)),
            "Passphrase method leaked across accounts.",
          );

          lockLocalSecretVault();
          await assertRejects(
            () => loadStoredAccountContentKey(),
            "Locked vault still returned the account content key.",
          );
          await assertRejects(
            () => unlockWithPassword(PASSPHRASE, ACCOUNT_B),
            "Passphrase unlock accepted the wrong account.",
          );

          await unlockWithPassword(PASSPHRASE, ACCOUNT_A);
          assert(
            (await loadStoredAccountContentKey()) === accountContentKey,
            "Passphrase unlock did not restore the account content key.",
          );
        },
      },
      {
        name: "Synthetic PRF passkey unlock round-trips and rejects stale PRF output",
        run: async () => {
          await cleanSlate();
          const credentialId = "browser-harness-credential";
          const accountContentKey = randomBase64();
          const salt = randomBytes();
          const prfOutput = randomBytes();
          const wrongPrfOutput = randomBytes();

          await setStoredAccountContentKey(accountContentKey);
          await setupPasskeyUnlock({
            accountId: ACCOUNT_A,
            credentialId,
            label: "Browser harness",
            salt,
            prfOutput,
          });

          assert(
            (await listLocalPasskeyUnlockMethods(ACCOUNT_A)).length === 1,
            "Passkey unlock method was not visible for its account.",
          );
          assert(
            (await listLocalPasskeyUnlockMethods(ACCOUNT_B)).length === 0,
            "Passkey unlock method leaked across accounts.",
          );

          lockLocalSecretVault();
          await assertRejects(
            () =>
              unlockWithPasskeyPrf({
                credentialId,
                prfOutput: wrongPrfOutput,
                accountId: ACCOUNT_A,
              }),
            "Passkey unlock accepted stale or incorrect PRF output.",
          );
          await assertRejects(
            () =>
              unlockWithPasskeyPrf({
                credentialId,
                prfOutput,
                accountId: ACCOUNT_B,
              }),
            "Passkey unlock accepted the wrong account.",
          );

          await unlockWithPasskeyPrf({
            credentialId,
            prfOutput,
            accountId: ACCOUNT_A,
          });
          assert(
            (await loadStoredAccountContentKey()) === accountContentKey,
            "Passkey unlock did not restore the account content key.",
          );
        },
      },
      {
        name: "Restore reset clears stale vault state while preserving device wrap key",
        run: async () => {
          await cleanSlate();
          const accountContentKey = randomBase64();
          const orgContentKey = randomBase64();

          await setStoredAccountContentKey(accountContentKey);
          await setupPasswordUnlock(PASSPHRASE, ACCOUNT_A);
          await setStoredOrgContentKey("browser-harness-org", 1, orgContentKey);

          const beforeKeys = await readSecretKeys();
          assert(beforeKeys.includes("unlock-vault-config"), "Vault config was not created.");
          assert(beforeKeys.includes("unlock-method:password"), "Password unlock record was not created.");
          assert(
            beforeKeys.includes("encrypted-ock:browser-harness-org:1"),
            "Org content key was not stored before restore.",
          );

          // Simulates what BOO-26 restore completion does before reseeding:
          // clear stale local vault state but keep the device wrap key.
          await resetLocalEncryptedWorkspaceForRestore();

          assert(!(await hasLocalSecretVault()), "Restore reset left stale local vault config enabled.");
          assert(
            (await loadStoredAccountContentKey()) === null,
            "Restore reset did not clear the stale account content key.",
          );
          assert(
            (await loadStoredOrgContentKey("browser-harness-org", 1)) === null,
            "Restore reset did not clear stale org content keys.",
          );

          const afterKeys = await readSecretKeys();
          assert(!afterKeys.includes("unlock-vault-config"), "Vault config survived restore reset.");
          assert(!afterKeys.includes("unlock-method:password"), "Password unlock survived restore reset.");
          assert(
            !afterKeys.includes("encrypted-ock:browser-harness-org:1"),
            "Org content key survived restore reset.",
          );
          assert(afterKeys.includes("device-wrap-key"), "Device wrap key was unexpectedly removed.");
        },
      },
    ],
    [],
  );

  const runHarness = useCallback(async () => {
    setRunning(true);
    setResults(tests.map((test) => ({ name: test.name, status: "pending" })));
    const nextResults: HarnessResult[] = [];

    try {
      for (const test of tests) {
        nextResults.push({ name: test.name, status: "running" });
        setResults([...nextResults, ...tests.slice(nextResults.length).map((item) => ({ name: item.name, status: "pending" as const }))]);

        try {
          await test.run();
          nextResults[nextResults.length - 1] = { name: test.name, status: "passed" };
        } catch (error) {
          nextResults[nextResults.length - 1] = {
            name: test.name,
            status: "failed",
            detail: error instanceof Error ? error.message : "Unknown harness failure.",
          };
          break;
        }
      }
    } finally {
      await cleanSlate().catch(() => undefined);
      setResults(nextResults);
      setRunning(false);
    }
  }, [tests]);

  useEffect(() => {
    if (autoRun && results.length === 0 && !running) {
      void runHarness();
    }
  }, [autoRun, results.length, runHarness, running]);

  const failed = results.find((result) => result.status === "failed");
  const passedCount = results.filter((result) => result.status === "passed").length;
  const complete = results.length > 0 && !running && !failed && passedCount === tests.length;

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-8 text-gray-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Development Harness
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Vault Unlock Browser Harness</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Runs real browser IndexedDB and WebCrypto checks against the local vault unlock code.
            Use an isolated localhost port because the harness intentionally resets the local
            encrypted workspace for this origin.
          </p>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={() => void runHarness()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-50"
        >
          {running ? "Running..." : "Run Harness"}
        </button>

        <div
          id="vault-harness-status"
          data-status={failed ? "failed" : complete ? "passed" : running ? "running" : "idle"}
          data-passed={passedCount}
          data-total={tests.length}
          className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm"
        >
          {failed
            ? `Failed: ${failed.name}`
            : complete
              ? `Passed ${passedCount}/${tests.length}`
              : running
                ? `Running ${passedCount}/${tests.length}`
                : "Idle"}
        </div>

        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.name}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
              data-test-status={result.status}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{result.name}</p>
                <span className="text-xs uppercase tracking-[0.14em] text-gray-400">
                  {result.status}
                </span>
              </div>
              {result.detail ? (
                <p className="mt-2 text-sm text-red-300">{result.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
