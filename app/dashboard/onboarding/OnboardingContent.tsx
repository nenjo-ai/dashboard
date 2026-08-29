"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CircleCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
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
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { UnlockMethodSetup } from "@/components/auth/UnlockMethodSetup";
import {
  PackageInstallProgressBar,
  type PackageInstallProgress,
} from "@/components/packages/PackageInstallProgressBar";
import {
  OnboardingShell,
  OnboardingStepCard,
  type OnboardingStep,
} from "./OnboardingShell";
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
import {
  RECOVERY_PHRASE_FILENAME,
  RECOVERY_PHRASE_MIME_TYPE,
  isRecoveryDownloadComplete,
  recoveryPhraseFileContents,
} from "@/lib/recoveryPhraseFile";
import { normalizeRuntimeVerificationCode } from "@/lib/runtimeApproval";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

interface StepSecureWorkspaceContinueOptions {
  onPackageInstallProgress: (progress: PackageInstallProgress) => void;
}

function SecurityStage({
  complete,
  current,
  label,
}: {
  complete: boolean;
  current: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-black/[0.055] bg-white/55 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          complete
            ? "bg-emerald-500 text-white"
            : current
              ? "bg-deep-space-blue-500 text-white"
              : "theme-surface-muted-strong theme-text-muted"
        }`}
      >
        {complete ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${current ? "bg-white" : "bg-current opacity-55"}`} />
        )}
      </span>
      <span className={`text-xs font-medium ${current ? "theme-text" : "theme-text-muted"}`}>
        {label}
      </span>
    </div>
  );
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
  const [downloaded, setDownloaded] = useState(false);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCommitted, setRecoveryCommitted] = useState(false);
  const [installingPackages, setInstallingPackages] = useState(false);
  const [packageSetupComplete, setPackageSetupComplete] = useState(false);
  const [installProgress, setInstallProgress] =
    useState<PackageInstallProgress | null>(null);

  const recoveryDownloadComplete = isRecoveryDownloadComplete({
    hasRecoveryBundle: Boolean(recoveryBundle),
    recoveryFileDownloaded: downloaded,
    backupAcknowledged,
  });

  const initializeWorkspace = useCallback(async () => {
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
      const storedDraft = sessionStorage.getItem(RECOVERY_DRAFT_SESSION_KEY);

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
      setDownloaded(false);
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

  const handleDownload = useCallback(() => {
    try {
      const file = new Blob([recoveryPhraseFileContents(recoveryPhrase)], {
        type: RECOVERY_PHRASE_MIME_TYPE,
      });
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = RECOVERY_PHRASE_FILENAME;
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setDownloaded(true);
    } catch {
      setError("Could not download the recovery file.");
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
    if (!recoveryBundle || !recoveryDownloadComplete) return;
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
        throw new Error("This browser does not have local access to shared workspace content yet.");
      }
      sessionStorage.removeItem(RECOVERY_DRAFT_SESSION_KEY);
      setRecoveryPhrase("");
      setRecoveryBundle(null);
      setDownloaded(false);
      setBackupAcknowledged(false);
      setRecoveryCommitted(true);
      await installRequiredPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to store the recovery bundle.");
    } finally {
      setSubmitting(false);
    }
  }, [
    installRequiredPackages,
    recoveryBundle,
    recoveryDownloadComplete,
  ]);

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Private by design
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Secure your workspace
        </h1>
        <p className="theme-text-muted mt-2 max-w-2xl text-sm leading-6">
          This device is creating local encryption keys and a recovery file for your workspace.
        </p>
      </div>

      <div className="theme-border theme-surface-muted grid gap-2 rounded-2xl border p-3 sm:grid-cols-2">
        <SecurityStage
          complete={!loading && Boolean(recoveryBundle)}
          current={loading}
          label="Secure this device"
        />
        <SecurityStage
          complete={downloaded || recoveryCommitted}
          current={!loading && Boolean(recoveryBundle) && !downloaded && !recoveryCommitted}
          label="Save recovery file"
        />
        <SecurityStage
          complete={packageSetupComplete}
          current={recoveryCommitted && !packageSetupComplete}
          label="Install essentials"
        />
        <SecurityStage
          complete={false}
          current={packageSetupComplete}
          label="Choose unlock method"
        />
      </div>

      {loading ? (
        <LoadingStatus
          label="Securing this workspace"
          description="Preparing local encryption material and your recovery file."
        />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      ) : null}

      {installingPackages ? (
        <div className="theme-border theme-surface-muted rounded-2xl border p-4 sm:p-5">
          <p className="theme-text text-sm font-medium">
            Installing Nenjo packages
          </p>
          <p className="theme-text-muted mt-1 text-sm">
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
          <div className="theme-border theme-surface-muted rounded-2xl border p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <Download className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="theme-text text-sm font-semibold">Save your recovery file</h2>
                <p className="theme-text-muted mt-1 text-sm leading-6">
                  Keep this file somewhere private and separate from this device. Nenjo will not display its recovery contents on this screen.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleDownload}
              className="mt-4 w-full sm:w-auto"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {downloaded ? "Download recovery file again" : "Download recovery file"}
            </Button>

            {downloaded ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Recovery file downloaded
              </p>
            ) : null}
          </div>

          <label className="theme-border theme-surface-muted flex items-start gap-3 rounded-xl border p-3.5 text-sm">
            <input
              type="checkbox"
              checked={backupAcknowledged}
              disabled={!downloaded}
              onChange={(event) => setBackupAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="theme-text-muted leading-5">
              I downloaded the recovery file and stored it somewhere private.
            </span>
          </label>

          <Button
            onClick={() => void handleContinue()}
            isLoading={submitting}
            disabled={!recoveryDownloadComplete}
            className="w-full sm:w-auto sm:min-w-40"
          >
            Secure workspace
          </Button>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Name Workspace
// ---------------------------------------------------------------------------

function StepCreateWorkspace({
  onContinue,
}: {
  onContinue: (workspaceName: string) => void | Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    queueMicrotask(() => setLoading(true));
    try {
      const trimmed = workspaceName.trim();
      await updateCurrentOrg({ name: trimmed });
      await onContinue(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to name this workspace");
    } finally {
      setLoading(false);
    }
  }, [onContinue, workspaceName]);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Welcome to Nenjo
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Name your workspace
        </h1>
        <p className="theme-text-muted mt-2 max-w-2xl text-sm leading-6">
          Your workspace is the shared home for agents, projects, workers, and everything they create together.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      )}

      <div className="max-w-xl">
        <Label htmlFor="workspace-name" required>Workspace name</Label>
        <Input
          id="workspace-name"
          autoComplete="organization"
          autoFocus
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          placeholder="Acme Workspace"
          className="h-11"
        />
        <p className="theme-text-muted mt-2 text-xs leading-5">
          You can invite teammates and change this name later in Settings.
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        isLoading={loading}
        disabled={!workspaceName.trim()}
        className="w-full sm:w-auto sm:min-w-44"
      >
        Create workspace
      </Button>
    </form>
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
  const [name, setName] = useState("Anthropic Configuration");
  const [baseUrl, setBaseUrl] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProviderChange = useCallback(
    (newProvider: ModelProvider) => {
      setProvider(newProvider);
      const providerInfo = MODEL_PROVIDERS.find((p) => p.id === newProvider);
      if (providerInfo) {
        setModel(providerInfo.models[0] ?? "");
        setName(`${providerInfo.label} Configuration`);
      }
      setBaseUrl("");
      setContextWindow("");
      setError(null);
      onProviderSelected(newProvider);
    },
    [onProviderSelected],
  );

  const handleSubmit = useCallback(async () => {
    setError(null);
    const modelName = model.trim();
    const configurationName = name.trim();
    const endpoint = baseUrl.trim();
    const contextWindowValue = contextWindow.trim();
    const parsedContextWindow = contextWindowValue
      ? Number(contextWindowValue)
      : undefined;
    const requiresBaseUrl = provider === "vllm" || provider === "openai-compatible";

    if (!modelName || !configurationName) return;

    if (
      parsedContextWindow !== undefined &&
      (!Number.isSafeInteger(parsedContextWindow) || parsedContextWindow <= 0)
    ) {
      setError("Context window must be a positive whole number of tokens.");
      return;
    }

    if (requiresBaseUrl) {
      if (!endpoint) {
        setError(`Base URL is required for ${provider === "vllm" ? "vLLM" : "OpenAI Compatible"}.`);
        return;
      }

      try {
        new URL(endpoint);
      } catch {
        setError("Enter a valid model server URL, including http:// or https://.");
        return;
      }
    }

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
        slug: resourceSlug(configurationName),
        name: configurationName,
        model: modelName,
        model_provider: provider,
        temperature,
        tags: ["nenji"],
        base_url: endpoint || undefined,
        context_window: parsedContextWindow,
      });

      await updateAgent(nenjiAgent.id, {
        model_id: agent.id,
      });

      onCreated(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to configure Nenji");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, contextWindow, name, model, onCreated, provider, temperature]);

  const providerInfo = MODEL_PROVIDERS.find((p) => p.id === provider);
  const requiresBaseUrl = provider === "vllm" || provider === "openai-compatible";

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Your first collaborator
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Choose Nenji&apos;s model
        </h1>
        <p className="theme-text-muted mt-2 max-w-2xl text-sm leading-6">
          Select the provider and model Nenji should use. You can add more model configurations later.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="nenji-provider" required>Provider</Label>
          <Select
            id="nenji-provider"
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

        <div className="min-w-0">
          <Label htmlFor="nenji-model" required>Model</Label>
          <Input
            id="nenji-model"
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
          {providerInfo?.models.length === 0 && (
            <p className="theme-text-muted mt-2 text-xs">
              Enter the exact model identifier exposed by your model server.
            </p>
          )}
        </div>

        {requiresBaseUrl && (
          <div className="sm:col-span-2">
            <Label htmlFor="nenji-base-url" required>Base URL</Label>
            <Input
              id="nenji-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "vllm"
                  ? "http://localhost:8000/v1"
                  : "http://localhost:1234/v1"
              }
            />
            <p className="theme-text-muted mt-2 text-xs">
              Use the OpenAI-compatible API endpoint reachable by your Nenjo worker.
            </p>
          </div>
        )}

        <div className="min-w-0">
          <Label htmlFor="nenji-configuration-name" required>Configuration name</Label>
          <Input
            id="nenji-configuration-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Primary model"
          />
          <p className="theme-text-muted mt-2 text-xs">
            This labels the reusable model configuration, not Nenji itself.
          </p>
        </div>

        <div className="min-w-0">
          <Label htmlFor="nenji-context-window">Context window</Label>
          <Input
            id="nenji-context-window"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
            placeholder="128000"
          />
          <p className="theme-text-muted mt-2 text-xs">
            Maximum tokens per request. Leave blank to use the provider default.
          </p>
        </div>

        <div className="theme-border theme-surface-muted rounded-2xl border p-4 sm:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="theme-text text-sm font-medium">Response style</p>
              <p className="theme-text-muted mt-0.5 text-xs">Balanced by default; adjust anytime.</p>
            </div>
            <span className="theme-border theme-surface rounded-lg border px-2.5 py-1 font-mono text-xs">
              {temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            aria-label="Model temperature"
            className="mt-4 w-full accent-deep-space-blue-500"
          />
          <div className="theme-text-muted mt-1 flex justify-between text-xs">
            <span>Precise</span>
            <span>Balanced</span>
            <span>Creative</span>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        isLoading={loading}
        disabled={
          !name.trim() ||
          !model.trim() ||
          (requiresBaseUrl && !baseUrl.trim())
        }
        className="w-full sm:w-auto sm:min-w-52"
      >
        Save Nenji configuration
      </Button>

      <button
        type="button"
        onClick={onSkip}
        className="theme-text-muted w-full text-center text-sm underline-offset-4 transition-colors hover:underline hover:text-gray-800 dark:hover:text-gray-200 sm:w-auto"
      >
        Skip model setup and open dashboard
      </button>
    </form>
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
  const hasRestored = useRef(false);

  // Restore an already-created key after a transient remount, but never create
  // credentials merely because the user viewed this step.
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

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
  }, []);

  const createWorkerKey = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const key = await createApiKey({ name: "Worker Key" });
      setCreatedKey(key);
      setRawKey(key.raw_key);
      setHasCopied(false);
      setRevealed(false);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Worker access
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Create a worker key
        </h1>
        <p className="theme-text-muted mt-2 max-w-2xl text-sm leading-6">
          This key lets your local Nenjo worker connect to this workspace. It does not expose your sign-in credentials.
        </p>
      </div>

      {error && (
        <div className="space-y-3">
          <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
            {error}
          </div>
          <Button onClick={() => void createWorkerKey()} variant="secondary">
            Try again
          </Button>
        </div>
      )}

      {!rawKey && !loading && !error ? (
        <div className="theme-border theme-surface-muted rounded-2xl border p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-deep-space-blue-500/10 text-deep-space-blue-600 dark:text-deep-space-blue-300">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="theme-text text-sm font-semibold">Generate when you&apos;re ready</h2>
              <p className="theme-text-muted mt-1 text-sm leading-6">
                Nenjo shows a new key once. You&apos;ll copy it before continuing to the connection instructions.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => void createWorkerKey()}
            className="mt-5 w-full sm:w-auto sm:min-w-48"
          >
            Generate worker key
          </Button>
        </div>
      ) : null}

      {loading ? <LoadingStatus label="Creating your worker key" /> : null}

      {rawKey && !loading && (
        <>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3.5 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            Copy this key now. Nenjo will hide it when you leave this step.
          </div>

          <div className="theme-border theme-surface-muted rounded-2xl border p-4">
            <code className="theme-text block min-h-12 w-full break-all rounded-xl bg-black/[0.035] p-3 font-mono text-sm leading-6 dark:bg-black/20">
              {revealed ? rawKey : "•".repeat(rawKey.length)}
            </code>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRevealed((r) => !r)}
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                {revealed ? "Hide" : "Reveal"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? "Copied" : "Copy key"}
              </Button>
            </div>
          </div>

          <Button
            size="lg"
            onClick={() => {
              if (createdKey) {
                setRawKey(null);
                sessionStorage.removeItem(SESSION_KEY);
                onContinue(createdKey);
              }
            }}
            disabled={!hasCopied}
            className="w-full sm:w-auto sm:min-w-48"
          >
            {hasCopied ? "Continue to connection" : "Copy key to continue"}
          </Button>
        </>
      )}

      {!loading ? (
        <button
          type="button"
          onClick={onSkip}
          className="theme-text-muted w-full text-center text-sm underline-offset-4 transition-colors hover:underline hover:text-gray-800 dark:hover:text-gray-200 sm:w-auto"
        >
          Skip key creation for now
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Connect Worker
// ---------------------------------------------------------------------------

function ConnectionCommand({
  command,
  copied,
  copyLabel = "Copy command",
  description,
  number,
  onCopy,
  title,
}: {
  command: string;
  copied: boolean;
  copyLabel?: string;
  description: string;
  number: number;
  onCopy: () => void;
  title: string;
}) {
  return (
    <div className="theme-border theme-surface-muted rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <span className="theme-border theme-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="theme-text text-sm font-semibold">{title}</h2>
          <p className="theme-text-muted mt-1 text-xs leading-5">{description}</p>
        </div>
      </div>
      <div className="relative mt-3">
        <pre className="theme-border theme-text overflow-x-auto rounded-xl border bg-black/[0.035] p-3 pr-32 font-mono text-xs leading-6 dark:bg-black/20">
          {command}
        </pre>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCopy}
          className="absolute right-2 top-2 bg-[var(--app-surface)]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : copyLabel}
        </Button>
      </div>
    </div>
  );
}

function StepConnect({
  provider,
  rawWorkerKey,
  accountOrgId,
}: {
  provider: ModelProvider;
  rawWorkerKey: string;
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
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [sendGreeting, setSendGreeting] = useState(true);
  const [greeting, setGreeting] = useState<"idle" | "priming" | "thinking" | "done">("idle");
  const [nenjiIdentity, setNenjiIdentity] = useState(DEFAULT_NENJI_IDENTITY);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalCode, setApprovalCode] = useState("");
  const hasHandledConnection = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingEnrollment = (enrollments ?? []).find(
    (item) => item.state === "pending" || (item.state === "active" && !item.wrapped_ock),
  );
  const envVar = PROVIDER_ENV_VARS[provider];
  const installCommand = "curl -fsSL https://nenjo.ai/install | bash";
  const providerCommand = envVar
    ? `export ${envVar}=your-provider-key-here`
    : `# Configure ${provider} credentials for your local runtime`;
  const visibleWorkerCommand = "export NENJO_API_KEY=paste-your-worker-key-here\nnenjo run";
  const workerCommand = `export NENJO_API_KEY=${rawWorkerKey || "paste-your-worker-key-here"}\nnenjo run`;

  const handleApproveRuntime = useCallback(async () => {
    const verificationCode = normalizeRuntimeVerificationCode(approvalCode);
    if (!pendingEnrollment || !verificationCode || !accountOrgId) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
        const [ack, signingPublicKey, orgContentStatus] = await Promise.all([
          loadStoredAccountContentKey(),
          loadAccountSigningPublicKey(),
          fetchCurrentOrgContentKeyStatus(),
        ]);
        if (!ack) {
          throw new Error(
            "This browser is missing the local account content key needed to approve the runtime.",
          );
        }
        if (!signingPublicKey) {
          throw new Error(
            "This browser is missing the account signing key needed to approve the runtime.",
          );
        }
        const orgId = orgContentStatus.org_id || accountOrgId;
        if (!orgId) {
          throw new Error("Could not resolve the workspace id for runtime approval.");
        }
        const localOck = await loadStoredOrgContentKey(
          orgContentStatus.org_id,
          orgContentStatus.key_version,
        );
        if (!localOck) {
          throw new Error(
            "This browser does not have the workspace content key needed to approve the runtime. Re-secure the workspace or restore from recovery.",
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
          apiKeyId: pendingEnrollment.api_key_id,
          encPublicKey: pendingEnrollment.request.enc_public_key,
          signPublicKey: pendingEnrollment.request.sign_public_key,
        });
        const wrappedAck = await wrapAccountContentKeyForWorker({
          workerPublicKey: pendingEnrollment.request.enc_public_key,
        });
        const wrappedOck = await wrapOrgContentKeyForWorker({
          orgId,
          keyVersion: orgContentStatus.key_version,
          workerPublicKey: pendingEnrollment.request.enc_public_key,
        });
        await approveWorkerEnrollment(pendingEnrollment.api_key_id, {
          verification_code: verificationCode,
          certificate,
          wrapped_ack: wrappedAck,
          wrapped_ock: wrappedOck,
        });
        setApprovalCode("");
        setApprovalError(null);
        await mutateEnrollments();
      } catch (err) {
        setApprovalError(
          err instanceof Error ? err.message : "Failed to approve the runtime.",
        );
      } finally {
        setApprovalBusy(false);
      }
  }, [
    accountOrgId,
    approvalCode,
    mutateEnrollments,
    pendingEnrollment,
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

  const handleCopyCommand = useCallback(async (name: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(name);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch {
      // fallback
    }
  }, []);

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
    <div className="space-y-6">
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Bring it online
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Connect your worker
        </h1>
        <p className="theme-text-muted mt-2 max-w-2xl text-sm leading-6">
          Run these three steps in your terminal. Nenjo will notice the worker as soon as it comes online.
        </p>
      </div>

      <div className="grid gap-3">
        <ConnectionCommand
          number={1}
          title="Install the Nenjo CLI"
          description="Install the local runtime on the machine that will run your agents."
          command={installCommand}
          copied={copiedCommand === "install"}
          onCopy={() => void handleCopyCommand("install", installCommand)}
        />
        <ConnectionCommand
          number={2}
          title="Add your provider credential"
          description="Replace the placeholder with the credential from your model provider."
          command={providerCommand}
          copied={copiedCommand === "provider"}
          onCopy={() => void handleCopyCommand("provider", providerCommand)}
        />
        <ConnectionCommand
          number={3}
          title="Start the worker"
          description={rawWorkerKey ? "The copied command includes the worker key you just created; the key stays hidden on screen." : "Paste a worker key where shown, then start the runtime."}
          command={visibleWorkerCommand}
          copyLabel={rawWorkerKey ? "Copy with key" : "Copy command"}
          copied={copiedCommand === "worker"}
          onCopy={() => void handleCopyCommand("worker", workerCommand)}
        />
      </div>

      {/* Greeting checkbox */}
      <label className="theme-border theme-surface-muted flex cursor-pointer select-none items-center gap-3 rounded-xl border p-3.5">
        <input
          type="checkbox"
          checked={sendGreeting}
          onChange={(e) => setSendGreeting(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500 dark:border-gray-600 dark:bg-gray-800"
        />
        <span className="theme-text-muted text-sm">
          Have Nenji greet me after connecting
        </span>
      </label>

      {approvalError ? (
        <div className="rounded-lg border border-flag-red-200 bg-flag-red-50 p-3 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-400">
          <p className="font-medium">Runtime approval failed</p>
          <p className="mt-1">{approvalError}</p>
          <p className="mt-2 text-xs opacity-90">
            Confirm the code shown by the runtime and try again.
          </p>
        </div>
      ) : null}

      <div className="theme-border theme-surface-muted overflow-hidden rounded-2xl border">
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
          <div className="flex items-start gap-3 p-4">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute h-3 w-3 motion-safe:animate-ping rounded-full bg-deep-space-blue-400 opacity-75" />
              <div className="relative h-3 w-3 rounded-full bg-deep-space-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {pendingEnrollment
                  ? approvalBusy
                    ? "Approving runtime..."
                    : "Runtime awaiting approval"
                  : "Waiting for runtime connection..."}
              </p>
              {pendingEnrollment ? (
                <div className="mt-3 max-w-md space-y-2">
                  <Input
                    aria-label="Runtime verification code"
                    autoCapitalize="none"
                    autoComplete="one-time-code"
                    className="font-mono tracking-[0.12em]"
                    onChange={(event) => setApprovalCode(event.target.value)}
                    placeholder="Enter verification code"
                    spellCheck={false}
                    value={approvalCode}
                  />
                  <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">Type the code shown in the runtime terminal. Nenjo verifies it before granting access.</p>
                  <Button disabled={!approvalCode.trim()} isLoading={approvalBusy} onClick={() => void handleApproveRuntime()}>Approve runtime</Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          void handleSkip();
        }}
        className="theme-text-muted w-full text-center text-sm underline-offset-4 transition-colors hover:underline hover:text-gray-800 dark:hover:text-gray-200 sm:w-auto"
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
      return "This browser could not create the device encryption key needed for approval. On some mobile browsers, X25519 Web Crypto support is incomplete. Use the recovery details from your saved file on this device, or approve from a browser with broader Web Crypto support.";
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
      setError("Workspace name is required.");
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
      setError(err instanceof Error ? err.message : "Failed to create a new workspace.");
    } finally {
      setCreatingOrg(false);
    }
  }, [newOrgName, onStartFresh]);

  return (
    <div className="space-y-5">
      <div>
        <p className="theme-text-muted text-[11px] font-semibold uppercase tracking-[0.13em]">
          Trusted access
        </p>
        <h1 className="theme-text mt-1.5 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">
          Add this device
        </h1>
        <p className="theme-text-muted mt-2 text-sm leading-6">
          This Nenjo workspace already exists. Approve this browser from a trusted device or restore it with the recovery details saved for <span className="theme-text font-medium">{userId}</span>.
        </p>
      </div>

      {loading ? (
        <LoadingStatus label="Checking for your recovery bundle" />
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
                    <div className="h-2.5 w-2.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none" />
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
                        <div className="h-2.5 w-2.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none" />
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
                    Restore with your recovery file
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Open your saved recovery file and paste its recovery phrase here to restore this browser without waiting for another device.
                  </p>
                </div>

                {hasBundle ? (
                  <>
                    <div>
                      <Label htmlFor="recovery-phrase" required>Recovery phrase from file</Label>
                      <Input
                        id="recovery-phrase"
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
                    No recovery information is available for this workspace yet, so file-based restore is not available on this device.
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
                    Create a new workspace instead
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    If you lost both your trusted devices and your recovery file, start a fresh workspace on this same account.
                  </p>
                </div>

                <div>
                  <Label htmlFor="new-workspace-name" required>New workspace name</Label>
                  <Input
                    id="new-workspace-name"
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
                  Create new workspace
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

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
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

  const loadingSpinner = (
    <LoadingStatus label="Loading your account" className="py-12" />
  );

  const gateSpinner = (
    <LoadingStatus
      label="Checking your Nenjo account state"
      description="This decides whether this browser should start fresh or enroll as another trusted device."
      className="py-12"
    />
  );

  const gateFailure = (
    <div className="mx-auto w-full max-w-sm space-y-4 py-6">
      <div className="rounded-xl border border-flag-red-200 bg-flag-red-50 p-4 text-sm text-flag-red-700 dark:border-flag-red-800 dark:bg-flag-red-900/20 dark:text-flag-red-300">
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
      <div
        key={`${onboardingMode}-${currentStep}`}
        className="animate-fade-in-up"
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
          <StepCreateWorkspace
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
            rawWorkerKey={createdKey?.raw_key || ""}
            accountOrgId={selectedOrgId ?? currentUser?.org_id ?? ""}
          />
        )}
      </div>
      )}
    </>
  ) : (
    loadingSpinner
  );

  return (
    <OnboardingShell
      currentStep={currentStep}
      restoreMode={onboardingMode === "restore"}
      showProgress={Boolean(isLoaded && user && gateStatus === "ready")}
    >
      <OnboardingStepCard>{stepContent}</OnboardingStepCard>
    </OnboardingShell>
  );
}
