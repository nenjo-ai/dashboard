// Component-level state-machine tests for LocalVaultUnlockGate (BOO-26).
//
// These pin the render contracts that produced real regressions:
//   1. Background re-checks must never unmount children (the remount loop
//      that ejected users mid-onboarding).
//   2. The vault-restored event must dismiss the restore overlay.
//   3. Missing vault + enrolled recovery methods => restore overlay, with
//      children mounted beneath.
//   4. A locked vault keeps the dedicated unlock screen.
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useEffect, useRef } from "react";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    user: { id: "clerk-user-1" } as { id: string } | null,
  },
  hasLocalSecretVault: vi.fn(),
  hasPasswordUnlockMethod: vi.fn(),
  listLocalPasskeyUnlockMethods: vi.fn(),
  loadStoredAccountContentKey: vi.fn(),
  bindLocalSecretVaultSession: vi.fn(),
  restoreLocalSecretVaultSession: vi.fn(),
  enforceVaultIdleExpiry: vi.fn(),
  unlockWithAnyLocalPasskey: vi.fn(),
  unlockWithPassword: vi.fn(),
  listRestorableMethods: vi.fn(),
  restoreWithPasskeyRecoveryMethod: vi.fn(),
}));

vi.mock("@/components/auth/AppAuth", () => ({
  useAppAuth: () => mocks.auth,
}));

vi.mock("@/lib/cryptoContent", () => ({
  bindLocalSecretVaultSession: mocks.bindLocalSecretVaultSession,
  enforceVaultIdleExpiry: mocks.enforceVaultIdleExpiry,
  hasLocalSecretVault: mocks.hasLocalSecretVault,
  hasPasswordUnlockMethod: mocks.hasPasswordUnlockMethod,
  listLocalPasskeyUnlockMethods: mocks.listLocalPasskeyUnlockMethods,
  loadStoredAccountContentKey: mocks.loadStoredAccountContentKey,
  restoreLocalSecretVaultSession: mocks.restoreLocalSecretVaultSession,
  touchVaultSessionActivity: vi.fn(),
  unlockWithPassword: mocks.unlockWithPassword,
}));

vi.mock("@/lib/localUnlock", () => ({
  unlockWithAnyLocalPasskey: mocks.unlockWithAnyLocalPasskey,
}));

vi.mock("@/lib/recoveryMethods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recoveryMethods")>();
  return {
    ...actual,
    listRestorableMethods: mocks.listRestorableMethods,
    restoreWithPasskeyRecoveryMethod: mocks.restoreWithPasskeyRecoveryMethod,
  };
});

vi.mock("@/lib/pushNotificationRetry", () => ({
  retryEncryptedPushNotifications: vi.fn(),
}));

vi.mock("@/lib/safeRouter", () => ({
  useSafeRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { LocalVaultUnlockGate } from "@/components/auth/LocalVaultUnlockGate";
import { EVENT_VAULT_RESTORED } from "@/lib/recoveryMethods";

// Counts actual React mounts (not just renders) of the gated subtree.
let mountCount = 0;
function ChildProbe() {
  useEffect(() => {
    mountCount += 1;
    return () => {
      mountCount += 1;
    };
  }, []);
  return <div data-testid="gated-children">dashboard content</div>;
}

function unlockedVault() {
  mocks.hasLocalSecretVault.mockResolvedValue(true);
  mocks.hasPasswordUnlockMethod.mockResolvedValue(true);
  mocks.listLocalPasskeyUnlockMethods.mockResolvedValue([
    { credential_id: "cred-1", label: "Device unlock" },
  ]);
  mocks.loadStoredAccountContentKey.mockResolvedValue("ack-base64");
  mocks.bindLocalSecretVaultSession.mockReturnValue(true);
  mocks.restoreLocalSecretVaultSession.mockResolvedValue(true);
  mocks.enforceVaultIdleExpiry.mockReturnValue(false);
}

function missingVaultWithRecovery() {
  mocks.hasLocalSecretVault.mockResolvedValue(false);
  mocks.hasPasswordUnlockMethod.mockResolvedValue(false);
  mocks.listLocalPasskeyUnlockMethods.mockResolvedValue([]);
  mocks.loadStoredAccountContentKey.mockResolvedValue(null);
  mocks.bindLocalSecretVaultSession.mockReturnValue(true);
  mocks.restoreLocalSecretVaultSession.mockResolvedValue(false);
  mocks.enforceVaultIdleExpiry.mockReturnValue(false);
  mocks.listRestorableMethods.mockResolvedValue([
    {
      id: "method-1",
      method_type: "passkey_prf",
      state: "active",
      revision: 1,
      key_epoch: 1,
      crypto_header: {},
      factor_reference: "row-1",
      metadata: { prf_input: "abc" },
      created_at: new Date().toISOString(),
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mountCount = 0;
});

describe("LocalVaultUnlockGate", () => {
  it("shows the checking spinner before the first check completes and children are not mounted", async () => {
    unlockedVault();
    let resolveVault: (value: boolean) => void = () => {};
    mocks.hasLocalSecretVault.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveVault = resolve;
        }),
    );
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );

    expect(screen.getByText("Checking local vault...")).toBeInTheDocument();
    expect(mountCount).toBe(0);

    await act(async () => {
      resolveVault(true);
    });
    await waitFor(() =>
      expect(screen.getByTestId("gated-children")).toBeInTheDocument(),
    );
  });

  it("renders children directly when the vault is unlocked", async () => {
    unlockedVault();
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("gated-children")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Restore this device")).not.toBeInTheDocument();
  });

  it("shows the restore overlay over mounted children when keys are missing but recovery is enrolled", async () => {
    missingVaultWithRecovery();
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("Restore With Device Unlock")).toBeInTheDocument(),
    );
    // Children stay mounted beneath the overlay.
    expect(screen.getByTestId("gated-children")).toBeInTheDocument();
  });

  it("background re-checks never unmount children (remount-loop regression)", async () => {
    missingVaultWithRecovery();
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("Restore With Device Unlock")).toBeInTheDocument(),
    );
    expect(mountCount).toBe(1);

    // The vault-restored event (and any re-check) must not remount children.
    await act(async () => {
      unlockedVault();
      window.dispatchEvent(new Event(EVENT_VAULT_RESTORED));
    });
    await waitFor(() =>
      expect(screen.getByTestId("gated-children")).toBeInTheDocument(),
    );
    expect(mountCount).toBe(1);
  });

  it("the vault-restored event dismisses the restore overlay after a restore", async () => {
    missingVaultWithRecovery();
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("Restore With Device Unlock")).toBeInTheDocument(),
    );

    await act(async () => {
      unlockedVault();
      window.dispatchEvent(new Event(EVENT_VAULT_RESTORED));
    });
    await waitFor(() =>
      expect(screen.queryByText("Restore With Device Unlock")).toBeNull(),
    );
    expect(screen.getByTestId("gated-children")).toBeInTheDocument();
  });

  it("a locked vault keeps the dedicated unlock screen instead of children", async () => {
    unlockedVault();
    // Locked: session binding fails for this account.
    mocks.bindLocalSecretVaultSession.mockReturnValue(false);
    render(
      <LocalVaultUnlockGate>
        <ChildProbe />
      </LocalVaultUnlockGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("Unlock workspace")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("gated-children")).toBeNull();
  });
});
