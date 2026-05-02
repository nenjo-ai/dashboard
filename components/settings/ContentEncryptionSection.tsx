"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  approveDeviceEnrollment,
  approveWorkerEnrollment,
  bootstrapCurrentOrgContentKey,
  deleteDeviceEnrollment,
  deleteRecoveryBundle,
  deleteTrustedDevice,
  deleteWorkerApprovalKey,
  deleteWorkerEnrollment,
  fetchCurrentOrgContentKeyRecovery,
  fetchRecoveryBundle,
  fetchWorkerApprovalKey,
  listDeviceEnrollments,
  listTrustedDevices,
  putRecoveryBundle,
  putWorkerApprovalKey,
  upsertTrustedDevice,
} from "@/lib/api";
import {
  buildCurrentOrgContentKeyBootstrap,
  buildTrustedDevicePayload,
  buildWorkerCertificate,
  clearAccountSigningKeyPair,
  clearStoredRecoveryBundle,
  clearStoredAccountContentKey,
  ensureAccountSigningKeyPair,
  generateAccountContentKey,
  importWrappedAccountContentKeyForDevice,
  importWrappedOrgContentKeyFromRecovery,
  loadAccountSigningPublicKey,
  loadStoredRecoveryBundle,
  loadStoredAccountContentKey,
  restoreFromRecoveryBundle,
  storeRecoveryBundle,
  warmAccountSigningKeyPair,
  wrapAccountContentKeyForWorker,
  wrapOrgContentKeyForWorker,
} from "@/lib/cryptoContent";
import { useCurrentUser } from "@/lib/hooks";
import { fetcher, workerEnrollmentUrl } from "@/lib/api";
import type {
  DeviceEnrollmentPayload,
  TrustedDevicePayload,
  WorkerHarnessMetadata,
  WorkerEnrollmentStatusResponse,
} from "@/lib/types";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";

function summarizeKey(base64Key: string | null): string {
  if (!base64Key) return "Not configured";
  if (base64Key.length <= 12) return base64Key;
  return `${base64Key.slice(0, 8)}...${base64Key.slice(-6)}`;
}

function harnessTitle(enrollment: WorkerEnrollmentStatusResponse): string {
  return enrollment.metadata?.name || enrollment.api_key_id;
}

function harnessDescription(
  enrollment: WorkerEnrollmentStatusResponse,
  stateLabel: string,
): string {
  const metadata = enrollment.metadata;
  const parts = [
    stateLabel,
    metadata?.host,
    metadata?.version,
    metadata?.labels?.length ? metadata.labels.join(", ") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : enrollment.api_key_id;
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="theme-border theme-surface overflow-hidden rounded-2xl border p-5">
      <div className="mb-4">
        <h3 className="theme-text text-base font-semibold">{title}</h3>
        <p className="theme-text-muted mt-1 text-sm">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ItemRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="theme-border rounded-2xl border px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="theme-text text-sm font-medium">{title}</p>
          <p className="theme-text-muted mt-1 text-xs">{description}</p>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

function VerificationWarning({ code }: { code: string }) {
  return (
    <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
      Check that this code matches the one shown on the requesting device or harness before approving:{" "}
      <span className="font-mono font-semibold tracking-[0.2em]">{code}</span>
    </div>
  );
}

function DangerActionRow({
  title,
  danger,
  reason,
  children,
}: {
  title: string;
  danger: string;
  reason: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-red-200/70 bg-red-50/60 p-4 dark:border-red-500/20 dark:bg-red-500/6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
          <p className="text-xs leading-5 text-red-700 dark:text-red-300">
            <span className="font-semibold">Why it&apos;s dangerous:</span> {danger}
          </p>
          <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">
            <span className="font-semibold">When you might do it:</span> {reason}
          </p>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

type ContentEncryptionSectionMode = "all" | "devices" | "workers";

export function ContentEncryptionSection({
  mode = "all",
}: {
  mode?: ContentEncryptionSectionMode;
}) {
  const { userId, currentUser } = useCurrentUser();
  const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);
  const [removingWorkerId, setRemovingWorkerId] = useState<string | null>(null);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);
  const [removingPendingDeviceId, setRemovingPendingDeviceId] = useState<string | null>(null);
  const [autoRegisteringDevice, setAutoRegisteringDevice] = useState(false);
  const [keyVersion, setKeyVersion] = useState(1);
  const [ackPreview, setAckPreview] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(true);
  const [signingKeyPreview, setSigningKeyPreview] = useState<string | null>(null);
  const [signingKeyLoading, setSigningKeyLoading] = useState(true);
  const [signingKeySynced, setSigningKeySynced] = useState(false);
  const [hasRecoveryBundle, setHasRecoveryBundle] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevicePayload[]>([]);
  const [deviceEnrollments, setDeviceEnrollments] = useState<DeviceEnrollmentPayload[]>([]);
  const [dangerConfirm, setDangerConfirm] = useState<
    | {
        kind: "clear_key";
        title: string;
        message: string;
        confirmLabel: string;
      }
    | {
        kind: "delete_recovery_bundle";
        title: string;
        message: string;
        confirmLabel: string;
      }
    | {
        kind: "clear_signing_key";
        title: string;
        message: string;
        confirmLabel: string;
      }
    | {
        kind: "remove_trusted_device";
        device: TrustedDevicePayload;
        title: string;
        message: string;
        confirmLabel: string;
      }
    | {
        kind: "remove_harness";
        apiKeyId: string;
        title: string;
        message: string;
        confirmLabel: string;
      }
    | null
  >(null);
  const autoRegisteredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadAck = async () => {
      try {
        const stored = await loadStoredAccountContentKey();
        if (!cancelled) {
          setAckPreview(stored);
        }
      } finally {
        if (!cancelled) {
          setAckLoading(false);
        }
      }
    };

    void loadAck();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDevices = async () => {
      const devices = await listTrustedDevices().catch(() => []);
      if (!cancelled) {
        setTrustedDevices(devices);
      }
    };

    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadEnrollments = async () => {
      const records = await listDeviceEnrollments().catch(() => []);
      if (!cancelled) {
        setDeviceEnrollments(records);
      }
    };

    void loadEnrollments();
    const interval = setInterval(() => {
      void loadEnrollments();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRecovery = async () => {
      const local = await loadStoredRecoveryBundle();
      const remote = await fetchRecoveryBundle().catch(() => ({ recovery_bundle: null }));
      if (cancelled) return;
      setHasRecoveryBundle(Boolean(local ?? remote.recovery_bundle));
      if (!local && remote.recovery_bundle) {
        await storeRecoveryBundle(remote.recovery_bundle).catch(() => undefined);
      }
    };

    void loadRecovery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSigningKey = async () => {
      try {
        await warmAccountSigningKeyPair();
        const stored = await loadAccountSigningPublicKey();
        const remote = await fetchWorkerApprovalKey().catch(() => ({ public_key: null }));
        if (!cancelled) {
          setSigningKeyPreview(stored);
          setSigningKeySynced(!!stored && stored === (remote.public_key ?? null));
        }
        if (stored && stored !== (remote.public_key ?? null)) {
          try {
            await putWorkerApprovalKey(stored);
            if (!cancelled) {
              setSigningKeySynced(true);
            }
          } catch {
            if (!cancelled) {
              setSigningKeySynced(false);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setSigningKeySynced(false);
        }
      } finally {
        if (!cancelled) {
          setSigningKeyLoading(false);
        }
      }
    };

    void loadSigningKey();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (autoRegisteredRef.current) return;
    if (ackLoading || !ackPreview) return;
    autoRegisteredRef.current = true;
    setAutoRegisteringDevice(true);
    void (async () => {
      try {
        const trustedDevice = await buildTrustedDevicePayload({
          deviceLabel:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 80)
              : "browser",
          keyVersion,
          requireSigningKey: false,
        });
        await upsertTrustedDevice(trustedDevice);
        setTrustedDevices(await listTrustedDevices().catch(() => [trustedDevice]));
      } catch {
        autoRegisteredRef.current = false;
      } finally {
        setAutoRegisteringDevice(false);
      }
    })();
  }, [ackLoading, ackPreview, keyVersion]);

  const { data: enrollments, isLoading, mutate } = useSWR<WorkerEnrollmentStatusResponse[]>(
    userId ? workerEnrollmentUrl() : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const pendingEnrollments = (enrollments ?? []).filter((item) => item.state === "pending");
  const activeEnrollments = (enrollments ?? []).filter((item) => item.state === "active");
  const pendingDeviceApprovals = useMemo(
    () => deviceEnrollments.filter((item) => item.state === "pending"),
    [deviceEnrollments],
  );
  const showDevices = mode === "all" || mode === "devices";
  const showWorkers = mode === "all" || mode === "workers";

  const handleGenerateKey = async () => {
    const next = await generateAccountContentKey();
    setAckPreview(next);
    toast.success("Stored an encrypted local account content key on this device.");
  };

  const handleClearKey = async () => {
    await clearStoredAccountContentKey();
    setAckPreview(null);
    autoRegisteredRef.current = false;
    toast.success("Removed the local account content key from this device.");
  };

  const handleGenerateSigningKey = async () => {
    const { publicKey } = await ensureAccountSigningKeyPair();
    await putWorkerApprovalKey(publicKey);
    setSigningKeyPreview(publicKey);
    setSigningKeySynced(true);
    toast.success("Stored an encrypted local harness approval key on this device.");
  };

  const handleClearSigningKey = async () => {
    await clearAccountSigningKeyPair();
    await deleteWorkerApprovalKey().catch(() => undefined);
    setSigningKeyPreview(null);
    setSigningKeySynced(false);
    toast.success("Removed the local harness approval key from this device.");
  };

  const handleRestore = async () => {
    setRecoveryBusy(true);
    try {
      const remote = await fetchRecoveryBundle();
      const bundle = remote.recovery_bundle;
      if (!bundle) {
        throw new Error("No recovery bundle is stored for this account.");
      }
      const restored = await restoreFromRecoveryBundle({
        recoveryPhrase,
        bundle,
      });
      if (bundle && deviceEnrollments.find((item) => item.state === "active" && item.wrapped_ack)) {
        const activeEnrollment = deviceEnrollments.find((item) => item.state === "active" && item.wrapped_ack);
        if (activeEnrollment?.wrapped_ack) {
          await importWrappedAccountContentKeyForDevice(activeEnrollment.wrapped_ack).catch(() => undefined);
        }
      }
      await putWorkerApprovalKey(restored.publicKey);
      await putRecoveryBundle(bundle);
      const trustedDevice = await buildTrustedDevicePayload({
        deviceLabel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "browser",
        keyVersion,
      });
      await upsertTrustedDevice(trustedDevice);
      const orgRecovery = await fetchCurrentOrgContentKeyRecovery().catch(() => null);
      if (orgRecovery?.recovery_wrapped_ock) {
        await importWrappedOrgContentKeyFromRecovery({
          orgId: orgRecovery.org_id,
          wrappedOck: orgRecovery.recovery_wrapped_ock,
        });
        const bootstrap = await buildCurrentOrgContentKeyBootstrap({
          orgId: orgRecovery.org_id,
          keyVersion: orgRecovery.key_version,
        });
        await bootstrapCurrentOrgContentKey(bootstrap);
      }
      setTrustedDevices(await listTrustedDevices().catch(() => [trustedDevice]));
      setAckPreview(restored.accountContentKey);
      setSigningKeyPreview(restored.publicKey);
      setSigningKeySynced(true);
      setHasRecoveryBundle(true);
      toast.success("Restored local encryption keys from the recovery phrase.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore recovery bundle.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleDeleteRecoveryBundle = async () => {
    await deleteRecoveryBundle().catch(() => undefined);
    await clearStoredRecoveryBundle();
    setHasRecoveryBundle(false);
    toast.success("Removed the stored recovery bundle for this account.");
  };

  const handleApproveHarness = async (enrollment: WorkerEnrollmentStatusResponse) => {
    if (!userId || !currentUser?.org_id) {
      toast.error("Could not resolve the current account.");
      return;
    }

    const certificate = await buildWorkerCertificate({
      accountId: currentUser.org_id,
      apiKeyId: enrollment.api_key_id,
      encPublicKey: enrollment.request.enc_public_key,
      signPublicKey: enrollment.request.sign_public_key,
    });

    setBusyWorkerId(enrollment.api_key_id);
    try {
      const wrappedAck = await wrapAccountContentKeyForWorker({
        workerPublicKey: certificate.enc_public_key,
        keyVersion,
      });
      const wrappedOck = await wrapOrgContentKeyForWorker({
        orgId: currentUser.org_id,
        keyVersion,
        workerPublicKey: certificate.enc_public_key,
      });
      await approveWorkerEnrollment(enrollment.api_key_id, {
        certificate,
        wrapped_ack: wrappedAck,
        wrapped_ock: wrappedOck,
      });
      toast.success("Harness approved.");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve harness.");
    } finally {
      setBusyWorkerId(null);
    }
  };

  const handleApproveDevice = async (enrollment: DeviceEnrollmentPayload) => {
    const wrappedAck = await wrapAccountContentKeyForWorker({
      workerPublicKey: enrollment.enc_public_key,
      keyVersion,
    });
    await approveDeviceEnrollment(enrollment.device_id, {
      wrapped_ack: wrappedAck,
    });
    setDeviceEnrollments(await listDeviceEnrollments().catch(() => []));
    setTrustedDevices(await listTrustedDevices().catch(() => []));
    toast.success("Device approved.");
  };

  const handleRemoveTrustedDevice = async (device: TrustedDevicePayload) => {
    setRemovingDeviceId(device.device_id);
    try {
      await deleteTrustedDevice(device.device_id);
      setTrustedDevices((prev) => prev.filter((item) => item.device_id !== device.device_id));
      toast.success("Trusted device removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove trusted device.");
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const handleRemovePendingDeviceRequest = async (deviceId: string) => {
    setRemovingPendingDeviceId(deviceId);
    try {
      await deleteDeviceEnrollment(deviceId);
      setDeviceEnrollments((prev) => prev.filter((item) => item.device_id !== deviceId));
      toast.success("Device request removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove device request.");
    } finally {
      setRemovingPendingDeviceId(null);
    }
  };

  const handleRemoveHarness = async (workerId: string) => {
    setRemovingWorkerId(workerId);
    try {
      await deleteWorkerEnrollment(workerId);
      toast.success("Harness removed.");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove harness.");
    } finally {
      setRemovingWorkerId(null);
    }
  };

  const confirmDangerAction = async () => {
    const action = dangerConfirm;
    if (!action) return;

    try {
      switch (action.kind) {
        case "clear_key":
          await handleClearKey();
          break;
        case "delete_recovery_bundle":
          await handleDeleteRecoveryBundle();
          break;
        case "clear_signing_key":
          await handleClearSigningKey();
          break;
        case "remove_trusted_device":
          await handleRemoveTrustedDevice(action.device);
          break;
        case "remove_harness":
          await handleRemoveHarness(action.apiKeyId);
          break;
      }
    } finally {
      setDangerConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {showDevices && (
        <SectionCard
          title="Content"
          description="Manage the account content key used to encrypt prompts, responses, and saved content, plus the recovery bundle for restoring access."
        >
          <ItemRow
            title="Account Content Key"
            description={`Version ${keyVersion} · ${summarizeKey(ackPreview)}`}
          >
            <Button variant="primary" size="md" onClick={() => void handleGenerateKey()}>
              {ackLoading ? "Loading..." : ackPreview ? "Rotate Key" : "Generate Key"}
            </Button>
          </ItemRow>

          <div>
            <label className="theme-text-muted block text-xs font-medium uppercase tracking-[0.2em]">
              Key Version
            </label>
            <Input
              type="number"
              min={1}
              value={String(keyVersion)}
              onChange={(event) => setKeyVersion(Math.max(1, Number(event.target.value) || 1))}
              className="mt-2 w-28"
            />
          </div>

          <ItemRow
            title="Recovery Bundle"
            description={
              hasRecoveryBundle
                ? "An encrypted recovery bundle is stored for this account."
                : "No recovery bundle detected yet."
            }
          />

          <div>
            <label className="theme-text-muted block text-xs font-medium uppercase tracking-[0.2em]">
              Recovery Phrase
            </label>
            <Input
              value={recoveryPhrase}
              onChange={(event) => setRecoveryPhrase(event.target.value)}
              placeholder="Enter your saved recovery phrase"
              className="mt-2"
            />
            <div className="mt-3">
              <Button
                variant="primary"
                size="md"
                isLoading={recoveryBusy}
                disabled={!recoveryPhrase.trim()}
                onClick={() => void handleRestore()}
              >
                Restore This Device
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {showDevices && (
        <SectionCard
          title="Devices"
          description="Trusted devices hold a wrapped copy of the account content key. New devices should register themselves automatically and wait here for approval."
        >
          <ItemRow
            title="Current Device"
            description={
              autoRegisteringDevice
                ? "Registering or refreshing this device automatically."
                : "This device is registered automatically when local encryption is available."
            }
          />

          {pendingDeviceApprovals.length > 0 ? (
            <div className="space-y-3">
              <p className="theme-text text-sm font-medium">Pending Device Approvals</p>
              {pendingDeviceApprovals.map((device) => (
                <ItemRow
                  key={device.device_id}
                  title={device.device_label || device.device_id}
                  description={device.device_id}
                >
                  <VerificationWarning code={device.verification_code} />
                  <Button variant="primary" size="sm" onClick={() => void handleApproveDevice(device)}>
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={removingPendingDeviceId === device.device_id}
                    onClick={() => void handleRemovePendingDeviceRequest(device.device_id)}
                  >
                    {removingPendingDeviceId === device.device_id ? "Removing..." : "Remove"}
                  </Button>
                </ItemRow>
              ))}
            </div>
          ) : null}

          {trustedDevices.length === 0 ? (
            <div className="theme-border theme-surface-muted rounded-2xl border border-dashed px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
              No trusted devices registered yet.
            </div>
          ) : (
            <div className="space-y-3">
              {trustedDevices.map((device) => (
                <ItemRow
                  key={device.device_id}
                  title={device.device_label || device.device_id}
                  description={device.device_id}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {showWorkers && (
        <SectionCard
          title="Approvals"
          description="Harness approvals use a local signing key and a wrapped copy of the account content key. Pending requests appear here after a harness connects."
        >
        <ItemRow
          title="Harness Approval Key"
          description={
            signingKeySynced
              ? `Registered with backend · ${summarizeKey(signingKeyPreview)}`
              : summarizeKey(signingKeyPreview)
          }
        >
          <Button variant="primary" size="md" onClick={() => void handleGenerateSigningKey()}>
            {signingKeyLoading ? "Loading..." : signingKeyPreview ? "Rotate Key" : "Generate Key"}
          </Button>
        </ItemRow>

        {isLoading ? (
          <div className="theme-surface-muted h-20 animate-pulse rounded-lg" />
        ) : pendingEnrollments.length === 0 && activeEnrollments.length === 0 ? (
          <div className="theme-border theme-surface-muted rounded-lg border border-dashed px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            No harness requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingEnrollments.map((enrollment) => (
              <HarnessRow
                key={enrollment.api_key_id}
                title={harnessTitle(enrollment)}
                description={harnessDescription(enrollment, "Pending approval")}
                verificationCode={enrollment.request.verification_code}
                primaryLabel={busyWorkerId === enrollment.api_key_id ? "Approving..." : "Approve"}
                primaryDisabled={
                  ackLoading ||
                  !ackPreview ||
                  signingKeyLoading ||
                  !signingKeyPreview ||
                  busyWorkerId === enrollment.api_key_id
                }
                onPrimary={() => void handleApproveHarness(enrollment)}
              />
            ))}
            {activeEnrollments.map((enrollment) => (
              <HarnessRow
                key={enrollment.api_key_id}
                title={harnessTitle(enrollment)}
                description={harnessDescription(enrollment, "Approved")}
                primaryLabel="Approved"
                primaryDisabled
                secondaryLabel={removingWorkerId === enrollment.api_key_id ? "Removing..." : "Remove"}
                secondaryDisabled={removingWorkerId === enrollment.api_key_id}
                onSecondary={() =>
                  setDangerConfirm({
                    kind: "remove_harness",
                    apiKeyId: enrollment.api_key_id,
                    title: "Remove Harness?",
                    message:
                      "This removes the approved harness enrollment. That harness will need to reconnect and be approved again before it can run.",
                    confirmLabel: "Remove Harness",
                  })
                }
              />
            ))}
          </div>
        )}
      </SectionCard>
      )}

      {(showDevices || showWorkers) && (
        <SectionCard
          title="Danger Zone"
          description="These actions remove key material or trust relationships. Use them only when you intentionally want to break access, revoke a device, or reset recovery state."
        >
        {showDevices && ackPreview ? (
          <DangerActionRow
            title="Clear Local Content Key"
            danger="This removes the account content key from this device, so encrypted prompts, responses, and saved content can no longer be decrypted here until the device is restored or approved again."
            reason="Use this when the browser is no longer trusted, you are handing the device to someone else, or you want to force a clean restore."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "clear_key",
                  title: "Clear Local Content Key?",
                  message:
                    "This will remove the account content key from this device. Encrypted prompts, responses, and saved content will stop decrypting here until the device is restored or approved again.",
                  confirmLabel: "Clear Key",
                })
              }
            >
              Clear Key
            </Button>
          </DangerActionRow>
        ) : null}

        {showDevices && hasRecoveryBundle ? (
          <DangerActionRow
            title="Delete Recovery Bundle"
            danger="This removes the encrypted recovery bundle stored for the account. If every trusted device is lost after this, account recovery may become impossible."
            reason="Use this only when you are replacing the recovery setup immediately or intentionally removing server-side recovery material."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "delete_recovery_bundle",
                  title: "Delete Recovery Bundle?",
                  message:
                    "This will remove the encrypted recovery bundle stored for the account. If all trusted devices are lost after this, recovery may become impossible.",
                  confirmLabel: "Delete Bundle",
                })
              }
            >
              Delete Bundle
            </Button>
          </DangerActionRow>
        ) : null}

        {showWorkers && signingKeyPreview ? (
          <DangerActionRow
            title="Clear Local Harness Approval Key"
            danger="This removes the signing key this device uses to approve harness requests. This browser will stop being able to approve harnesses until a new approval key is generated and registered."
            reason="Use this when the current approval authority on this device should no longer be trusted or when you are intentionally rotating approval control."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "clear_signing_key",
                  title: "Clear Local Harness Approval Key?",
                  message:
                    "This will remove the signing key this device uses to approve harnesses. This browser will stop being able to approve harnesses until a new approval key is generated and registered.",
                  confirmLabel: "Clear Approval Key",
                })
              }
            >
              Clear Approval Key
            </Button>
          </DangerActionRow>
        ) : null}

        {showDevices && trustedDevices.map((device) => (
          <DangerActionRow
            key={`danger-device-${device.device_id}`}
            title={`Remove Trusted Device${device.device_label ? ` · ${device.device_label}` : ""}`}
            danger="This revokes the stored wrapped key for that device. It will stop receiving approved access and may need recovery or re-approval to regain it."
            reason="Use this when a device is lost, replaced, no longer belongs to you, or should no longer decrypt account content."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "remove_trusted_device",
                  device,
                  title: "Remove Trusted Device?",
                  message:
                    "This revokes the wrapped account key stored for that device. It will stop receiving approved access and may need recovery or re-approval to regain it.",
                  confirmLabel: "Remove Device",
                })
              }
              disabled={removingDeviceId === device.device_id}
            >
              {removingDeviceId === device.device_id ? "Removing..." : "Remove Device"}
            </Button>
          </DangerActionRow>
        ))}

        {showWorkers && pendingEnrollments.map((enrollment) => (
          <DangerActionRow
            key={`danger-worker-${enrollment.api_key_id}`}
            title={`Remove Harness Request · ${enrollment.api_key_id}`}
            danger="This deletes the pending harness approval request. That harness will need to reconnect and register again before it can be approved."
            reason="Use this when a request is stale, unexpected, or came from a harness you no longer want to trust."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "remove_harness",
                  apiKeyId: enrollment.api_key_id,
                  title: "Remove Harness Request?",
                  message:
                    "This deletes the pending harness approval request. That harness will need to reconnect and register again before it can be approved.",
                  confirmLabel: "Remove Request",
                })
              }
              disabled={removingWorkerId === enrollment.api_key_id}
            >
              {removingWorkerId === enrollment.api_key_id ? "Removing..." : "Remove Request"}
            </Button>
          </DangerActionRow>
        ))}
      </SectionCard>
      )}

      <ConfirmDialog
        open={dangerConfirm !== null}
        onClose={() => setDangerConfirm(null)}
        onConfirm={() => void confirmDangerAction()}
        title={dangerConfirm?.title ?? "Confirm action"}
        message={dangerConfirm?.message ?? ""}
        confirmLabel={dangerConfirm?.confirmLabel ?? "Confirm"}
        variant="danger"
        loading={false}
      />
    </div>
  );
}

function HarnessRow({
  title,
  description,
  verificationCode,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  secondaryDisabled,
  onSecondary,
}: {
  title: string;
  description: string;
  verificationCode?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
}) {
  return (
    <ItemRow title={title} description={description}>
      {verificationCode ? <VerificationWarning code={verificationCode} /> : null}
      <Button variant={primaryDisabled ? "secondary" : "primary"} size="sm" disabled={primaryDisabled} onClick={onPrimary}>
        {primaryLabel}
      </Button>
      {secondaryLabel ? (
        <Button variant="danger" size="sm" disabled={secondaryDisabled} onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
    </ItemRow>
  );
}
