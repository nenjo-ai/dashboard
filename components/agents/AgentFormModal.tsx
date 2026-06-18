"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Model,
  ModelProvider,
  CreateModelRequest,
  NativeModelTool,
  UpdateModelRequest,
} from "@/lib/types";
import { MODEL_PROVIDERS, NATIVE_MODEL_TOOL_LABELS } from "@/lib/types";
import { createModel, updateModel } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";

interface AgentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  agent?: Model | null;
  projectId: string;
}

interface FormState {
  description: string;
  provider: ModelProvider;
  model: string;
  temperature: number;
  baseUrl: string;
  keyTag: string;
  nativeTools: NativeModelTool[];
}

interface FormErrors {
  model?: string;
  temperature?: string;
  baseUrl?: string;
}

function detectProvider(model: string): ModelProvider {
  for (const p of MODEL_PROVIDERS) {
    if (p.models.some((m) => model.startsWith(m.split("/")[0]) || model === m)) {
      return p.id;
    }
  }
  if (model.startsWith("gpt") || model.startsWith("o1")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gemini")) return "google";
  if (model.includes("/")) return "openrouter";
  return "openai";
}

const INITIAL: FormState = {
  description: "",
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
  baseUrl: "",
  keyTag: "",
  nativeTools: [],
};

const XAI_NATIVE_MODEL_TOOLS: NativeModelTool[] = ["web_search", "x_search"];

/** Derive the env var name from a key tag: "sambanova" → "SAMBANOVA_API_KEY" */
function envVarFromTag(tag: string): string {
  return `${tag.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

export function AgentFormModal({
  open,
  onClose,
  onSaved,
  agent,
}: AgentFormModalProps) {
  const isEdit = !!agent;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (agent) {
      // Parse "openai-compatible:{tag}" back into provider + keyTag.
      let provider = agent.model_provider as ModelProvider;
      let keyTag = "";
      if (agent.model_provider.startsWith("openai-compatible:")) {
        provider = "openai-compatible";
        keyTag = agent.model_provider.slice("openai-compatible:".length);
      } else if (!MODEL_PROVIDERS.some((p) => p.id === provider)) {
        provider = detectProvider(agent.model);
      }
      setForm({
        description: agent.description ?? "",
        provider,
        model: agent.model,
        temperature: agent.temperature,
        baseUrl: agent.base_url ?? "",
        keyTag,
        nativeTools: provider === "xai" ? agent.native_tools ?? [] : [],
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
    setApiError(null);
  }, [open, agent]);

  const providerData = useMemo(
    () => MODEL_PROVIDERS.find((p) => p.id === form.provider) ?? MODEL_PROVIDERS[0],
    [form.provider],
  );

  const set = useCallback(
    <K extends keyof FormState>(key: K, val: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [],
  );

  const handleProviderChange = useCallback((provider: ModelProvider) => {
    const pd = MODEL_PROVIDERS.find((p) => p.id === provider);
    setForm((prev) => ({
      ...prev,
      provider,
      model: pd?.models[0] ?? "",
      baseUrl: "",
      keyTag: "",
      nativeTools: provider === "xai" ? prev.nativeTools : [],
    }));
  }, []);

  const toggleNativeTool = useCallback((tool: NativeModelTool) => {
    setForm((prev) => {
      const selected = prev.nativeTools.includes(tool);
      return {
        ...prev,
        nativeTools: selected
          ? prev.nativeTools.filter((item) => item !== tool)
          : [...prev.nativeTools, tool],
      };
    });
  }, []);

  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};
    if (!form.model.trim()) errs.model = "Model is required.";
    if (form.temperature < 0 || form.temperature > 2)
      errs.temperature = "Temperature must be between 0.0 and 2.0.";
    if (form.provider === "openai-compatible" && !form.baseUrl.trim()) {
      errs.baseUrl = "Base URL is required for OpenAI Compatible providers.";
    } else if (form.baseUrl.trim()) {
      try {
        new URL(form.baseUrl.trim());
      } catch {
        errs.baseUrl = "Must be a valid URL (e.g. http://localhost:1234/v1).";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      setApiError(null);

      try {
        const modelName = form.model.trim();
        const trimmedUrl = form.baseUrl.trim() || undefined;
        // Compose "openai-compatible:{tag}" when a tag is provided.
        const modelProvider =
          form.provider === "openai-compatible" && form.keyTag.trim()
            ? `openai-compatible:${form.keyTag.trim()}`
            : form.provider;
        const nativeTools = form.provider === "xai" ? form.nativeTools : [];
        if (isEdit && agent) {
          const data: UpdateModelRequest = {
            name: modelName,
            description: form.description.trim() || null,
            model: modelName,
            model_provider: modelProvider,
            temperature: form.temperature,
            base_url: trimmedUrl ?? null,
            native_tools: nativeTools,
          };
          await updateModel(agent.id, data);
        } else {
          const data: CreateModelRequest = {
            name: modelName,
            description: form.description.trim() || undefined,
            model: modelName,
            model_provider: modelProvider,
            temperature: form.temperature,
            base_url: trimmedUrl,
            native_tools: nativeTools,
          };
          await createModel(data);
        }
        onSaved();
        onClose();
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Failed to save model.");
      } finally {
        setSubmitting(false);
      }
    },
    [form, isEdit, agent, validate, onSaved, onClose],
  );

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Model" : "Configure New Model"}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            {apiError}
          </div>
        )}

        {/* Provider + Model */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Provider</Label>
            <Select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
              disabled={submitting}
              className="mt-1"
            >
              {MODEL_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>Model</Label>
            <div className="relative mt-1">
              <Input
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                list="model-hints"
                placeholder="Select or type a model"
                error={!!errors.model}
                disabled={submitting}
              />
              <datalist id="model-hints">
                {providerData.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            {errors.model ? (
              <p className="mt-1 text-xs text-red-500">{errors.model}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {providerData.models.slice(0, 3).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Base URL (shown for Ollama and OpenAI-compatible providers) */}
        {(form.provider === "ollama" || form.provider === "openai-compatible") && (
          <div>
            <Label required={form.provider === "openai-compatible"}>Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder={
                form.provider === "ollama"
                  ? "http://localhost:11434"
                  : "http://localhost:1234/v1"
              }
              error={!!errors.baseUrl}
              disabled={submitting}
              className="mt-1"
            />
            {errors.baseUrl ? (
              <p className="mt-1 text-xs text-red-500">{errors.baseUrl}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {form.provider === "ollama"
                  ? "Leave empty for default (localhost:11434)"
                  : "e.g. LM Studio, vLLM, llama.cpp, LocalAI, TGI"}
              </p>
            )}
          </div>
        )}

        {/* Key Tag (shown for OpenAI-compatible only) */}
        {form.provider === "openai-compatible" && (
          <div>
            <Label>Key Tag</Label>
            <Input
              value={form.keyTag}
              onChange={(e) => set("keyTag", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="e.g. sambanova, deepseek, my-server"
              disabled={submitting}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {form.keyTag.trim()
                ? <>Set <code className="text-gray-500 dark:text-gray-400">{envVarFromTag(form.keyTag.trim())}</code> on your harness</>
                : "Optional — identifies which env var holds the API key"}
            </p>
          </div>
        )}

        {form.provider === "xai" && (
          <div>
            <Label>Native Tools</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {XAI_NATIVE_MODEL_TOOLS.map((tool) => {
                const checked = form.nativeTools.includes(tool);
                return (
                  <label
                    key={tool}
                    className={[
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-deep-space-blue-300 bg-deep-space-blue-50 text-deep-space-blue-700 dark:border-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleNativeTool(tool)}
                      disabled={submitting}
                      className="h-4 w-4 rounded border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500"
                    />
                    <span>{NATIVE_MODEL_TOOL_LABELS[tool]}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Enabled tools run inside xAI and take precedence over matching local tools.
            </p>
          </div>
        )}

        {/* Temperature */}
        <div>
          <Label>Temperature</Label>
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={form.temperature}
                onChange={(e) => set("temperature", parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-deep-space-blue-500 dark:bg-gray-700"
                disabled={submitting}
              />
              <span className="w-12 text-right text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
                {form.temperature.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Precise (0)</span>
              <span>Creative (2)</span>
            </div>
          </div>
          {errors.temperature && (
            <p className="mt-1 text-xs text-red-500">{errors.temperature}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional notes about this configuration..."
            disabled={submitting}
            className="mt-1"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
