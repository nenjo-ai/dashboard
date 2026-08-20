"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Check,
  Cpu,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { createModel, updateModel } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useModelCatalog } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { resourceSlug } from "@/lib/resourceSlug";
import {
  ASSIGNABLE_OPERATION_CAPABILITIES,
  MODEL_MODALITY_OPTIONS,
  MODEL_PROVIDERS,
  modelCatalogFeatureLabel,
  modelCapabilityLabel,
  NATIVE_MODEL_TOOL_LABELS,
  type AgentDefinition,
  type CreateModelRequest,
  type Model,
  type ModelCatalogModel,
  type ModelCatalogProvider,
  type ModelCapability,
  type ModelModality,
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
  slug: string;
  description: string;
  provider: ModelProvider;
  model: string;
  contextWindow?: number;
  baseUrl: string;
  keyTag: string;
  nativeTools: NativeModelTool[];
  capabilities: ModelCapability[];
  inputModalities: ModelModality[];
  outputModalities: ModelModality[];
}

interface FormErrors {
  slug?: string;
  model?: string;
  baseUrl?: string;
}

const INITIAL_FORM: FormState = {
  slug: "gpt-4o",
  description: "",
  provider: "openai",
  model: "gpt-4o",
  contextWindow: undefined,
  baseUrl: "",
  keyTag: "",
  nativeTools: [],
  capabilities: ["chat"],
  inputModalities: ["text"],
  outputModalities: ["text"],
};

const XAI_NATIVE_MODEL_TOOLS: NativeModelTool[] = ["web_search", "x_search"];
const MODEL_MODALITIES = new Set<ModelModality>([
  "text",
  "audio",
  "image",
  "file",
  "video",
]);
const OPENROUTER_CATALOG_LIMIT = 60;

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

function capabilityLabel(capability: string): string {
  return modelCapabilityLabel(capability);
}

function catalogMetadataLabel(value: string): string {
  return ASSIGNABLE_OPERATION_CAPABILITIES.some((item) => item.id === value)
    ? capabilityLabel(value)
    : modelCatalogFeatureLabel(value);
}

function modelOperations(values: ModelCapability[] | undefined): ModelCapability[] {
  return (values ?? []).filter((value) =>
    ASSIGNABLE_OPERATION_CAPABILITIES.some((item) => item.id === value),
  );
}

function modelModalities(values: string[] | undefined): ModelModality[] {
  return (values ?? []).filter((value): value is ModelModality =>
    MODEL_MODALITIES.has(value as ModelModality),
  );
}

function formatContextLength(value: number | null | undefined): string | null {
  if (!value) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ctx`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K ctx`;
  return `${value} ctx`;
}

function formFromModel(model: Model): FormState {
  const provider = formProvider(model.model_provider);
  return {
    slug: model.slug,
    description: model.description ?? "",
    provider,
    model: model.model,
    contextWindow: model.context_window ?? undefined,
    baseUrl: model.base_url ?? "",
    keyTag: keyTag(model.model_provider),
    nativeTools: provider === "xai" ? model.native_tools ?? [] : [],
    capabilities: modelOperations(model.capabilities),
    inputModalities: model.input_modalities ?? [],
    outputModalities: model.output_modalities ?? [],
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
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCapabilities, setCatalogCapabilities] = useState<string[]>([]);
  const [catalogFreeOnly, setCatalogFreeOnly] = useState(false);
  const catalogProvider: ModelCatalogProvider | null =
    form.provider === "openrouter" || form.provider === "xai"
      ? form.provider
      : null;
  const hasProviderCatalog = catalogProvider !== null;
  const catalogProviderLabel = catalogProvider === "xai" ? "xAI" : "OpenRouter";
  const {
    catalog: openRouterCatalog,
    models: openRouterCatalogModels,
    isLoading: openRouterCatalogLoading,
    isError: openRouterCatalogError,
    mutate: refreshOpenRouterCatalog,
  } = useModelCatalog(catalogProvider ?? "openrouter", undefined, hasProviderCatalog);

  const providerData = useMemo(
    () => MODEL_PROVIDERS.find((provider) => provider.id === form.provider) ?? MODEL_PROVIDERS[0],
    [form.provider],
  );

  const openRouterModelById = useMemo(() => {
    return new Map(openRouterCatalogModels.map((model) => [model.id, model]));
  }, [openRouterCatalogModels]);

  const providerModelHints = useMemo(() => {
    if (hasProviderCatalog && openRouterCatalogModels.length > 0) {
      return openRouterCatalogModels
        .filter((model) => model.configurable !== false)
        .map((model) => model.id);
    }
    return providerData.models;
  }, [hasProviderCatalog, openRouterCatalogModels, providerData.models]);

  const selectedCatalogModel = hasProviderCatalog
    ? openRouterModelById.get(form.model.trim())
    : undefined;
  const catalogModalitiesLocked = Boolean(selectedCatalogModel);

  const catalogCapabilityFilters = useMemo(() => {
    const capabilities = new Set<string>();
    for (const model of openRouterCatalogModels) {
      for (const capability of model.capabilities) {
        capabilities.add(capability);
      }
      for (const feature of model.features) {
        capabilities.add(feature);
      }
    }
    return Array.from(capabilities).sort((left, right) =>
      catalogMetadataLabel(left).localeCompare(catalogMetadataLabel(right)),
    );
  }, [openRouterCatalogModels]);

  const filteredOpenRouterModels = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase();
    return openRouterCatalogModels
      .filter((model) => {
        if (catalogFreeOnly && !model.free) return false;
        if (
          catalogCapabilities.length > 0 &&
          !catalogCapabilities.every((capability) =>
            model.capabilities.includes(capability) || model.features.includes(capability),
          )
        ) {
          return false;
        }
        if (!search) return true;
        return (
          model.id.toLowerCase().includes(search) ||
          model.name.toLowerCase().includes(search) ||
          (model.description ?? "").toLowerCase().includes(search)
        );
      })
      .slice(0, OPENROUTER_CATALOG_LIMIT);
  }, [
    catalogCapabilities,
    catalogFreeOnly,
    catalogSearch,
    openRouterCatalogModels,
  ]);

  const sortedModels = useMemo(
    () => [...(models ?? [])].sort((a, b) => a.model_provider.localeCompare(b.model_provider) || a.model.localeCompare(b.model)),
    [models],
  );

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }, []);

  const applyCatalogModel = useCallback((model: ModelCatalogModel) => {
    if (model.configurable === false) {
      setErrors((previous) => ({
        ...previous,
        model:
          model.unavailable_reason ??
          "This catalog model is not supported by Nenjo yet.",
      }));
      return;
    }
    setForm((previous) => ({
      ...previous,
      slug: slugEdited ? previous.slug : resourceSlug(model.id),
      model: model.id,
      contextWindow:
        model.context_length ?? model.top_provider?.context_length ?? undefined,
      description: previous.description.trim() ? previous.description : model.name,
      capabilities: model.capabilities,
      inputModalities: modelModalities(model.input_modalities),
      outputModalities: modelModalities(model.output_modalities),
    }));
    setErrors((previous) => ({ ...previous, model: undefined }));
  }, [slugEdited]);

  const handleModelChange = useCallback(
    (value: string) => {
      const catalogModel = hasProviderCatalog
        ? openRouterModelById.get(value.trim())
        : undefined;
      if (catalogModel) {
        applyCatalogModel(catalogModel);
        return;
      }
      setForm((previous) => ({
        ...previous,
        model: value,
        slug: slugEdited ? previous.slug : resourceSlug(value),
      }));
      setErrors((previous) => ({ ...previous, model: undefined }));
    },
    [applyCatalogModel, hasProviderCatalog, openRouterModelById, slugEdited],
  );

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setSlugEdited(false);
    setErrors({});
    setApiError(null);
    setCatalogSearch("");
    setCatalogCapabilities([]);
    setCatalogFreeOnly(false);
  }, []);

  const handleEdit = useCallback((model: Model) => {
    setEditingId(model.id);
    setForm(formFromModel(model));
    setSlugEdited(true);
    setErrors({});
    setApiError(null);
  }, []);

  const handleProviderChange = useCallback((provider: ModelProvider) => {
    const nextProvider = MODEL_PROVIDERS.find((item) => item.id === provider);
    setForm((previous) => ({
      ...previous,
      provider,
      model: nextProvider?.models[0] ?? "",
      slug: slugEdited
        ? previous.slug
        : resourceSlug(nextProvider?.models[0] ?? ""),
      contextWindow: undefined,
      baseUrl: "",
      keyTag: "",
      nativeTools: provider === "xai" ? previous.nativeTools : [],
      capabilities:
        provider === "openrouter" || provider === "xai" ? [] : previous.capabilities,
      inputModalities:
        provider === "openrouter" || provider === "xai"
          ? []
          : previous.inputModalities,
      outputModalities:
        provider === "openrouter" || provider === "xai"
          ? []
          : previous.outputModalities,
    }));
    setErrors({});
  }, [slugEdited]);

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

  const toggleCapability = useCallback((capability: ModelCapability) => {
    setForm((previous) => {
      const selected = previous.capabilities.includes(capability);
      return {
        ...previous,
        capabilities: selected
          ? previous.capabilities.filter((item) => item !== capability)
          : [...previous.capabilities, capability],
      };
    });
  }, []);

  const toggleModality = useCallback(
    (field: "inputModalities" | "outputModalities", modality: ModelModality) => {
      setForm((previous) => {
        const current = previous[field];
        const selected = current.includes(modality);
        return {
          ...previous,
          [field]: selected
            ? current.filter((item) => item !== modality)
            : [...current, modality],
        };
      });
    },
    [],
  );

  const validate = useCallback(() => {
    const nextErrors: FormErrors = {};
    if (!form.model.trim()) nextErrors.model = "Model is required.";
    if (!resourceSlug(form.slug)) nextErrors.slug = "Stable slug is required.";
    if (
      (form.provider === "openai-compatible" || form.provider === "vllm") &&
      !form.baseUrl.trim()
    ) {
      nextErrors.baseUrl = `Base URL is required for ${
        form.provider === "vllm" ? "vLLM" : "OpenAI Compatible"
      } providers.`;
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
      const capabilities = form.capabilities;
      const baseUrl = form.baseUrl.trim();

      if (editingId) {
        const payload: UpdateModelRequest = {
          name: modelName,
          description: form.description.trim() || null,
          model: modelName,
          model_provider: modelProvider,
          context_window: form.contextWindow ?? null,
          base_url: baseUrl || null,
          native_tools: nativeTools,
          capabilities,
          input_modalities: form.inputModalities,
          output_modalities: form.outputModalities,
        };
        await updateModel(editingId, payload);
        toast.success("Model updated.");
      } else {
        const payload: CreateModelRequest = {
          slug: resourceSlug(form.slug),
          name: modelName,
          description: form.description.trim() || undefined,
          model: modelName,
          model_provider: modelProvider,
          context_window: form.contextWindow,
          base_url: baseUrl || undefined,
          native_tools: nativeTools,
          capabilities,
          input_modalities: form.inputModalities,
          output_modalities: form.outputModalities,
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
            Configure chat engines and native media capabilities (image, video,
            audio) in one inventory. Assign non-chat ops to agents from the
            agent Capabilities tab.
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
              const capabilities = model.capabilities ?? [];
              const assignments = assignedAgents(model, agents);
              const inputMods = model.input_modalities ?? [];
              const outputMods = model.output_modalities ?? [];
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
                        {inputMods.map((modality) => (
                          <span
                            key={`in-${modality}`}
                            className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                          >
                            in:{modality}
                          </span>
                        ))}
                        {outputMods.map((modality) => (
                          <span
                            key={`out-${modality}`}
                            className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                          >
                            out:{modality}
                          </span>
                        ))}
                        {nativeTools.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center rounded-full border border-deep-space-blue-200 bg-deep-space-blue-50 px-2 py-0.5 text-[11px] font-medium text-deep-space-blue-700 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                          >
                            {NATIVE_MODEL_TOOL_LABELS[tool] ?? tool}
                          </span>
                        ))}
                        {capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
                          >
                            {catalogMetadataLabel(capability)}
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
                  onChange={(event) => handleModelChange(event.target.value)}
                  list="model-section-hints"
                  className="mt-1"
                  error={!!errors.model}
                  disabled={saving}
                  placeholder="Select or type a model"
                />
                <datalist id="model-section-hints">
                  {providerModelHints.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                {errors.model ? (
                  <p className="mt-1 text-xs text-red-500">{errors.model}</p>
                ) : hasProviderCatalog ? (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {openRouterCatalogLoading
                      ? `Loading ${catalogProviderLabel} catalog`
                      : openRouterCatalogError
                        ? `${catalogProviderLabel} catalog unavailable`
                        : openRouterCatalog
                          ? `${openRouterCatalog.filtered_total} verified models`
                          : `${catalogProviderLabel} catalog`}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {providerData.models.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label required>Stable slug</Label>
              <Input
                value={form.slug}
                onChange={(event) => {
                  setField("slug", resourceSlug(event.target.value));
                  setSlugEdited(true);
                }}
                className="mt-1 font-mono"
                error={!!errors.slug}
                disabled={saving || !!editingId}
                placeholder="gpt-4o"
              />
              {errors.slug ? (
                <p className="mt-1 text-xs text-red-500">{errors.slug}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Permanent reference used by agents; the provider model ID may change independently.
                </p>
              )}
            </div>

            {hasProviderCatalog && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>{catalogProviderLabel} catalog</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshOpenRouterCatalog()}
                    disabled={saving || openRouterCatalogLoading}
                    title="Refresh catalog"
                  >
                    {openRouterCatalogLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Refresh
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      className="pl-8"
                      disabled={saving}
                      placeholder="Search catalog"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">
                      Filter by operation or feature. Select multiple to show models
                      that match all selected filters.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogCapabilityFilters.map((capability) => {
                        const active = catalogCapabilities.includes(capability);
                        return (
                          <button
                            key={capability}
                            type="button"
                            onClick={() =>
                              setCatalogCapabilities((previous) =>
                                previous.includes(capability)
                                  ? previous.filter(
                                      (item) => item !== capability,
                                    )
                                  : [...previous, capability],
                              )
                            }
                            disabled={saving}
                            className={cn(
                              "theme-border rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                              active
                                ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200"
                                : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                            )}
                          >
                            {catalogMetadataLabel(capability)}
                          </button>
                        );
                      })}
                      <label
                        className={cn(
                          "theme-border flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
                          catalogFreeOnly
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : "theme-surface text-gray-600 dark:text-gray-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={catalogFreeOnly}
                          onChange={(event) => setCatalogFreeOnly(event.target.checked)}
                          disabled={saving}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-400 dark:border-gray-600"
                        />
                        Free
                      </label>
                    </div>
                  </div>
                </div>

                {selectedCatalogModel && (
                  <div className="theme-border rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedCatalogModel.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
                        >
                          {capabilityLabel(capability)}
                        </span>
                      ))}
                      {selectedCatalogModel.features.map((feature) => (
                        <span
                          key={feature}
                          className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
                        >
                          {catalogMetadataLabel(feature)}
                        </span>
                      ))}
                      {selectedCatalogModel.input_modalities.map((modality) => (
                        <span
                          key={`input-${modality}`}
                          className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        >
                          in:{modality}
                        </span>
                      ))}
                      {selectedCatalogModel.output_modalities.map((modality) => (
                        <span
                          key={`output-${modality}`}
                          className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        >
                          out:{modality}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="theme-border max-h-72 overflow-y-auto rounded-md border">
                  {openRouterCatalogLoading ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading catalog
                    </div>
                  ) : openRouterCatalogError ? (
                    <div className="px-3 py-6 text-center text-sm text-red-500">
                      Failed to load {catalogProviderLabel} catalog.
                    </div>
                  ) : filteredOpenRouterModels.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">
                      No catalog models match these filters.
                    </div>
                  ) : (
                    filteredOpenRouterModels.map((catalogModel) => {
                      const selected = catalogModel.id === form.model.trim();
                      const contextLength = formatContextLength(
                        catalogModel.context_length ??
                          catalogModel.top_provider?.context_length,
                      );
                      const catalogMetadata = [
                        ...catalogModel.capabilities,
                        ...catalogModel.features,
                      ];
                      const visibleCapabilities = catalogMetadata.slice(0, 4);
                      return (
                        <button
                          key={catalogModel.id}
                          type="button"
                          onClick={() => applyCatalogModel(catalogModel)}
                          disabled={saving || catalogModel.configurable === false}
                          className={cn(
                            "theme-border block w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:[background:var(--app-hover)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                            selected &&
                              "bg-cyan-50/70 dark:bg-cyan-950/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="theme-text truncate text-sm font-medium">
                                  {catalogModel.name}
                                </span>
                                {catalogModel.free && (
                                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    Free
                                  </span>
                                )}
                                {catalogModel.configurable === false && (
                                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                    Not available
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                                {catalogModel.id}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                              {contextLength && <span>{contextLength}</span>}
                              {selected && <Check className="h-4 w-4 text-cyan-600" />}
                            </div>
                          </div>
                          {visibleCapabilities.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {visibleCapabilities.map((capability) => (
                                <span
                                  key={capability}
                                  className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                                >
                                  {catalogMetadataLabel(capability)}
                                </span>
                              ))}
                              {catalogMetadata.length >
                                visibleCapabilities.length && (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                  +{catalogMetadata.length - visibleCapabilities.length}
                                </span>
                              )}
                            </div>
                          )}
                          {catalogModel.configurable === false &&
                            catalogModel.unavailable_reason && (
                              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                {catalogModel.unavailable_reason}
                              </p>
                            )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

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

            {(form.provider === "ollama" ||
              form.provider === "vllm" ||
              form.provider === "openai-compatible") && (
              <div>
                <Label required={form.provider !== "ollama"}>Base URL</Label>
                <Input
                  value={form.baseUrl}
                  onChange={(event) => setField("baseUrl", event.target.value)}
                  className="mt-1"
                  error={!!errors.baseUrl}
                  disabled={saving}
                  placeholder={
                    form.provider === "ollama"
                      ? "http://localhost:11434"
                      : form.provider === "vllm"
                        ? "http://localhost:8000/v1"
                        : "http://localhost:1234/v1"
                  }
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

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Assignable operations
              </legend>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Choose the jobs this model can perform. Chat enables
                conversations; other operations must also be assigned to an
                agent on the Capabilities tab.
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {ASSIGNABLE_OPERATION_CAPABILITIES.map((capability) => {
                  const checked = form.capabilities.includes(capability.id);
                  return (
                    <label
                      key={capability.id}
                      className={cn(
                        "theme-border flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors",
                        checked
                          ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200"
                          : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCapability(capability.id)}
                        disabled={saving}
                        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400 dark:border-gray-600"
                      />
                      <span>{capability.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Modalities
              </legend>
              {catalogModalitiesLocked && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Input and output modalities are supplied by the selected
                  catalog model and cannot be changed.
                </p>
              )}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Input
                  </p>
                  <div className="grid gap-1.5">
                    {MODEL_MODALITY_OPTIONS.map((modality) => {
                      const checked = form.inputModalities.includes(modality);
                      return (
                        <label
                          key={`input-${modality}`}
                          className={cn(
                            "theme-border flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                            catalogModalitiesLocked
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            checked
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                              : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleModality("inputModalities", modality)
                            }
                            disabled={saving || catalogModalitiesLocked}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-gray-700 focus:ring-gray-400 dark:border-gray-600"
                          />
                          <span className="capitalize">{modality}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Output
                  </p>
                  <div className="grid gap-1.5">
                    {MODEL_MODALITY_OPTIONS.map((modality) => {
                      const checked = form.outputModalities.includes(modality);
                      return (
                        <label
                          key={`output-${modality}`}
                          className={cn(
                            "theme-border flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                            catalogModalitiesLocked
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            checked
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                              : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleModality("outputModalities", modality)
                            }
                            disabled={saving || catalogModalitiesLocked}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-gray-700 focus:ring-gray-400 dark:border-gray-600"
                          />
                          <span className="capitalize">{modality}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </fieldset>

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
