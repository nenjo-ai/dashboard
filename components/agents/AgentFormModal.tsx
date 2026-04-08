"use client";

import { cn } from "@/lib/cn";
import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Model,
  ModelProvider,
  CreateModelRequest,
  UpdateModelRequest,
} from "@/lib/types";
import { MODEL_PROVIDERS } from "@/lib/types";
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
}

interface FormErrors {
  model?: string;
  temperature?: string;
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
};

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
      setForm({
        description: agent.description ?? "",
        provider: (agent.model_provider as ModelProvider) || detectProvider(agent.model),
        model: agent.model,
        temperature: agent.temperature,
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
    }));
  }, []);

  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};
    if (!form.model.trim()) errs.model = "Model is required.";
    if (form.temperature < 0 || form.temperature > 2)
      errs.temperature = "Temperature must be between 0.0 and 2.0.";
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
        if (isEdit && agent) {
          const data: UpdateModelRequest = {
            name: modelName,
            description: form.description.trim() || null,
            model: modelName,
            model_provider: form.provider,
            temperature: form.temperature,
          };
          await updateModel(agent.id, data);
        } else {
          const data: CreateModelRequest = {
            name: modelName,
            description: form.description.trim() || undefined,
            model: modelName,
            model_provider: form.provider,
            temperature: form.temperature,
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
