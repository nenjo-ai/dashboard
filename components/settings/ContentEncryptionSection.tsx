"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { CircleCheck, Clock3, HardDrive, KeyRound, ServerCog, ShieldCheck } from "lucide-react";
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
  RecoveryBundlePayload,
  TrustedDevicePayload,
  WorkerHarnessMetadata,
  WorkerEnrollmentStatusResponse,
} from "@/lib/types";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { normalizeRuntimeVerificationCode, runtimeApprovalCanSubmit } from "@/lib/runtimeApproval";

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

type RecoveryBundleSource = "local" | "server";

interface RecoveryBundleCandidate {
  source: RecoveryBundleSource;
  bundle: RecoveryBundlePayload;
}

function recoveryBundleFingerprint(bundle: RecoveryBundlePayload): string {
  return [bundle.salt, bundle.nonce, bundle.ciphertext].join(":");
}

function recoveryBundleCandidates(
  local: RecoveryBundlePayload | null,
  remote: RecoveryBundlePayload | null,
): RecoveryBundleCandidate[] {
  const candidates: RecoveryBundleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [
    local ? { source: "local" as const, bundle: local } : null,
    remote ? { source: "server" as const, bundle: remote } : null,
  ]) {
    if (!candidate) continue;
    const fingerprint = recoveryBundleFingerprint(candidate.bundle);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push(candidate);
  }
  return candidates;
}

function formatRecoveryBundleTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDeviceTimestamp(value: string | null | undefined): string | null {
  return formatRecoveryBundleTimestamp(value ?? undefined);
}

function deviceRowDescription(deviceId: string, details: Array<string | null>): string {
  const present = details.filter(Boolean);
  return present.length > 0 ? `${deviceId} · ${present.join(" · ")}` : deviceId;
}

function deviceEnrollmentDescription(device: DeviceEnrollmentPayload): string {
  const requestedAt = formatDeviceTimestamp(device.created_at);
  const updatedAt = formatDeviceTimestamp(device.updated_at);
  return deviceRowDescription(device.device_id, [
    requestedAt ? `requested ${requestedAt}` : null,
    updatedAt ? `updated ${updatedAt}` : null,
  ]);
}

function trustedDeviceDescription(device: TrustedDevicePayload): string {
  const enrolledAt = formatDeviceTimestamp(device.created_at);
  const refreshedAt = formatDeviceTimestamp(device.updated_at);
  return deviceRowDescription(device.device_id, [
    enrolledAt ? `enrolled ${enrolledAt}` : null,
    refreshedAt ? `refreshed ${refreshedAt}` : null,
  ]);
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
    <section className="theme-border theme-surface overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-5">
        <h3 className="theme-text text-base font-semibold">{title}</h3>
        <p className="theme-text-muted mt-1 max-w-3xl text-sm leading-6">{description}</p>
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
    <div className="theme-border theme-surface-muted rounded-xl border px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="theme-text text-sm font-medium">{title}</p>
          <p className="theme-text-muted mt-1 max-w-3xl text-xs leading-5">{description}</p>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
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
    <div className="rounded-xl border border-red-200/70 bg-red-50/60 p-4 dark:border-red-500/20 dark:bg-red-500/6">
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

function SecurityStatusCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "ready" | "attention";
}) {
  const toneClass = tone === "ready"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
    : tone === "attention"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
      : "bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300";
  return (
    <div className="theme-border theme-surface flex min-w-0 items-start gap-3 rounded-2xl border p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="theme-text text-lg font-semibold tracking-[-0.02em]">{value}</p>
        <p className="theme-text mt-0.5 text-xs font-medium">{label}</p>
        <p className="theme-text-muted mt-1 text-[11px] leading-4">{detail}</p>
      </div>
    </div>
  );
}

type ContentEncryptionSectionMode = "all" | "devices" | "workers";

export function ContentEncryptionSection({
  mode = "all",
  afterSummary,
}: {
  mode?: ContentEncryptionSectionMode;
  afterSummary?: React.ReactNode;
}) {
  const { userId, currentUser } = useCurrentUser();
  const showDevices = mode === "all" || mode === "devices";
  const showWorkers = mode === "all" || mode === "workers";
  const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);
  const [approvingDeviceId, setApprovingDeviceId] = useState<string | null>(null);
  const [removingWorkerId, setRemovingWorkerId] = useState<string | null>(null);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);
  const [removingPendingDeviceId, setRemovingPendingDeviceId] = useState<string | null>(null);
  const [deviceApprovalCodes, setDeviceApprovalCodes] = useState<Record<string, string>>({});
  const [workerApprovalCodes, setWorkerApprovalCodes] = useState<Record<string, string>>({});
  const [autoRegisteringDevice, setAutoRegisteringDevice] = useState(false);
  const keyVersion = 1;
  const [ackPreview, setAckPreview] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState(true);
  const [signingKeyPreview, setSigningKeyPreview] = useState<string | null>(null);
  const [signingKeyLoading, setSigningKeyLoading] = useState(true);
  const [signingKeySynced, setSigningKeySynced] = useState(false);
  const [hasRecoveryBundle, setHasRecoveryBundle] = useState(false);
  const [recoveryBundleSummary, setRecoveryBundleSummary] = useState<string | null>(null);
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
    if (!showDevices) return;
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
  }, [showDevices]);

  useEffect(() => {
    if (!showDevices) return;
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
  }, [showDevices]);

  useEffect(() => {
    if (!showDevices) return;
    let cancelled = false;

    const loadRecovery = async () => {
      const local = await loadStoredRecoveryBundle();
      const remote = await fetchRecoveryBundle().catch(() => ({ recovery_bundle: null }));
      if (cancelled) return;
      const remoteBundle = remote.recovery_bundle;
      setHasRecoveryBundle(Boolean(local ?? remoteBundle));
      const localCreatedAt = formatRecoveryBundleTimestamp(local?.created_at);
      const remoteCreatedAt = formatRecoveryBundleTimestamp(remoteBundle?.created_at);
      if (local && remoteBundle && recoveryBundleFingerprint(local) !== recoveryBundleFingerprint(remoteBundle)) {
        setRecoveryBundleSummary(
          [
            localCreatedAt ? `local copy: ${localCreatedAt}` : "local copy detected",
            remoteCreatedAt ? `server copy: ${remoteCreatedAt}` : "server copy detected",
          ].join("; "),
        );
      } else if (localCreatedAt || remoteCreatedAt) {
        setRecoveryBundleSummary(`created ${localCreatedAt ?? remoteCreatedAt}`);
      } else {
        setRecoveryBundleSummary(local ?? remoteBundle ? "encrypted bundle detected" : null);
      }
      if (!local && remoteBundle) {
        await storeRecoveryBundle(remoteBundle).catch(() => undefined);
      }
    };

    void loadRecovery();
    return () => {
      cancelled = true;
    };
  }, [showDevices]);

  useEffect(() => {
    if (!showWorkers) return;
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
  }, [showWorkers]);

  useEffect(() => {
    if (!showDevices) return;
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
  }, [ackLoading, ackPreview, keyVersion, showDevices]);

  const { data: enrollments, isLoading, mutate } = useSWR<WorkerEnrollmentStatusResponse[]>(
    userId && showWorkers ? workerEnrollmentUrl() : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const pendingEnrollments = (enrollments ?? []).filter((item) => item.state === "pending");
  const activeEnrollments = (enrollments ?? []).filter((item) => item.state === "active");
  const pendingDeviceApprovals = useMemo(
    () => deviceEnrollments.filter((item) => item.state === "pending"),
    [deviceEnrollments],
  );

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
    toast.success("Stored an encrypted local runtime approval key on this device.");
  };

  const handleClearSigningKey = async () => {
    await clearAccountSigningKeyPair();
    await deleteWorkerApprovalKey().catch(() => undefined);
    setSigningKeyPreview(null);
    setSigningKeySynced(false);
    toast.success("Removed the local runtime approval key from this device.");
  };

  const handleRestore = async () => {
    setRecoveryBusy(true);
    try {
      const [localBundle, remoteBundle] = await Promise.all([
        loadStoredRecoveryBundle().catch(() => null),
        fetchRecoveryBundle()
          .then((remote) => remote.recovery_bundle ?? null)
          .catch(() => null),
      ]);
      const candidates = recoveryBundleCandidates(localBundle, remoteBundle);
      if (candidates.length === 0) {
        throw new Error("No recovery bundle is stored for this account.");
      }

      let restored: Awaited<ReturnType<typeof restoreFromRecoveryBundle>> | null = null;
      let restoredFrom: RecoveryBundleCandidate | null = null;
      for (const candidate of candidates) {
        try {
          restored = await restoreFromRecoveryBundle({
            recoveryPhrase,
            bundle: candidate.bundle,
          });
          restoredFrom = candidate;
          break;
        } catch {
          // Local and server copies can diverge after stale setup attempts.
        }
      }

      if (!restored || !restoredFrom) {
        const sources = candidates.map((candidate) => candidate.source).join(" and ");
        throw new Error(
          `The recovery phrase could not decrypt the available ${sources} recovery bundle${
            candidates.length > 1 ? "s" : ""
          }. Confirm this is the phrase shown when that bundle was created.`,
        );
      }

      await putWorkerApprovalKey(restored.publicKey);
      await putRecoveryBundle(restoredFrom.bundle);
      await storeRecoveryBundle(restoredFrom.bundle);
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
      const createdAt = formatRecoveryBundleTimestamp(restoredFrom.bundle.created_at);
      setRecoveryBundleSummary(createdAt ? `created ${createdAt}` : "encrypted bundle detected");
      toast.success(
        restoredFrom.source === "local"
          ? "Restored local encryption keys from the local recovery bundle."
          : "Restored local encryption keys from the server recovery bundle.",
      );
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
    setRecoveryBundleSummary(null);
    toast.success("Removed the stored recovery bundle for this account.");
  };

  const handleApproveHarness = async (enrollment: WorkerEnrollmentStatusResponse) => {
    const verificationCode = normalizeRuntimeVerificationCode(workerApprovalCodes[enrollment.api_key_id]);
    if (!verificationCode) {
      toast.error("Enter the verification code shown by the requesting runtime.");
      return;
    }
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
        verification_code: verificationCode,
        certificate,
        wrapped_ack: wrappedAck,
        wrapped_ock: wrappedOck,
      });
      setWorkerApprovalCodes((previous) => {
        const next = { ...previous };
        delete next[enrollment.api_key_id];
        return next;
      });
      toast.success("Runtime approved.");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve runtime.");
    } finally {
      setBusyWorkerId(null);
    }
  };

  const handleApproveDevice = async (enrollment: DeviceEnrollmentPayload) => {
    const verificationCode = deviceApprovalCodes[enrollment.device_id]?.trim() ?? "";
    if (!verificationCode) {
      toast.error("Enter the verification code shown on the requesting device.");
      return;
    }

    setApprovingDeviceId(enrollment.device_id);
    try {
      const wrappedAck = await wrapAccountContentKeyForWorker({
        workerPublicKey: enrollment.enc_public_key,
        keyVersion,
      });
      await approveDeviceEnrollment(enrollment.device_id, {
        wrapped_ack: wrappedAck,
        verification_code: verificationCode,
      });
      setDeviceApprovalCodes((prev) => {
        const next = { ...prev };
        delete next[enrollment.device_id];
        return next;
      });
      setDeviceEnrollments(await listDeviceEnrollments().catch(() => []));
      setTrustedDevices(await listTrustedDevices().catch(() => []));
      toast.success("Device approved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve device.");
    } finally {
      setApprovingDeviceId(null);
    }
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
      setDeviceApprovalCodes((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
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
      toast.success("Runtime removed.");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove runtime.");
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
      <section aria-label={showWorkers ? "Runtime trust summary" : "Device trust summary"} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {showWorkers ? (
          <>
            <SecurityStatusCard icon={<ServerCog className="h-4 w-4" />} label="Approved runtimes" value={activeEnrollments.length} detail="Allowed to receive workspace work" tone={activeEnrollments.length > 0 ? "ready" : "default"} />
            <SecurityStatusCard icon={<Clock3 className="h-4 w-4" />} label="Pending approvals" value={pendingEnrollments.length} detail="Waiting for code verification" tone={pendingEnrollments.length > 0 ? "attention" : "default"} />
            <SecurityStatusCard icon={<KeyRound className="h-4 w-4" />} label="Approval authority" value={signingKeySynced ? "Ready" : "Needs setup"} detail="Local signing key registration" tone={signingKeySynced ? "ready" : "attention"} />
            <SecurityStatusCard icon={<ShieldCheck className="h-4 w-4" />} label="Content wrapping" value={ackPreview ? "Ready" : "Unavailable"} detail="Encrypted account key access" tone={ackPreview ? "ready" : "attention"} />
          </>
        ) : (
          <>
            <SecurityStatusCard icon={<ShieldCheck className="h-4 w-4" />} label="Local content" value={ackPreview ? "Unlocked" : "Locked"} detail="Encrypted workspace access here" tone={ackPreview ? "ready" : "attention"} />
            <SecurityStatusCard icon={<HardDrive className="h-4 w-4" />} label="Trusted devices" value={trustedDevices.length} detail="Devices holding wrapped access" tone={trustedDevices.length > 0 ? "ready" : "default"} />
            <SecurityStatusCard icon={<Clock3 className="h-4 w-4" />} label="Pending devices" value={pendingDeviceApprovals.length} detail="Waiting for code verification" tone={pendingDeviceApprovals.length > 0 ? "attention" : "default"} />
            <SecurityStatusCard icon={<CircleCheck className="h-4 w-4" />} label="Recovery bundle" value={hasRecoveryBundle ? "Available" : "Missing"} detail="Encrypted account recovery material" tone={hasRecoveryBundle ? "ready" : "attention"} />
          </>
        )}
      </section>
      {afterSummary}
      {showDevices && (
        <SectionCard
          title="Recovery"
          description="Manage the encrypted recovery bundle used to restore local access on this browser."
        >
          <ItemRow
            title="Recovery Bundle"
            description={
              hasRecoveryBundle
                ? recoveryBundleSummary
                  ? `An encrypted recovery bundle is available (${recoveryBundleSummary}).`
                  : "An encrypted recovery bundle is available for this account."
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
                  description={deviceEnrollmentDescription(device)}
                >
                  <div className="flex w-full flex-col gap-2 sm:w-72">
                    <Input
                      value={deviceApprovalCodes[device.device_id] ?? ""}
                      onChange={(event) =>
                        setDeviceApprovalCodes((prev) => ({
                          ...prev,
                          [device.device_id]: event.target.value,
                        }))
                      }
                      placeholder="Verification code"
                      className="h-8 text-xs"
                    />
                    <p className="theme-text-muted text-xs leading-5">
                      Enter the code shown on the requesting device before approving.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      approvingDeviceId === device.device_id ||
                      !deviceApprovalCodes[device.device_id]?.trim()
                    }
                    onClick={() => void handleApproveDevice(device)}
                  >
                    {approvingDeviceId === device.device_id ? "Approving..." : "Approve"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={
                      removingPendingDeviceId === device.device_id ||
                      approvingDeviceId === device.device_id
                    }
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
                  description={trustedDeviceDescription(device)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {showWorkers && (
        <SectionCard
          title="Approvals"
          description="Runtime approvals use a local signing key and a wrapped copy of the account content key. Pending requests appear here after a runtime connects."
        >
        <ItemRow
          title="Runtime Approval Key"
          description={
            signingKeySynced
              ? `Registered with backend · ${summarizeKey(signingKeyPreview)}`
              : summarizeKey(signingKeyPreview)
          }
        >
          <Button variant="primary" size="md" isLoading={signingKeyLoading} onClick={() => void handleGenerateSigningKey()}>
            {signingKeyPreview ? "Rotate key" : "Generate key"}
          </Button>
        </ItemRow>

        {isLoading ? (
          <div className="theme-surface-muted h-20 motion-safe:animate-pulse rounded-lg" />
        ) : pendingEnrollments.length === 0 && activeEnrollments.length === 0 ? (
          <div className="theme-border theme-surface-muted rounded-lg border border-dashed px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            No runtime requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingEnrollments.map((enrollment) => (
              <HarnessRow
                key={enrollment.api_key_id}
                title={harnessTitle(enrollment)}
                description={harnessDescription(enrollment, "Pending approval")}
                verificationCode={workerApprovalCodes[enrollment.api_key_id] ?? ""}
                onVerificationCodeChange={(verificationCode) =>
                  setWorkerApprovalCodes((previous) => ({
                    ...previous,
                    [enrollment.api_key_id]: verificationCode,
                  }))
                }
                primaryLabel={busyWorkerId === enrollment.api_key_id ? "Approving..." : "Approve"}
                primaryDisabled={
                  ackLoading ||
                  signingKeyLoading ||
                  !runtimeApprovalCanSubmit({
                    verificationCode: workerApprovalCodes[enrollment.api_key_id],
                    hasAccountContentKey: Boolean(ackPreview),
                    hasSigningKey: Boolean(signingKeyPreview),
                    busy: busyWorkerId === enrollment.api_key_id,
                  })
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
                    title: "Remove Runtime?",
                    message:
                      "This removes the approved runtime enrollment. That runtime will need to reconnect and be approved again before it can run.",
                    confirmLabel: "Remove Runtime",
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
            title="Clear Local Runtime Approval Key"
            danger="This removes the signing key this device uses to approve runtime requests. This browser will stop being able to approve runtimes until a new approval key is generated and registered."
            reason="Use this when the current approval authority on this device should no longer be trusted or when you are intentionally rotating approval control."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "clear_signing_key",
                  title: "Clear Local Runtime Approval Key?",
                  message:
                    "This will remove the signing key this device uses to approve runtimes. This browser will stop being able to approve runtimes until a new approval key is generated and registered.",
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
            title={`Remove Runtime Request · ${enrollment.api_key_id}`}
            danger="This deletes the pending runtime approval request. That runtime will need to reconnect and register again before it can be approved."
            reason="Use this when a request is stale, unexpected, or came from a runtime you no longer want to trust."
          >
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                setDangerConfirm({
                  kind: "remove_harness",
                  apiKeyId: enrollment.api_key_id,
                  title: "Remove Runtime Request?",
                  message:
                    "This deletes the pending runtime approval request. That runtime will need to reconnect and register again before it can be approved.",
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
  onVerificationCodeChange,
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
  onVerificationCodeChange?: (value: string) => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  onSecondary?: () => void;
}) {
  return (
    <ItemRow title={title} description={description}>
      {onVerificationCodeChange ? (
        <div className="w-full sm:w-72">
          <Input
            aria-label={`Verification code for ${title}`}
            autoCapitalize="none"
            autoComplete="one-time-code"
            className="h-9 font-mono text-sm tracking-[0.12em]"
            onChange={(event) => onVerificationCodeChange(event.target.value)}
            placeholder="Enter verification code"
            spellCheck={false}
            value={verificationCode ?? ""}
          />
          <p className="theme-text-muted mt-1.5 text-[11px] leading-4">Enter the code shown in the runtime before approving.</p>
        </div>
      ) : null}
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
