"use client";

import { useCallback, useMemo, useState } from "react";
import { Cpu, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { createModel, updateModel } from "@/lib/api";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import {
  MODEL_PROVIDERS,
  NATIVE_MODEL_TOOL_LABELS,
  type AgentDefinition,
  type CreateModelRequest,
  type Model,
  type ModelProvider,
  type NativeModelTool,
  type UpdateModelRequest,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";

interface ModelsSectionProps {
  models: Model[] | undefined;
  agents: AgentDefinition[];
  isLoading: boolean;
  isError: boolean;
  projectId: string;
  onSaved: () => void;
  onDelete: (model: Model) => void;
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

const INITIAL_FORM: FormState = {
  description: "",
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
  baseUrl: "",
  keyTag: "",
  nativeTools: [],
};

const XAI_NATIVE_MODEL_TOOLS: NativeModelTool[] = ["web_search", "x_search"];

function providerLabel(provider: string): string {
  const found = MODEL_PROVIDERS.find((item) => item.id === provider);
  if (found) return found.label;
  if (provider.startsWith("openai-compatible:")) return "OpenAI Compatible";
  return provider;
}

function formProvider(modelProvider: string): ModelProvider {
  if (modelProvider.startsWith("openai-compatible:")) return "openai-compatible";
  if (MODEL_PROVIDERS.some((provider) => provider.id === modelProvider)) {
    return modelProvider as ModelProvider;
  }
  return "openai";
}

function keyTag(modelProvider: string): string {
  return modelProvider.startsWith("openai-compatible:")
    ? modelProvider.slice("openai-compatible:".length)
    : "";
}

function envVarFromTag(tag: string): string {
  return `${tag.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

function formFromModel(model: Model): FormState {
  const provider = formProvider(model.model_provider);
  return {
    description: model.description ?? "",
    provider,
    model: model.model,
    temperature: model.temperature,
    baseUrl: model.base_url ?? "",
    keyTag: keyTag(model.model_provider),
    nativeTools: provider === "xai" ? model.native_tools ?? [] : [],
  };
}

function assignedAgents(model: Model, agents: AgentDefinition[]): AgentDefinition[] {
  return agents.filter((agent) => agent.model_id === model.id);
}

export function ModelsSection({
  models,
  agents,
  isLoading,
  isError,
  projectId,
  onSaved,
  onDelete,
}: ModelsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const providerData = useMemo(
    () => MODEL_PROVIDERS.find((provider) => provider.id === form.provider) ?? MODEL_PROVIDERS[0],
    [form.provider],
  );

  const sortedModels = useMemo(
    () => [...(models ?? [])].sort((a, b) => a.model_provider.localeCompare(b.model_provider) || a.model.localeCompare(b.model)),
    [models],
  );

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setErrors({});
    setApiError(null);
  }, []);

  const handleEdit = useCallback((model: Model) => {
    setEditingId(model.id);
    setForm(formFromModel(model));
    setErrors({});
    setApiError(null);
  }, []);

  const handleProviderChange = useCallback((provider: ModelProvider) => {
    const nextProvider = MODEL_PROVIDERS.find((item) => item.id === provider);
    setForm((previous) => ({
      ...previous,
      provider,
      model: nextProvider?.models[0] ?? "",
      baseUrl: "",
      keyTag: "",
      nativeTools: provider === "xai" ? previous.nativeTools : [],
    }));
    setErrors({});
  }, []);

  const toggleNativeTool = useCallback((tool: NativeModelTool) => {
    setForm((previous) => {
      const selected = previous.nativeTools.includes(tool);
      return {
        ...previous,
        nativeTools: selected
          ? previous.nativeTools.filter((item) => item !== tool)
          : [...previous.nativeTools, tool],
      };
    });
  }, []);

  const validate = useCallback(() => {
    const nextErrors: FormErrors = {};
    if (!form.model.trim()) nextErrors.model = "Model is required.";
    if (form.temperature < 0 || form.temperature > 2) {
      nextErrors.temperature = "Temperature must be between 0.0 and 2.0.";
    }
    if (form.provider === "openai-compatible" && !form.baseUrl.trim()) {
      nextErrors.baseUrl = "Base URL is required for OpenAI Compatible providers.";
    } else if (form.baseUrl.trim()) {
      try {
        new URL(form.baseUrl.trim());
      } catch {
        nextErrors.baseUrl = "Must be a valid URL.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setApiError(null);
    try {
      const modelName = form.model.trim();
      const modelProvider =
        form.provider === "openai-compatible" && form.keyTag.trim()
          ? `openai-compatible:${form.keyTag.trim()}`
          : form.provider;
      const nativeTools = form.provider === "xai" ? form.nativeTools : [];
      const baseUrl = form.baseUrl.trim();

      if (editingId) {
        const payload: UpdateModelRequest = {
          name: modelName,
          description: form.description.trim() || null,
          model: modelName,
          model_provider: modelProvider,
          temperature: form.temperature,
          base_url: baseUrl || null,
          native_tools: nativeTools,
        };
        await updateModel(editingId, payload);
        toast.success("Model updated.");
      } else {
        const payload: CreateModelRequest = {
          name: modelName,
          description: form.description.trim() || undefined,
          model: modelName,
          model_provider: modelProvider,
          temperature: form.temperature,
          base_url: baseUrl || undefined,
          native_tools: nativeTools,
          project_id: projectId || undefined,
        };
        await createModel(payload);
        toast.success("Model added.");
      }

      onSaved();
      resetForm();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to save model.");
    } finally {
      setSaving(false);
    }
  }, [editingId, form, onSaved, projectId, resetForm, validate]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4">
        <div>
          <h2 className="theme-text text-base font-semibold">Models</h2>
          <p className="theme-text-muted mt-1 max-w-3xl text-sm leading-6">
            Configure chat model bindings and provider-native model tools used by agents.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="theme-border rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-red-500">Failed to load models.</p>
          </div>
        ) : sortedModels.length === 0 ? (
          <div className="theme-border rounded-lg border border-dashed px-4 py-8 text-center">
            <Cpu className="mx-auto h-7 w-7 text-gray-400" />
            <p className="theme-text-muted mt-3 text-sm">No models configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedModels.map((model) => {
              const nativeTools = model.native_tools ?? [];
              const assignments = assignedAgents(model, agents);
              return (
                <article
                  key={model.id}
                  className="theme-border theme-surface rounded-lg border px-4 py-3"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="theme-text truncate text-sm font-semibold">
                          {model.model}
                        </h3>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 ring-1 ring-gray-200 dark:text-gray-400 dark:ring-gray-700">
                          {providerLabel(model.model_provider)}
                        </span>
                      </div>
                      {model.description && (
                        <p className="theme-text-muted mt-1 line-clamp-2 text-xs">
                          {model.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
                          temp {model.temperature.toFixed(2)}
                        </span>
                        {nativeTools.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center rounded-full border border-deep-space-blue-200 bg-deep-space-blue-50 px-2 py-0.5 text-[11px] font-medium text-deep-space-blue-700 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                          >
                            {NATIVE_MODEL_TOOL_LABELS[tool] ?? tool}
                          </span>
                        ))}
                        {assignments.length > 0 && (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {assignments.length} agent{assignments.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(model)}
                        disabled={saving}
                        aria-label={`Edit ${model.model}`}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(model)}
                        disabled={saving}
                        aria-label={`Delete ${model.model}`}
                        title="Delete"
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <form
          onSubmit={handleSubmit}
          className="theme-border theme-surface rounded-lg border p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="theme-text text-sm font-semibold">
              {editingId ? "Edit Model" : "Add Model"}
            </h3>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <Label required>Provider</Label>
                <Select
                  value={form.provider}
                  onChange={(event) => handleProviderChange(event.target.value as ModelProvider)}
                  className="mt-1"
                  disabled={saving}
                >
                  {MODEL_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label required>Model</Label>
                <Input
                  value={form.model}
                  onChange={(event) => setField("model", event.target.value)}
                  list="model-section-hints"
                  className="mt-1"
                  error={!!errors.model}
                  disabled={saving}
                  placeholder="Select or type a model"
                />
                <datalist id="model-section-hints">
                  {providerData.models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                {errors.model ? (
                  <p className="mt-1 text-xs text-red-500">{errors.model}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {providerData.models.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                className="mt-1"
                disabled={saving}
                placeholder="Optional label for this model"
              />
            </div>

            <div>
              <Label>Temperature</Label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(event) => setField("temperature", Number(event.target.value))}
                className="mt-1"
                error={!!errors.temperature}
                disabled={saving}
              />
              {errors.temperature && (
                <p className="mt-1 text-xs text-red-500">{errors.temperature}</p>
              )}
            </div>

            {(form.provider === "ollama" || form.provider === "openai-compatible") && (
              <div>
                <Label required={form.provider === "openai-compatible"}>Base URL</Label>
                <Input
                  value={form.baseUrl}
                  onChange={(event) => setField("baseUrl", event.target.value)}
                  className="mt-1"
                  error={!!errors.baseUrl}
                  disabled={saving}
                  placeholder={form.provider === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1"}
                />
                {errors.baseUrl && (
                  <p className="mt-1 text-xs text-red-500">{errors.baseUrl}</p>
                )}
              </div>
            )}

            {form.provider === "openai-compatible" && (
              <div>
                <Label>Key Tag</Label>
                <Input
                  value={form.keyTag}
                  onChange={(event) =>
                    setField(
                      "keyTag",
                      event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="mt-1"
                  disabled={saving}
                  placeholder="sambanova"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {form.keyTag.trim()
                    ? `Set ${envVarFromTag(form.keyTag.trim())} on the worker`
                    : "Optional API key tag"}
                </p>
              </div>
            )}

            {form.provider === "xai" && (
              <fieldset>
                <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Native Tools
                </legend>
                <div className="mt-2 grid gap-1.5">
                  {XAI_NATIVE_MODEL_TOOLS.map((tool) => {
                    const checked = form.nativeTools.includes(tool);
                    return (
                      <label
                        key={tool}
                        className={cn(
                          "theme-border flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors",
                          checked
                            ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                            : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNativeTool(tool)}
                          className="h-4 w-4 rounded border-gray-300 text-deep-space-blue-500 focus:ring-deep-space-blue-400 dark:border-gray-600"
                        />
                        <span>{NATIVE_MODEL_TOOL_LABELS[tool] ?? tool}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {apiError && <p className="text-sm text-red-500">{apiError}</p>}

            <Button type="submit" className="w-full" disabled={saving} isLoading={saving}>
              {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save Model" : "Add Model"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
