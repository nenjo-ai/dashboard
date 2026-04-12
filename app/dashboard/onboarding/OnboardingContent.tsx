"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { MODEL_PROVIDERS } from "@/lib/types";
import type { ModelProvider, Model, CreateApiKeyResponse, AgentDefinition } from "@/lib/types";
import {
  createModel,
  createApiKey,
  fetchAgents,
  updateAgent,
  fetchSystemProject,
  createChatSession,
  fetchCurrentUser,
} from "@/lib/api";
import { useWorkerStatus } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ["Create Agent", "API Key", "Connect"] as const;

const PROVIDER_ENV_VARS: Record<ModelProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "OLLAMA_HOST",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "openai-compatible": "",
};

const SESSION_KEY = "nenjo_onboarding_raw_key";
const NENJI_GREETING_DELAY_MS = 6000;
const LOCAL_CHAT_SEED_KEY = "nenjo:local_chat_seed";
const DEFAULT_SKIP_MESSAGE =
  "This is an automated message since the worker is not connected. Nenji will be able to help you once you connect the worker. Until then, feel free to browse around. Check out how Nenji is structured under Agents, or open the routine editor page.";
const DEFAULT_CONNECTED_GREETING =
  "Welcome to Nenjo. Nenji is online and ready to help you shape agents, routines, and context. What kind of workflow do you want to build first?";
const DEFAULT_NENJI_IDENTITY = {
  roleId: "nenji",
  color: "#2563eb",
};

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({
  currentStep,
}: {
  currentStep: 1 | 2 | 3;
}) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-0.5 w-10 sm:w-16 ${
                  isCompleted
                    ? "bg-deep-space-blue-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
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
                className={`text-xs font-medium ${
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
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Create Agent
// ---------------------------------------------------------------------------

function StepCreateAgent({
  onCreated,
  onProviderSelected,
}: {
  onCreated: (agent: Model) => void;
  onProviderSelected: (p: ModelProvider) => void;
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
      // Find system role
      const roles = await fetchAgents();
      const systemRole = roles.find((r) => r.name === "system");
      if (!systemRole) {
        setError("Could not find system role. Please contact support.");
        setLoading(false);
        return;
      }

      // Create agent
      const agent = await createModel({
        name,
        model,
        model_provider: provider,
        temperature,
        tags: ["system"],
      });

      // Assign model to system agent
      await updateAgent(systemRole.id, {
        model_id: agent.id,
      });

      onCreated(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }, [name, model, provider, temperature, onCreated]);

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Generate API Key
// ---------------------------------------------------------------------------

function StepApiKey({
  onContinue,
}: {
  onContinue: (key: CreateApiKeyResponse) => void;
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Connect Worker
// ---------------------------------------------------------------------------

function StepConnect({
  provider,
  keyPrefix,
}: {
  provider: ModelProvider;
  keyPrefix: string;
}) {
  const router = useRouter();
  const { user } = useUser();
  const { isConnected } = useWorkerStatus();
  const [copied, setCopied] = useState(false);
  const [sendGreeting, setSendGreeting] = useState(true);
  const [greeting, setGreeting] = useState<"idle" | "priming" | "thinking" | "done">("idle");
  const [nenjiIdentity, setNenjiIdentity] = useState(DEFAULT_NENJI_IDENTITY);
  const hasHandledConnection = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const envVar = PROVIDER_ENV_VARS[provider];
  const maskedKey = keyPrefix ? `${keyPrefix}${"*".repeat(12)}` : "nen_sk_***";
  const snippet = `# Install the Nenjo CLI
curl -fsSL https://nenjo.ai/install | bash

# Set your API keys
export ${envVar}=your-key-here
export NENJO_API_KEY=${maskedKey}

# Start the worker
nenjo run`;

  // Handle successful worker connection
  useEffect(() => {
    if (!isConnected || hasHandledConnection.current) return;
    hasHandledConnection.current = true;

    sessionStorage.removeItem(SESSION_KEY);

    if (!sendGreeting) {
      router.push("/dashboard/chat");
      return;
    }

    (async () => {
      try {
        const systemProject = await fetchSystemProject();
        const agents = await fetchAgents();
        const systemAgent = agents.find((a) => a.name === "system");

        if (!systemAgent || !systemProject) {
          router.push("/dashboard/chat");
          return;
        }

        setNenjiIdentity({
          roleId: systemAgent.id,
          color: systemAgent.color,
        });

        const session = await createChatSession({
          project_id: systemProject.id,
          agent_id: systemAgent.id,
          title: "Welcome",
        });

        setGreeting("thinking");

        const displayName = user?.firstName ?? user?.username ?? "there";
        sessionStorage.setItem(
          LOCAL_CHAT_SEED_KEY,
          JSON.stringify({
            session_id: session.id,
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
  }, [isConnected, sendGreeting, router, user]);

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
      const systemProject = await fetchSystemProject();
      const agents = await fetchAgents();
      const systemAgent = agents.find((a) => a.name === "system");

      if (!systemProject || !systemAgent) {
        router.push("/dashboard/chat");
        return;
      }

      const session = await createChatSession({
        project_id: systemProject.id,
        agent_id: systemAgent.id,
        title: "Welcome",
      });

      sessionStorage.setItem(
        LOCAL_CHAT_SEED_KEY,
        JSON.stringify({
          session_id: session.id,
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
          Have the system agent greet me after connecting
        </span>
      </label>

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
                    roleName="Nenji"
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
                Waiting for worker connection...
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Polling every 10 seconds
              </p>
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

// ---------------------------------------------------------------------------
// Main Onboarding Wizard
// ---------------------------------------------------------------------------

export default function OnboardingContent() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const redirected = useRef(false);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [, setCreatedAgent] = useState<Model | null>(null);
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>("anthropic");

  // Single redirect effect — runs once when Clerk is loaded.
  // Checks the backend to see if the user has already completed onboarding.
  useEffect(() => {
    if (redirected.current) return;
    if (!isLoaded) return;

    // Not authenticated (give Clerk a moment after OAuth callback)
    if (!user) {
      const timeout = setTimeout(() => {
        if (!user && !redirected.current) {
          redirected.current = true;
          router.replace("/dashboard/login");
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }

    // Check backend for onboarding status
    let cancelled = false;
    fetchCurrentUser()
      .then((me) => {
        if (cancelled || redirected.current) return;
        if (me.onboarded) {
          redirected.current = true;
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // If the API call fails, let the user proceed with onboarding
      });
    return () => { cancelled = true; };
  }, [isLoaded, user, router]);

  const maxWidth = currentStep === 3 ? "max-w-2xl" : currentStep === 2 ? "max-w-md" : "max-w-sm";

  const loadingSpinner = (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-space-blue-500 border-t-transparent" />
    </div>
  );

  const stepContent = isLoaded && user ? (
    <>
      <StepIndicator currentStep={currentStep} />

      <div
        key={currentStep}
        className="animate-fade-in-up"
      >
        {currentStep === 1 && (
          <StepCreateAgent
            onCreated={(agent) => {
              setCreatedAgent(agent);
              setCurrentStep(2);
            }}
            onProviderSelected={setSelectedProvider}
          />
        )}

        {currentStep === 2 && (
          <StepApiKey
            onContinue={(key) => {
              setCreatedKey(key);
              setCurrentStep(3);
            }}
          />
        )}

        {currentStep === 3 && (
          <StepConnect
            provider={selectedProvider}
            keyPrefix={createdKey?.key_prefix || ""}
          />
        )}

        {currentStep === 1 && (
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Welcome{user.firstName ? `, ${user.firstName}` : ""}! Let&apos;s get your workspace set up.
          </p>
        )}
      </div>
    </>
  ) : (
    loadingSpinner
  );

  return (
    <div className="flex min-h-screen">
      {/* Left panel – branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between bg-deep-space-blue-900 p-12 text-white overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-deep-space-blue-800 via-deep-space-blue-900 to-gray-900" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-deep-space-blue-700/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 -right-20 h-[400px] w-[400px] rounded-full bg-vivid-tangerine-500/10 blur-3xl" />

        <div className="relative z-10">
          <Link href="/" className="text-2xl font-bold text-white hover:text-deep-space-blue-200 transition-colors">
            Nenjo
          </Link>
        </div>

        <div className="relative z-10 flex flex-col items-start gap-8">
          <div className="flex flex-col gap-2">
            <span className="text-8xl font-light tracking-wider text-white/90 leading-none">念</span>
            <span className="text-8xl font-light tracking-wider text-white/90 leading-none">助</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-white/30" />
            <span className="text-lg font-light tracking-[0.3em] text-white/60 uppercase">Nenjo</span>
          </div>

          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold leading-snug text-white/95">
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
      <div className="flex w-full flex-col items-center justify-center bg-gray-100 px-6 dark:bg-gray-950 lg:w-1/2">
        <div className={`w-full transition-[max-width] duration-300 ease-in-out ${maxWidth}`}>
          {/* Mobile-only logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/">
              <span className="text-3xl font-bold text-deep-space-blue-600 dark:text-deep-space-blue-400">
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
