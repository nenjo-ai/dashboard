"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppAuth } from "@/components/auth/AppAuth";
import useSWR from "swr";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { MODEL_PROVIDERS } from "@/lib/types";
import { resourceSlug } from "@/lib/resourceSlug";
import type {
  ModelProvider,
  Model,
  CreateApiKeyResponse,
  AgentDefinition,
  RecoveryBundlePayload,
  WorkerEnrollmentStatusResponse,
} from "@/lib/types";
import {
  approveWorkerEnrollment,
  bootstrapCurrentOrgContentKey,
  createOrganization,
  createModel,
  createApiKey,
  deleteDeviceEnrollment,
  fetchBootstrapStatus,
  fetchCurrentOrgContentKeyStatus,
  fetchDeviceEnrollment,
  fetchCurrentOrgContentKeyRecovery,
  fetchRecoveryBundle,
  fetchWorkerApprovalKey,
  fetchAgents,
  fetcher,
  fetchCurrentUser,
  authMeUrl,
  listTrustedDevices,
  installOfficialNenjoPackages,
  updateCurrentOrg,
  updateAgent,
  createChatSession,
  putRecoveryBundle,
  putWorkerApprovalKey,
  registerDeviceEnrollment,
  setActiveOrgIdGetter,
  upsertTrustedDevice,
  workerEnrollmentUrl,
} from "@/lib/api";
import { useWorkerStatus } from "@/lib/hooks";
import { findNenjiAgent } from "@/lib/nenjiAgent";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { UnlockMethodSetup } from "@/components/auth/UnlockMethodSetup";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import {
  PackageInstallProgressBar,
  type PackageInstallProgress,
} from "@/components/packages/PackageInstallProgressBar";
import {
  buildCurrentOrgContentKeyBootstrap,
  buildRecoveryBundle,
  buildDeviceEnrollmentPayload,
  buildTrustedDevicePayload,
  buildWorkerCertificate,
  ensureAccountContentKey,
  ensureAccountSigningKeyPair,
  ensureDeviceEncryptionIdentity,
  generateRecoveryPhrase,
  importWrappedAccountContentKeyForDevice,
  importWrappedOrgContentKeyFromRecovery,
  loadAccountSigningPublicKey,
  loadStoredAccountContentKey,
  loadStoredOrgContentKey,
  loadStoredRecoveryBundle,
  resetLocalEncryptedWorkspaceForRestore,
  restoreFromRecoveryBundle,
  storeRecoveryBundle,
  wrapAccountContentKeyForWorker,
  wrapOrgContentKeyForWorker,
} from "@/lib/cryptoContent";
import { useSafeRouter } from "@/lib/safeRouter";
import {
  onboardingEntryGateKey,
  shouldRedirectExistingWorkspaceToDashboard,
  shouldRunOnboardingEntryGate,
  shouldUseExistingWorkspaceRestoreMode,
} from "@/lib/vaultRestoreGate.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ["Create Org", "Secure", "Create Agent", "API Key", "Connect"] as const;

const PROVIDER_ENV_VARS: Record<ModelProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "OLLAMA_HOST",
  vllm: "",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "openai-compatible": "",
};

const SESSION_KEY = "nenjo_onboarding_raw_key";
const RECOVERY_DRAFT_SESSION_KEY = "nenjo_onboarding_recovery_draft";
const NENJI_GREETING_DELAY_MS = 6000;
const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
const DEFAULT_SKIP_MESSAGE =
  "This is an automated message since the worker is not connected. Nenji will be able to help you once you connect the worker. Until then, feel free to browse around. Check out how Nenji is structured under Agents, or open the routine editor page.";
const DEFAULT_CONNECTED_GREETING =
  "Welcome to Nenjo. Nenji is online and ready to help you shape agents, routines, and context. What kind of workflow do you want to build first?";
const NENJI_SEED_COLOR = "#b8841a";
const DEFAULT_NENJI_IDENTITY = {
  roleId: "nenji",
  color: NENJI_SEED_COLOR,
};
const LOCKED_LOCAL_VAULT_MESSAGE =
  "Encrypted workspace vault is locked. Unlock it before using local secrets.";

async function loadOnboardingLocalAccountContentKey(): Promise<{
  key: string | null;
  lockedVault: boolean;
}> {
  try {
    return {
      key: await loadStoredAccountContentKey(),
      lockedVault: false,
    };
  } catch (err) {
    if (err instanceof Error && err.message === LOCKED_LOCAL_VAULT_MESSAGE) {
      return {
        key: null,
        lockedVault: true,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({
  currentStep,
}: {
  currentStep: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <div className="mb-10 grid w-full grid-cols-5 items-start">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3 | 4 | 5;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={label} className="relative flex flex-col items-center">
            {i < STEPS.length - 1 && (
              <div
                className={`absolute left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] top-4 h-0.5 ${
                  isCompleted
                    ? "bg-deep-space-blue-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
            )}

            <div
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                isCompleted
                  ? "bg-deep-space-blue-500 text-white"
                  : isActive
                    ? "border-2 border-deep-space-blue-500 text-deep-space-blue-600 dark:text-deep-space-blue-400"
                    : "border-2 border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500"
              }`}
            >
              {isCompleted ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                step
              )}
            </div>
            <span
              className={`mt-3 min-h-8 px-1 text-center text-xs font-medium leading-tight ${
                isActive
                  ? "text-deep-space-blue-600 dark:text-deep-space-blue-400"
                  : isCompleted
                    ? "text-gray-700 dark:text-gray-300"
                    : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface StepSecureWorkspaceContinueOptions {
  onPackageInstallProgress: (progress: PackageInstallProgress) => void;
}

function StepSecureWorkspace({
  onContinue,
  onFinished,
}: {
  onContinue: (
    options: StepSecureWorkspaceContinueOptions,
  ) => void | Promise<void>;
  onFinished: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryBundle, setRecoveryBundle] = useState<RecoveryBundlePayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [confirmWordA, setConfirmWordA] = useState("");
  const [confirmWordB, setConfirmWordB] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCommitted, setRecoveryCommitted] = useState(false);
  const [installingPackages, setInstallingPackages] = useState(false);
  const [packageSetupComplete, setPackageSetupComplete] = useState(false);
  const [installProgress, setInstallProgress] =
    useState<PackageInstallProgress | null>(null);

  const phraseWords = recoveryPhrase.split(" ").filter(Boolean);
  const promptIndexes = [2, 7] as const;
  const expectedWordA = phraseWords[promptIndexes[0]] ?? "";
  const expectedWordB = phraseWords[promptIndexes[1]] ?? "";
  const confirmed =
    confirmWordA.trim().toLowerCase() === expectedWordA &&
    confirmWordB.trim().toLowerCase() === expectedWordB;

  const initializeWorkspace = useCallback(async (regeneratePhrase = false) => {
    setError(null);
    setLoading(true);
    try {
      await ensureAccountContentKey();
      const { publicKey } = await ensureAccountSigningKeyPair();
      await putWorkerApprovalKey(publicKey);
      const trustedDevice = await buildTrustedDevicePayload({
        deviceLabel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "browser",
      });
      await upsertTrustedDevice(trustedDevice);

      let nextPhrase = "";
      let nextBundle: RecoveryBundlePayload | null = null;
      const storedDraft = !regeneratePhrase
        ? sessionStorage.getItem(RECOVERY_DRAFT_SESSION_KEY)
        : null;

      if (storedDraft) {
        const parsed = JSON.parse(storedDraft) as {
          phrase: string;
          bundle: RecoveryBundlePayload;
        };
        nextPhrase = parsed.phrase;
        nextBundle = parsed.bundle;
      } else {
        nextPhrase = generateRecoveryPhrase();
        nextBundle = await buildRecoveryBundle(nextPhrase);
        sessionStorage.setItem(
          RECOVERY_DRAFT_SESSION_KEY,
          JSON.stringify({ phrase: nextPhrase, bundle: nextBundle }),
        );
      }

      setRecoveryPhrase(nextPhrase);
      setRecoveryBundle(nextBundle);
      setConfirmWordA("");
      setConfirmWordB("");
      setCopied(false);
      setBackupAcknowledged(false);
      setRecoveryCommitted(false);
      setInstallingPackages(false);
      setInstallProgress(null);
      setPackageSetupComplete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to secure this workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setCopied(true);
    } catch {
      setError("Could not copy the recovery phrase to your clipboard.");
    }
  }, [recoveryPhrase]);

  const installRequiredPackages = useCallback(async () => {
    setError(null);
    setInstallingPackages(true);
    setInstallProgress({
      phase: "preparing Nenjo packages",
      progressPercent: 0,
    });
    try {
      await onContinue({
        onPackageInstallProgress: (progress) => setInstallProgress(progress),
      });
      setPackageSetupComplete(true);
      setInstallingPackages(false);
      setInstallProgress(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to install the default Nenjo packages.",
      );
      setInstallingPackages(false);
      setInstallProgress(null);
    }
  }, [onContinue]);

  const handleContinue = useCallback(async () => {
    if (!recoveryBundle || !confirmed || !copied || !backupAcknowledged) return;
    setSubmitting(true);
    try {
      await storeRecoveryBundle(recoveryBundle);
      await putRecoveryBundle(recoveryBundle);
      const deviceIdentity = await ensureDeviceEncryptionIdentity();
      const trustedDevices = await listTrustedDevices();
      const currentDeviceTrusted = trustedDevices.some(
        (device) => device.device_id === deviceIdentity.deviceId,
      );
      if (!currentDeviceTrusted) {
        throw new Error("This browser was not registered as a trusted device.");
      }
      const orgContentKeyStatus = await fetchCurrentOrgContentKeyStatus();
      await loadStoredOrgContentKey(
        orgContentKeyStatus.org_id,
        orgContentKeyStatus.key_version,
      );
      const bootstrap = await buildCurrentOrgContentKeyBootstrap({
        orgId: orgContentKeyStatus.org_id,
        keyVersion: orgContentKeyStatus.key_version,
      });
      await bootstrapCurrentOrgContentKey(bootstrap);
      const confirmedOrgKey = await loadStoredOrgContentKey(
        orgContentKeyStatus.org_id,
        orgContentKeyStatus.key_version,
      );
      if (!confirmedOrgKey) {
        throw new Error("This browser does not have local access to shared org content yet.");
      }
      sessionStorage.removeItem(RECOVERY_DRAFT_SESSION_KEY);
      setRecoveryPhrase("");
      setRecoveryBundle(null);
      setConfirmWordA("");
      setConfirmWordB("");
      setCopied(false);
      setBackupAcknowledged(false);
      setRecoveryCommitted(true);
      await installRequiredPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store the recovery bundle.");
    } finally {
      setSubmitting(false);
    }
  }, [
    backupAcknowledged,
    confirmed,
    copied,
    installRequiredPackages,
    recoveryBundle,
  ]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Secure Your Workspace</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This device is generating local encryption keys for your organization.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-deep-space-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generating local encryption material and recovery bundle...
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {installingPackages ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Installing Nenjo packages
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Setting up the default agent and workspace resources.
          </p>
          {installProgress ? (
            <PackageInstallProgressBar
              progress={installProgress}
              className="mt-4"
            />
          ) : null}
        </div>
      ) : null}

      {recoveryCommitted && !installingPackages && !packageSetupComplete ? (
        <Button onClick={() => void installRequiredPackages()} className="w-full">
          Retry Package Setup
        </Button>
      ) : null}

      {recoveryCommitted && !installingPackages && packageSetupComplete ? (
        <UnlockMethodSetup onComplete={onFinished} allowSkip />
      ) : null}

      {!loading && recoveryPhrase && !recoveryCommitted && !installingPackages ? (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Save this recovery phrase now. You can use it later to recover your encrypted resources.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {phraseWords.map((word, index) => (
              <div
                key={`${word}-${index}`}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <span className="mr-2 text-xs text-gray-400 dark:text-gray-500">{index + 1}.</span>
                {word}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                copied
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {copied ? "Copied!" : "Copy recovery phrase"}
            </button>
            <button
              type="button"
              onClick={() => void initializeWorkspace(true)}
              className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Regenerate phrase
            </button>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <input
              type="checkbox"
              checked={backupAcknowledged}
              disabled={!copied}
              onChange={(event) => setBackupAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
            />
            <span>
              I have backed up my recovery phrase and understand I will need it to recover encrypted resources.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required>Type word #{promptIndexes[0] + 1}</Label>
              <Input
                value={confirmWordA}
                onChange={(event) => setConfirmWordA(event.target.value)}
                placeholder={`Enter ${promptIndexes[0] + 1}th word`}
              />
            </div>
            <div>
              <Label required>Type word #{promptIndexes[1] + 1}</Label>
              <Input
                value={confirmWordB}
                onChange={(event) => setConfirmWordB(event.target.value)}
                placeholder={`Enter ${promptIndexes[1] + 1}th word`}
              />
            </div>
          </div>

          <Button
            onClick={() => void handleContinue()}
            isLoading={submitting}
            disabled={!confirmed || !recoveryBundle || !copied || !backupAcknowledged}
            className="w-full"
          >
            Continue
          </Button>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Create Organization
// ---------------------------------------------------------------------------

function StepCreateOrganization({
  onContinue,
}: {
  onContinue: (orgName: string) => void | Promise<void>;
}) {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    queueMicrotask(() => setLoading(true));
    try {
      const trimmed = orgName.trim();
      await updateCurrentOrg({ name: trimmed });
      await onContinue(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setLoading(false);
    }
  }, [onContinue, orgName]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Your Organization</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Name the organization that will own your shared resources and worker access.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      )}

      <div>
        <Label required>Organization Name</Label>
        <Input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Acme"
        />
      </div>

      <Button
        onClick={handleSubmit}
        isLoading={loading}
        disabled={!orgName.trim()}
        className="w-full"
      >
        Continue
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Create Agent
// ---------------------------------------------------------------------------

function StepCreateAgent({
  onCreated,
  onProviderSelected,
  onSkip,
}: {
  onCreated: (agent: Model) => void;
  onProviderSelected: (p: ModelProvider) => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState<ModelProvider>("anthropic");
  const [model, setModel] = useState(MODEL_PROVIDERS.find((p) => p.id === "anthropic")!.models[0]);
  const [name, setName] = useState("Anthropic Agent");
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProviderChange = useCallback(
    (newProvider: ModelProvider) => {
      setProvider(newProvider);
      const providerInfo = MODEL_PROVIDERS.find((p) => p.id === newProvider);
      if (providerInfo) {
        setModel(providerInfo.models[0]);
        setName(`${providerInfo.label} Agent`);
      }
      onProviderSelected(newProvider);
    },
    [onProviderSelected],
  );

  const handleSubmit = useCallback(async () => {
    setError(null);
    queueMicrotask(() => setLoading(true));
    try {
      const roles = await fetchAgents();
      const nenjiAgent = findNenjiAgent(roles);
      if (!nenjiAgent) {
        setError("Could not find Nenji. Please contact support.");
        setLoading(false);
        return;
      }

      const agent = await createModel({
        slug: resourceSlug(name),
        name,
        model,
        model_provider: provider,
        temperature,
        tags: ["nenji"],
      });

      await updateAgent(nenjiAgent.id, {
        model_id: agent.id,
      });

      onCreated(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }, [name, model, onCreated, provider, temperature]);

  const providerInfo = MODEL_PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Your First Agent</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Pick an AI provider and model to power your agent.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label required>Provider</Label>
          <Select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
          >
            {MODEL_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label required>Model</Label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list="model-hints"
            placeholder="Enter model name"
          />
          <datalist id="model-hints">
            {providerInfo?.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div>
          <Label required>Agent Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Agent"
          />
        </div>

        <div>
          <Label>Temperature: {temperature.toFixed(2)}</Label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="mt-1 w-full accent-deep-space-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        isLoading={loading}
        disabled={!name.trim() || !model.trim()}
        className="w-full"
      >
        Create Agent
      </Button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        Skip - Continue to Dashboard
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Generate API Key
// ---------------------------------------------------------------------------

function StepApiKey({
  onContinue,
  onSkip,
}: {
  onContinue: (key: CreateApiKeyResponse) => void;
  onSkip: () => void;
}) {
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCreated = useRef(false);

  // Try to restore from sessionStorage or auto-create
  useEffect(() => {
    if (hasCreated.current) return;
    hasCreated.current = true;

    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CreateApiKeyResponse & { raw_key: string };
        queueMicrotask(() => {
          setCreatedKey(parsed);
          setRawKey(parsed.raw_key);
        });
        return;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }

    // Auto-create key
    queueMicrotask(() => setLoading(true));
    createApiKey({ name: "Worker Key" })
      .then((key) => {
        setCreatedKey(key);
        setRawKey(key.raw_key);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(key));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to create API key");
        hasCreated.current = false; // allow retry
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = useCallback(async () => {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setHasCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }, [rawKey]);

  const handleRetry = useCallback(() => {
    hasCreated.current = false;
    setError(null);
    setLoading(true);
    createApiKey({ name: "Worker Key" })
      .then((key) => {
        setCreatedKey(key);
        setRawKey(key.raw_key);
        hasCreated.current = true;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(key));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to create API key");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Generate API Key</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your worker needs an API key to communicate with the platform.
        </p>
      </div>

      {error && (
        <div className="space-y-3">
          <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
            {error}
          </div>
          <Button onClick={handleRetry} variant="secondary" className="w-full">
            Retry
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-deep-space-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Creating API key...</p>
        </div>
      )}

      {rawKey && !loading && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Copy this key now — you won&apos;t see it again after leaving this page.
              </p>
            </div>
          </div>

          <div>
            <code className="block w-full break-all rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
              {revealed ? rawKey : "•".repeat(rawKey.length)}
            </code>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setRevealed((r) => !r)}
                className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                onClick={handleCopy}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  copied
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied!
                  </span>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
          </div>

          <Button
            onClick={() => {
              if (createdKey) {
                // Zeroize: clear raw key from state and sessionStorage
                setRawKey(null);
                sessionStorage.removeItem(SESSION_KEY);
                onContinue(createdKey);
              }
            }}
            disabled={!hasCopied}
            className="w-full"
          >
            {hasCopied ? "Continue" : "Copy key to continue"}
          </Button>

        </>
      )}

      {!loading ? (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          Skip for now
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Connect Worker
// ---------------------------------------------------------------------------

function StepConnect({
  provider,
  keyPrefix,
  accountOrgId,
}: {
  provider: ModelProvider;
  keyPrefix: string;
  accountOrgId: string;
}) {
  const router = useSafeRouter();
  const { user } = useAppAuth();
  const { isConnected } = useWorkerStatus({ refreshInterval: 3000 });
  const { data: enrollments, mutate: mutateEnrollments } = useSWR<WorkerEnrollmentStatusResponse[]>(
    user ? workerEnrollmentUrl() : null,
    fetcher,
    { refreshInterval: 3000, revalidateOnFocus: false },
  );
  const [copied, setCopied] = useState(false);
  const [sendGreeting, setSendGreeting] = useState(true);
  const [greeting, setGreeting] = useState<"idle" | "priming" | "thinking" | "done">("idle");
  const [nenjiIdentity, setNenjiIdentity] = useState(DEFAULT_NENJI_IDENTITY);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const hasHandledConnection = useRef(false);
  const approvalInFlight = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enrollmentsRef = useRef(enrollments);
  enrollmentsRef.current = enrollments;

  const pendingEnrollment = (enrollments ?? []).find(
    (item) => item.state === "pending" || (item.state === "active" && !item.wrapped_ock),
  );
  const envVar = PROVIDER_ENV_VARS[provider];
  const maskedKey = keyPrefix ? `${keyPrefix}${"*".repeat(12)}` : "nen_sk_***";
  const snippet = `# Install the Nenjo CLI
curl -fsSL https://nenjo.ai/install | bash

# Set your API keys
export ${envVar}=your-key-here
export NENJO_API_KEY=${maskedKey}

# Start the worker
nenjo run`;

  // Auto-approve the first harness during onboarding. Retry on a timer so a
  // silent failure (or SWR returning a stable data reference) does not leave
  // the worker stuck on "pending approval".
  useEffect(() => {
    if (!accountOrgId) return;

    let cancelled = false;

    const tryAutoApprove = async () => {
      if (cancelled || approvalInFlight.current) return;
      const enrollmentsNeedingOck = (enrollmentsRef.current ?? []).find(
        (item) => item.state === "pending" || (item.state === "active" && !item.wrapped_ock),
      );
      if (!enrollmentsNeedingOck) {
        setApprovalError(null);
        setApprovalBusy(false);
        return;
      }

      approvalInFlight.current = true;
      setApprovalBusy(true);
      try {
        const [ack, signingPublicKey, orgContentStatus] = await Promise.all([
          loadStoredAccountContentKey(),
          loadAccountSigningPublicKey(),
          fetchCurrentOrgContentKeyStatus(),
        ]);
        if (!ack) {
          throw new Error(
            "This browser is missing the local account content key needed to approve the harness.",
          );
        }
        if (!signingPublicKey) {
          throw new Error(
            "This browser is missing the account signing key needed to approve the harness.",
          );
        }
        const orgId = orgContentStatus.org_id || accountOrgId;
        if (!orgId) {
          throw new Error("Could not resolve the organization id for harness approval.");
        }
        const localOck = await loadStoredOrgContentKey(
          orgContentStatus.org_id,
          orgContentStatus.key_version,
        );
        if (!localOck) {
          throw new Error(
            "This browser does not have the org content key needed to approve the harness. Re-secure the workspace or restore from recovery.",
          );
        }

        const remoteApprovalKey = await fetchWorkerApprovalKey().catch(() => ({
          public_key: null as string | null,
        }));
        if (remoteApprovalKey.public_key !== signingPublicKey) {
          await putWorkerApprovalKey(signingPublicKey);
        }

        const certificate = await buildWorkerCertificate({
          accountId: orgId,
          apiKeyId: enrollmentsNeedingOck.api_key_id,
          encPublicKey: enrollmentsNeedingOck.request.enc_public_key,
          signPublicKey: enrollmentsNeedingOck.request.sign_public_key,
        });
        const wrappedAck = await wrapAccountContentKeyForWorker({
          workerPublicKey: enrollmentsNeedingOck.request.enc_public_key,
        });
        const wrappedOck = await wrapOrgContentKeyForWorker({
          orgId,
          keyVersion: orgContentStatus.key_version,
          workerPublicKey: enrollmentsNeedingOck.request.enc_public_key,
        });
        await approveWorkerEnrollment(enrollmentsNeedingOck.api_key_id, {
          certificate,
          wrapped_ack: wrappedAck,
          wrapped_ock: wrappedOck,
        });
        if (cancelled) return;
        setApprovalError(null);
        await mutateEnrollments();
      } catch (err) {
        if (cancelled) return;
        setApprovalError(
          err instanceof Error ? err.message : "Failed to auto-approve the harness.",
        );
      } finally {
        approvalInFlight.current = false;
        if (!cancelled) setApprovalBusy(false);
      }
    };

    void tryAutoApprove();
    const intervalId = window.setInterval(() => {
      void tryAutoApprove();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    accountOrgId,
    mutateEnrollments,
    // Re-arm immediately when a new pending harness appears (interval covers retries).
    pendingEnrollment?.api_key_id,
    pendingEnrollment?.state,
  ]);

  // Handle successful worker connection
  useEffect(() => {
    if (!isConnected || hasHandledConnection.current) return;
    if ((enrollments ?? []).some((item) => item.state === "pending")) return;
    hasHandledConnection.current = true;

    sessionStorage.removeItem(SESSION_KEY);

    if (!sendGreeting) {
      router.push("/dashboard/chat");
      return;
    }

    (async () => {
      try {
        const agents = await fetchAgents();
        const nenjiAgent = findNenjiAgent(agents);

        if (!nenjiAgent) {
          router.push("/dashboard/chat");
          return;
        }

        setNenjiIdentity({
          roleId: nenjiAgent.id,
          color: nenjiAgent.color ?? NENJI_SEED_COLOR,
        });

        const session = await createChatSession({
          agent_id: nenjiAgent.id,
          title: "Welcome",
        });

        setGreeting("thinking");

        const displayName =
          user?.firstName ??
          user?.username ??
          user?.primaryEmailAddress?.emailAddress ??
          "there";
        sessionStorage.setItem(
          LOCAL_CHAT_SEED_KEY,
          JSON.stringify({
            session_id: session.id,
            timestamp: session.created_at,
            message: `Welcome to Nenjo, ${displayName}. ${DEFAULT_CONNECTED_GREETING.slice("Welcome to Nenjo. ".length)}`,
          }),
        );

        navigationTimerRef.current = setTimeout(() => {
          setGreeting("done");
          router.push(`/dashboard/chat?session=${session.id}`);
        }, NENJI_GREETING_DELAY_MS);
      } catch {
        router.push("/dashboard/chat");
      }
    })();
  }, [enrollments, isConnected, sendGreeting, router, user]);

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [snippet]);

  const handleSkip = useCallback(async () => {
    sessionStorage.removeItem(SESSION_KEY);

    try {
      const agents = await fetchAgents();
      const nenjiAgent = findNenjiAgent(agents);

      if (!nenjiAgent) {
        router.push("/dashboard/chat");
        return;
      }

      const session = await createChatSession({
        agent_id: nenjiAgent.id,
        title: "Welcome",
      });

      sessionStorage.setItem(
        LOCAL_CHAT_SEED_KEY,
        JSON.stringify({
          session_id: session.id,
          timestamp: session.created_at,
          message: DEFAULT_SKIP_MESSAGE,
        }),
      );

      router.push(`/dashboard/chat?session=${session.id}`);
    } catch {
      router.push("/dashboard/chat");
    }
  }, [router]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connect Your Worker</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Install the CLI and start the worker to connect your agent.
        </p>
      </div>

      <div className="relative">
        <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 pr-14 font-mono text-sm leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {snippet}
        </pre>
        <button
          onClick={handleCopy}
          className={`absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            copied
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Greeting checkbox */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sendGreeting}
          onChange={(e) => setSendGreeting(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-800"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Have Nenji greet me after connecting
        </span>
      </label>

      {approvalError ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          <p className="font-medium">Harness auto-approval failed</p>
          <p className="mt-1">{approvalError}</p>
          <p className="mt-2 text-xs opacity-90">
            Keep this page open while the worker is running. Nenjo will keep retrying approval.
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {isConnected ? (
          <div className="relative p-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_55%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-deep-space-blue-400/20 blur-xl" />
                  <RoleIdenticon
                    roleId={nenjiIdentity.roleId}
                    color={nenjiIdentity.color}
                    size={72}
                    animate={sendGreeting && greeting !== "idle" && greeting !== "done"}
                    className="relative ring-4 ring-white/80 dark:ring-gray-900/70"
                    name="Nenji"
                  />
                </div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-deep-space-blue-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-deep-space-blue-700 dark:border-deep-space-blue-500/40 dark:bg-gray-900/60 dark:text-deep-space-blue-300">
                    <span className={`h-2 w-2 rounded-full ${sendGreeting && greeting !== "done" ? "animate-pulse bg-deep-space-blue-500" : "bg-green-500"}`} />
                    {sendGreeting ? "Nenji" : "Worker online"}
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {sendGreeting
                      ? greeting === "done"
                        ? "Nenji is ready."
                        : "Priming Nenji"
                      : "Worker connected!"}
                  </p>
                  <p className="max-w-md text-sm text-gray-600 dark:text-gray-300">
                    {sendGreeting
                      ? greeting === "done"
                        ? "Opening chat."
                        : "Preparing your first Nenji chat."
                      : "Jumping straight to chat."}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:min-w-56">
                <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 dark:border-gray-700/80 dark:bg-gray-900/60">
                  Worker link: stable
                </div>
                <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 dark:border-gray-700/80 dark:bg-gray-900/60">
                  {sendGreeting
                    ? greeting === "done"
                      ? "Redirecting to Nenji chat"
                      : `Priming for at least ${Math.round(NENJI_GREETING_DELAY_MS / 1000)} seconds`
                    : "Redirecting to chat"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute h-3 w-3 animate-ping rounded-full bg-deep-space-blue-400 opacity-75" />
              <div className="relative h-3 w-3 rounded-full bg-deep-space-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {pendingEnrollment
                  ? approvalBusy
                    ? "Approving harness..."
                    : "Harness registered — auto-approving..."
                  : "Waiting for worker connection..."}
              </p>
              {pendingEnrollment?.request.verification_code ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Verification code:{" "}
                  <span className="font-mono font-semibold tracking-wider text-gray-700 dark:text-gray-200">
                    {pendingEnrollment.request.verification_code}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          void handleSkip();
        }}
        className="w-full text-center text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        Skip — I&apos;ll connect later
      </button>
    </div>
  );
}

function StepRestoreDevice({
  userId,
  onRestored,
  onStartFresh,
}: {
  userId: string;
  onRestored: () => void;
  onStartFresh: (orgId: string) => void;
}) {
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [hasBundle, setHasBundle] = useState(false);
  const [trustedDeviceCount, setTrustedDeviceCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceEnrollmentId, setDeviceEnrollmentId] = useState<string | null>(null);
  const [deviceVerificationCode, setDeviceVerificationCode] = useState<string | null>(null);

  const normalizeEnrollmentError = useCallback((err: unknown) => {
    const message =
      err instanceof Error ? err.message : "Failed to register this device for approval.";
    if (
      typeof window !== "undefined" &&
      (!window.isSecureContext || typeof window.crypto?.subtle === "undefined")
    ) {
      return "This browser is not running in a secure context, so Web Crypto is unavailable for device enrollment. Open Nenjo over HTTPS or localhost before trying to approve this device.";
    }
    if (/x25519|algorithm|generatekey|derivebits/i.test(message)) {
      return "This browser could not create the device encryption key needed for approval. On some mobile browsers, X25519 Web Crypto support is incomplete. Use the recovery phrase on this device, or approve from a browser with broader Web Crypto support.";
    }
    return message;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBundle = async () => {
      const [local, remote] = await Promise.all([
        loadStoredRecoveryBundle(),
        fetchRecoveryBundle().catch(() => ({ recovery_bundle: null })),
      ]);
      if (cancelled) return;
      setHasBundle(Boolean(local ?? remote.recovery_bundle));
    };

    const refreshTrustedDevices = async () => {
      try {
        const devices = await listTrustedDevices();
        if (cancelled) return;
        setTrustedDeviceCount(devices.length);
      } catch {
        if (cancelled) return;
        setTrustedDeviceCount(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadBundle();
    void refreshTrustedDevices();
    const interval = window.setInterval(() => {
      void refreshTrustedDevices();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const registerForApproval = useCallback(async () => {
    setError(null);
    setRegistering(true);
    try {
      await resetLocalEncryptedWorkspaceForRestore();
      const enrollment = await buildDeviceEnrollmentPayload({
        deviceLabel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "browser",
      });
      const registered = await registerDeviceEnrollment(enrollment);
      setDeviceEnrollmentId(registered.device_id);
      setDeviceVerificationCode(registered.verification_code);
    } catch (err) {
      setError(normalizeEnrollmentError(err));
    } finally {
      setRegistering(false);
    }
  }, [normalizeEnrollmentError]);

  const cancelApprovalRequest = useCallback(async () => {
    if (!deviceEnrollmentId) return;
    setRegistering(true);
    setError(null);
    try {
      await deleteDeviceEnrollment(deviceEnrollmentId);
      setDeviceEnrollmentId(null);
      setDeviceVerificationCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel the approval request.");
    } finally {
      setRegistering(false);
    }
  }, [deviceEnrollmentId]);

  useEffect(() => {
    if (!deviceEnrollmentId) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const enrollment = await fetchDeviceEnrollment(deviceEnrollmentId);
          if (enrollment.state !== "active" || !enrollment.wrapped_ack) return;
          await importWrappedAccountContentKeyForDevice(enrollment.wrapped_ack);
          const trustedDevice = await buildTrustedDevicePayload({
            deviceLabel:
              typeof navigator !== "undefined"
                ? navigator.userAgent.slice(0, 80)
                : "browser",
            requireSigningKey: false,
          });
          await upsertTrustedDevice(trustedDevice);
          onRestored();
        } catch {
          // keep polling
        }
      })();
    }, 3000);

    return () => clearInterval(interval);
  }, [deviceEnrollmentId, onRestored]);

  const handleRestore = useCallback(async () => {
    setError(null);
    setRestoring(true);
    try {
      const remote = await fetchRecoveryBundle();
      const bundle = remote.recovery_bundle;
      if (!bundle) {
        throw new Error("No recovery bundle is stored for this account yet.");
      }

      const restored = await restoreFromRecoveryBundle({
        recoveryPhrase,
        bundle,
        resetLocalVault: true,
      });
      await putWorkerApprovalKey(restored.publicKey);
      const trustedDevice = await buildTrustedDevicePayload({
        deviceLabel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "browser",
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
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore this device.");
    } finally {
      setRestoring(false);
    }
  }, [onRestored, recoveryPhrase]);

  const handleCreateNewOrg = useCallback(async () => {
    const trimmed = newOrgName.trim();
    if (!trimmed) {
      setError("Organization name is required.");
      return;
    }

    setError(null);
    setCreatingOrg(true);
    try {
      const created = await createOrganization({ name: trimmed });
      try {
        localStorage.setItem("nenjo.active-org-id", created.org_id);
      } catch {
        // Ignore storage failures.
      }
      setActiveOrgIdGetter(() => created.org_id);
      onStartFresh(created.org_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create a new organization.");
    } finally {
      setCreatingOrg(false);
    }
  }, [newOrgName, onStartFresh]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add This Device</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          This Nenjo account already exists. Approve this browser from a trusted device or restore it with your recovery phrase for <span className="font-medium text-gray-700 dark:text-gray-200">{userId}</span>.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-deep-space-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Checking for a recovery bundle...
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {!loading ? (
        <>
          <div className="space-y-4 md:space-y-5">
            {trustedDeviceCount === null ? (
              <div className="rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-500/15 dark:text-deep-space-blue-300">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Checking trusted devices
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Nenjo is still checking whether another trusted device can approve this browser.
                    </p>
                  </div>
                </div>
              </div>
            ) : trustedDeviceCount > 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-deep-space-blue-600 dark:text-deep-space-blue-300">
                      Option 1
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                      Approve from a trusted device
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      Request approval from another browser or device you already trust for this same account. This is optional and only works if you still have access to an existing trusted device.
                    </p>
                  </div>

                  <div className="flex items-start gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-500/15 dark:text-deep-space-blue-300">
                      {deviceEnrollmentId || registering ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <div className="h-2.5 w-2.5 rounded-full bg-current/70" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {deviceEnrollmentId
                          ? "Waiting for approval"
                          : registering
                            ? "Preparing approval request"
                            : "Ready to request approval"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {deviceEnrollmentId
                          ? "Enter the code below in Settings on another trusted device before approving this request."
                          : registering
                            ? "Sending approval request..."
                            : "If another trusted device is available, you can send an approval request from here."}
                      </p>
                      {deviceVerificationCode ? (
                        <div className="rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-base font-semibold tracking-[0.28em] text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-gray-100">
                          {deviceVerificationCode}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {!deviceEnrollmentId ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => void registerForApproval()}
                        disabled={registering}
                      >
                        {registering ? "Requesting approval..." : "Request approval from another device"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void cancelApprovalRequest()}
                        disabled={registering}
                      >
                        {registering ? "Cancelling..." : "Cancel request"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                    This device will become trusted
                  </p>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    No trusted devices found
                  </h3>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Nenjo did not find any existing trusted devices for this account, so this browser cannot be approved by another device. Restore it here and it will become a trusted device for future approvals.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                    Option 2
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                    Restore with recovery phrase
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Use your recovery phrase if you want to restore this browser directly without waiting for another device to approve it.
                  </p>
                </div>

                {hasBundle ? (
                  <>
                    <div>
                      <Label required>Recovery Phrase</Label>
                      <Input
                        value={recoveryPhrase}
                        onChange={(event) => setRecoveryPhrase(event.target.value)}
                        placeholder="Enter your saved recovery phrase"
                      />
                    </div>

                    <Button
                      onClick={() => void handleRestore()}
                      isLoading={restoring}
                      disabled={!recoveryPhrase.trim()}
                      className="w-full"
                    >
                      Restore This Device
                    </Button>
                  </>
                ) : (
                  <div className="rounded-xl border border-flag-red-200 bg-flag-red-50 p-4 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
                    No recovery bundle is available for this account yet, so recovery-phrase restore is not available on this device.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                    Escape hatch
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                    Create a new organization instead
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    If you lost both your trusted devices and your recovery phrase, start a fresh workspace under a new organization on this same account.
                  </p>
                </div>

                <div>
                  <Label required>New Organization Name</Label>
                  <Input
                    value={newOrgName}
                    onChange={(event) => setNewOrgName(event.target.value)}
                    placeholder="Acme 2"
                  />
                </div>

                <Button
                  onClick={() => void handleCreateNewOrg()}
                  isLoading={creatingOrg}
                  disabled={!newOrgName.trim()}
                  className="w-full"
                >
                  Create New Organization
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Onboarding Wizard
// ---------------------------------------------------------------------------

export default function OnboardingContent() {
  const { user, isLoaded } = useAppAuth();
  const router = useSafeRouter();
  const searchParams = useSearchParams();
  const forceRestore = searchParams.get("restore") === "1";
  const redirected = useRef(false);
  const resolvedEntryGateKey = useRef<string | null>(null);
  const officialPackagesInstalledForOrg = useRef<string | null>(null);
  const { data: currentUser } = useSWR(user ? authMeUrl() : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  }) as {
    data:
      | {
          user_id: string | null;
          clerk_id?: string;
          session_id?: string | null;
          org_id?: string | null;
          org_name?: string | null;
          org_role?: string | null;
          onboarded?: boolean;
        }
      | undefined;
  };

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [onboardingMode, setOnboardingMode] = useState<"fresh" | "restore">("fresh");
  const [gateStatus, setGateStatus] = useState<"checking" | "ready" | "error">("checking");
  const [gateError, setGateError] = useState<string | null>(null);
  const [, setCreatedAgent] = useState<Model | null>(null);
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("anthropic");
  const [selectedOrgIdOverride, setSelectedOrgId] = useState<string | null>(null);
  const selectedOrgId = selectedOrgIdOverride ?? currentUser?.org_id ?? null;
  const accountUserId = currentUser?.user_id ?? undefined;
  const signedInUserId = user?.id ?? null;
  const entryGateKey = onboardingEntryGateKey({
    accountId: signedInUserId,
    forceRestore,
  });

  useEffect(() => {
    if (redirected.current) return;
    if (!isLoaded) return;

    if (!signedInUserId) {
      const timeout = setTimeout(() => {
        if (!signedInUserId && !redirected.current) {
          redirected.current = true;
          router.replace("/dashboard/login");
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }

    if (
      !shouldRunOnboardingEntryGate({
        resolvedKey: resolvedEntryGateKey.current,
        nextKey: entryGateKey,
      })
    ) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || redirected.current) return;
      setGateStatus("checking");
      setGateError(null);
    });

    (async () => {
      try {
        const [me, localAckState, bootstrap] = await Promise.all([
          fetchCurrentUser(),
          loadOnboardingLocalAccountContentKey(),
          fetchBootstrapStatus().catch(() => null),
        ]);
        if (cancelled || redirected.current) return;

        const hasOrg = Boolean(me.org_id);
        const hasExistingWorkspace =
          Boolean(me.onboarded) ||
          Boolean(bootstrap?.has_recovery_bundle) ||
          (bootstrap?.trusted_device_count ?? 0) > 0;

        const hasSignedInAccount = Boolean(me.user_id || me.clerk_id);

        if (
          shouldRedirectExistingWorkspaceToDashboard({
            hasSignedInAccount,
            hasOrg,
            hasExistingWorkspace,
            hasLocalAccountContentKey: Boolean(localAckState.key),
            lockedVault: localAckState.lockedVault,
            forceRestore,
          })
        ) {
          resolvedEntryGateKey.current = entryGateKey;
          redirected.current = true;
          router.replace("/dashboard");
          return;
        }

        if (
          shouldUseExistingWorkspaceRestoreMode({
            hasSignedInAccount,
            hasOrg,
            hasExistingWorkspace,
            hasLocalAccountContentKey: Boolean(localAckState.key),
            lockedVault: localAckState.lockedVault,
            forceRestore,
          })
        ) {
          setOnboardingMode("restore");
        } else {
          setOnboardingMode("fresh");
        }

        resolvedEntryGateKey.current = entryGateKey;
        setGateStatus("ready");
      } catch (err) {
        if (cancelled || redirected.current) return;
        setGateStatus("error");
        setGateError(
          err instanceof Error
            ? err.message
            : "Failed to determine whether this device should onboard or restore.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entryGateKey, forceRestore, isLoaded, router, signedInUserId]);

  const maxWidth =
    onboardingMode === "restore"
      ? "max-w-5xl"
      : currentStep === 5
        ? "max-w-2xl"
        : currentStep === 4
          ? "max-w-md"
          : currentStep === 3
            ? "max-w-sm"
            : currentStep === 2
              ? "max-w-2xl"
              : "max-w-sm";

  const loadingSpinner = (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
    </div>
  );

  const gateSpinner = (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Checking your Nenjo account state
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This decides whether this browser should start fresh or enroll as another trusted device.
        </p>
      </div>
    </div>
  );

  const gateFailure = (
    <div className="mx-auto w-full max-w-sm space-y-4 py-6">
      <div className="rounded-lg border border-[#ff5555]/40 bg-[#ff5555]/10 p-4 text-sm text-[#ff8888]">
        {gateError ?? "Failed to determine whether this device should onboard or restore."}
      </div>
      <Button onClick={() => window.location.reload()} className="w-full">
        Retry account check
      </Button>
    </div>
  );

  const stepContent = isLoaded && user ? (
    <>
      {gateStatus === "checking" ? gateSpinner : null}
      {gateStatus === "error" ? gateFailure : null}
      {gateStatus !== "ready" ? null : (
        <>
      {onboardingMode === "fresh" ? <StepIndicator currentStep={currentStep} /> : null}

      <div
        key={`${onboardingMode}-${currentStep}`}
        className="onboarding-step-panel animate-fade-in-up"
      >
        {onboardingMode === "restore" ? (
          <StepRestoreDevice
            userId={accountUserId ?? user.id}
            onRestored={() => router.replace("/dashboard")}
            onStartFresh={(orgId) => {
              setSelectedOrgId(orgId);
              setOnboardingMode("fresh");
              setCurrentStep(2);
            }}
          />
        ) : null}

        {onboardingMode === "fresh" && currentStep === 1 && (
          <StepCreateOrganization
            onContinue={() => setCurrentStep(2)}
          />
        )}

        {onboardingMode === "fresh" && currentStep === 2 && (
          <StepSecureWorkspace
            onContinue={async ({ onPackageInstallProgress }) => {
              const orgId = selectedOrgId ?? currentUser?.org_id ?? null;
              if (!orgId || officialPackagesInstalledForOrg.current !== orgId) {
                await installOfficialNenjoPackages({
                  onProgress: onPackageInstallProgress,
                });
                if (orgId) officialPackagesInstalledForOrg.current = orgId;
              }
            }}
            onFinished={() => {
              setCurrentStep(3);
            }}
          />
        )}

        {onboardingMode === "fresh" && currentStep === 3 && (
          <StepCreateAgent
            onCreated={(agent) => {
              setCreatedAgent(agent);
              setCurrentStep(4);
            }}
            onProviderSelected={setSelectedProvider}
            onSkip={() => router.replace("/dashboard")}
          />
        )}

        {onboardingMode === "fresh" && currentStep === 4 && (
          <StepApiKey
            onContinue={(key) => {
              setCreatedKey(key);
              setCurrentStep(5);
            }}
            onSkip={() => setCurrentStep(5)}
          />
        )}

        {onboardingMode === "fresh" && currentStep === 5 && (
          <StepConnect
            provider={selectedProvider}
            keyPrefix={createdKey?.key_prefix || ""}
            accountOrgId={selectedOrgId ?? currentUser?.org_id ?? ""}
          />
        )}

        {onboardingMode === "fresh" && currentStep === 1 && (
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Welcome{user.firstName ? `, ${user.firstName}` : user.primaryEmailAddress?.emailAddress ? `, ${user.primaryEmailAddress.emailAddress}` : ""}! Let&apos;s get your organization set up.
          </p>
        )}
      </div>
        </>
      )}
    </>
  ) : (
    loadingSpinner
  );

  return (
    <div className="onboarding-landing dark flex min-h-screen bg-[#05070f] text-[#eaeef8] lg:overflow-hidden">
      {/* Left panel – branding */}
      <div className="onboarding-brand-panel relative hidden overflow-hidden border-r border-white/10 bg-[#05070f] p-12 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <div className="onboarding-brand-grid" />
        <div className="onboarding-brand-glow" />

        <div className="relative z-10">
          <Link
            href="/"
            className="onboarding-brand-link inline-flex items-center gap-3 text-white transition-colors"
          >
            <NenjoLogoMark className="h-10 w-10 rounded-lg" />
            <span className="text-sm font-light tracking-[0.25em] text-white uppercase">
              Nenjo
            </span>
          </Link>
        </div>

        <div className="relative z-10 flex flex-col items-start gap-8">
          <div className="flex flex-col gap-2">
            <span className="onboarding-kanji text-8xl font-light tracking-wider leading-none">念</span>
            <span className="onboarding-kanji text-8xl font-light tracking-wider leading-none">助</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-white/30" />
            <span className="text-lg font-light tracking-[0.3em] text-white/60 uppercase">Nenjo</span>
          </div>

          <div className="max-w-md space-y-4">
            <h2 className="onboarding-quote text-2xl font-semibold leading-snug text-white/95">
              &ldquo;Mindful assistance&rdquo;
            </h2>
            <p className="text-base leading-relaxed text-white/60">
              <span className="text-white/80 font-medium">念 (nen)</span> — thought, mindfulness, attention.
              The focused intention behind every action.
            </p>
            <p className="text-base leading-relaxed text-white/60">
              <span className="text-white/80 font-medium">助 (jo)</span> — help, assistance, support.
              The act of empowering others to achieve more.
            </p>
            <p className="mt-6 text-sm leading-relaxed text-white/40">
              Together, Nenjo represents the philosophy of thoughtful, intelligent assistance —
              AI agents that work with purpose and precision to help you build faster.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} Nenjo. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel – onboarding wizard */}
      <div className="onboarding-wizard-panel flex min-h-screen w-full flex-col items-center justify-center overflow-y-auto bg-[#080c18] px-4 py-8 sm:px-6 sm:py-10 lg:w-1/2 lg:px-8 lg:py-12">
        <div className={`onboarding-wizard-card w-full transition-[max-width] duration-300 ease-in-out ${maxWidth}`}>
          <div className="mb-6 text-center lg:hidden">
            <Link
              href="/"
              className="onboarding-brand-link inline-flex items-center gap-3 transition-colors"
            >
              <NenjoLogoMark className="h-10 w-10 rounded-lg" />
              <span className="text-sm font-light uppercase tracking-[0.25em]">
                Nenjo
              </span>
            </Link>
          </div>

          {stepContent}
        </div>
      </div>
    </div>
  );
}
