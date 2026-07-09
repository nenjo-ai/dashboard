"use client";

// Soft-deprecated (PR-D3): Media inventory tab is hidden. Configure engines via
// ModelsSection + agent model-assignments. Media inventory tab stays hidden (model-first).

import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Mic,
  Pencil,
  Plus,
  Save,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { configureMediaProviders } from "@/lib/api";
import { useMediaCapabilities, useMediaConfig } from "@/lib/hooks";
import {
  NATIVE_MEDIA_CAPABILITIES,
  NATIVE_MEDIA_PROVIDERS,
  type MediaProviderConfig,
  type MediaProviderConfigInput,
  type NativeMediaCapability,
  type NativeMediaProviderInfo,
  type NativeMediaProvider,
} from "@/lib/types";
import { cn } from "@/lib/cn";

type FormState = {
  name: string;
  provider: NativeMediaProvider;
  model: string;
  capabilities: NativeMediaCapability[];
};

const KIND_ICON = {
  image: ImageIcon,
  video: Video,
  audio: Volume2,
  voice: Mic,
} as const;

function providerInfo(provider: NativeMediaProvider) {
  return NATIVE_MEDIA_PROVIDERS.find((item) => item.id === provider) ?? NATIVE_MEDIA_PROVIDERS[0];
}

function capabilityLabel(capability: NativeMediaCapability): string {
  return NATIVE_MEDIA_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability;
}

function providerLabel(provider: NativeMediaProvider): string {
  return providerInfo(provider).label;
}

function modelLabel(model: string): string {
  switch (model) {
    case "gpt-image-1":
      return "GPT Image";
    case "grok-imagine-image-quality":
      return "Grok Image";
    case "grok-imagine-video":
      return "Grok Video";
    default:
      return model;
  }
}

function modelOptionLabel(model: string): string {
  const label = modelLabel(model);
  return label === model ? model : `${label} (${model})`;
}

function defaultForm(provider: NativeMediaProvider = "openai"): FormState {
  const info = providerInfo(provider);
  const model = info.models[0] ?? "";
  const capabilities = capabilitiesForModel(info, model);
  return {
    name: `${info.label} Media`,
    provider,
    model,
    capabilities: capabilities.slice(0, 1),
  };
}

function capabilitiesForModel(
  provider: NativeMediaProviderInfo,
  model: string,
): NativeMediaCapability[] {
  const trimmedModel = model.trim();
  const fallbackProvider = providerInfo(provider.id);
  const modelInfo =
    provider.model_capabilities?.find((item) => item.model === trimmedModel) ??
    fallbackProvider.model_capabilities?.find((item) => item.model === trimmedModel);
  return modelInfo?.capabilities ?? provider.capabilities;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(
  base: string,
  providers: MediaProviderConfig[],
  editingId: string | null,
): string {
  const root = slugify(base) || "media-provider";
  let slug = root;
  let suffix = 2;
  while (providers.some((item) => item.slug === slug && item.id !== editingId)) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function capabilityKindClass(kind: string): string {
  switch (kind) {
    case "image":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "video":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300";
    case "audio":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300";
    default:
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900/70 dark:bg-fuchsia-950/30 dark:text-fuchsia-300";
  }
}

export function MediaProvidersSection() {
  const { mediaConfig, isLoading, isError, mutate } = useMediaConfig();
  const { mediaCapabilities } = useMediaCapabilities();
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerCatalog = mediaCapabilities?.providers ?? NATIVE_MEDIA_PROVIDERS;
  const capabilityCatalog = mediaCapabilities?.capabilities ?? NATIVE_MEDIA_CAPABILITIES;
  const providers = useMemo(() => mediaConfig?.providers ?? [], [mediaConfig?.providers]);

  const selectedProvider = useMemo(
    () => providerCatalog.find((item) => item.id === form.provider) ?? providerInfo(form.provider),
    [form.provider, providerCatalog],
  );
  const selectedModelCapabilities = useMemo(
    () => capabilitiesForModel(selectedProvider, form.model),
    [selectedProvider, form.model],
  );
  const selectedModelCapabilitySet = useMemo(
    () => new Set(selectedModelCapabilities),
    [selectedModelCapabilities],
  );
  const selectedCapabilitySet = useMemo(() => new Set(form.capabilities), [form.capabilities]);

  const persistProviders = useCallback(async (nextProviders: MediaProviderConfig[]) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: MediaProviderConfigInput[] = nextProviders.map((provider) => ({
        id: provider.id.startsWith("draft-") ? undefined : provider.id,
        slug: provider.slug,
        name: provider.name,
        provider: provider.provider,
        model: provider.model,
        capabilities: provider.capabilities,
        metadata: provider.metadata ?? {},
      }));
      const nextConfig = await configureMediaProviders({ providers: payload });
      await mutate(nextConfig, { revalidate: false });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save media providers.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [mutate]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(defaultForm());
    setError(null);
  }, []);

  const handleProviderChange = useCallback((provider: NativeMediaProvider) => {
    const info = providerCatalog.find((item) => item.id === provider) ?? providerInfo(provider);
    const model = info.models[0] ?? "";
    const capabilities = capabilitiesForModel(info, model);
    setForm({
      name: `${info.label} Media`,
      provider,
      model,
      capabilities: capabilities.slice(0, 1),
    });
    setError(null);
  }, [providerCatalog]);

  const toggleCapability = useCallback((capability: NativeMediaCapability) => {
    if (!selectedModelCapabilitySet.has(capability)) return;
    setForm((previous) => {
      const hasCapability = previous.capabilities.includes(capability);
      const capabilities = hasCapability
        ? previous.capabilities.filter((item) => item !== capability)
        : [...previous.capabilities, capability];
      return { ...previous, capabilities };
    });
    setError(null);
  }, [selectedModelCapabilitySet]);

  const handleModelChange = useCallback((model: string) => {
    setForm((previous) => {
      const info = providerCatalog.find((item) => item.id === previous.provider) ?? providerInfo(previous.provider);
      const capabilities = capabilitiesForModel(info, model);
      const allowed = new Set(capabilities);
      const nextCapabilities = previous.capabilities.filter((capability) => allowed.has(capability));
      return {
        ...previous,
        model,
        capabilities: nextCapabilities.length > 0 ? nextCapabilities : capabilities.slice(0, 1),
      };
    });
    setError(null);
  }, [providerCatalog]);

  const handleEdit = useCallback((provider: MediaProviderConfig) => {
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      provider: provider.provider,
      model: provider.model,
      capabilities: provider.capabilities.filter((capability) =>
        capabilitiesForModel(
          providerCatalog.find((item) => item.id === provider.provider) ?? providerInfo(provider.provider),
          provider.model,
        ).includes(capability),
      ),
    });
    setError(null);
  }, [providerCatalog]);

  const handleDelete = useCallback(async (id: string) => {
    await persistProviders(providers.filter((item) => item.id !== id));
    if (editingId === id) resetForm();
  }, [editingId, persistProviders, providers, resetForm]);

  const handleMove = useCallback(async (id: string, direction: -1 | 1) => {
    const index = providers.findIndex((item) => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= providers.length) return;
    const next = providers.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    await persistProviders(next);
  }, [persistProviders, providers]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const model = form.model.trim();
    const slug = uniqueSlug(`${name}-${form.provider}-${model}`, providers, editingId);

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!model) {
      setError("Model is required.");
      return;
    }
    if (form.capabilities.length === 0) {
      setError("Choose at least one capability.");
      return;
    }
    const unsupported = form.capabilities.find(
      (capability) => !selectedModelCapabilitySet.has(capability),
    );
    if (unsupported) {
      setError(`${model} does not support ${capabilityLabel(unsupported)}.`);
      return;
    }

    const nextProvider = {
      id: editingId ?? `draft-${Date.now()}`,
      name,
      slug,
      provider: form.provider,
      model,
      capabilities: form.capabilities,
      order_index: providers.length,
      metadata: {},
    } satisfies MediaProviderConfig;

    const nextProviders = editingId
      ? providers.map((item) => (item.id === editingId ? nextProvider : item))
      : [...providers, nextProvider];

    const didSave = await persistProviders(nextProviders);
    if (didSave) {
      setForm(defaultForm(form.provider));
      setEditingId(null);
      setError(null);
    }
  }, [editingId, form, persistProviders, providers, selectedModelCapabilitySet]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4">
        <div>
          <h2 className="theme-text text-base font-semibold">Media Providers</h2>
          <p className="theme-text-muted mt-1 max-w-3xl text-sm leading-6">
            Configure provider/model bindings for native media tools. If multiple providers support the same capability, packages and assignments must pin a provider or model.
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
            <p className="text-sm text-red-500">Failed to load media providers.</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="theme-border rounded-lg border border-dashed px-4 py-8 text-center">
            <ImageIcon className="mx-auto h-7 w-7 text-gray-400" />
            <p className="theme-text-muted mt-3 text-sm">No media providers configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider, index) => (
              <article
                key={provider.id}
                className="theme-border theme-surface rounded-lg border px-4 py-3"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="theme-text truncate text-sm font-semibold">{provider.name}</h3>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 ring-1 ring-gray-200 dark:text-gray-400 dark:ring-gray-700">
                        {providerLabel(provider.provider)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {provider.model}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {provider.capabilities.map((capability) => {
                        const info = capabilityCatalog.find((item) => item.id === capability);
                        return (
                          <span
                            key={capability}
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              capabilityKindClass(info?.kind ?? "voice"),
                            )}
                          >
                            {capabilityLabel(capability)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(provider.id, -1)}
                      disabled={index === 0 || saving}
                      aria-label={`Move ${provider.name} up`}
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMove(provider.id, 1)}
                      disabled={index === providers.length - 1 || saving}
                      aria-label={`Move ${provider.name} down`}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(provider)}
                      disabled={saving}
                      aria-label={`Edit ${provider.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(provider.id)}
                      disabled={saving}
                      aria-label={`Delete ${provider.name}`}
                      title="Delete"
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
      </section>

      <aside className="space-y-4">
        <form
          onSubmit={handleSubmit}
          className="theme-border theme-surface rounded-lg border p-4"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="theme-text text-sm font-semibold">
              {editingId ? "Edit Provider" : "Add Provider"}
            </h3>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label required>Name</Label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                className="mt-1"
                placeholder="OpenAI Image"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div>
                <Label required>Provider</Label>
                <Select
                  value={form.provider}
                  onChange={(event) => handleProviderChange(event.target.value as NativeMediaProvider)}
                  className="mt-1"
                >
                  {providerCatalog.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label required>Model</Label>
                {selectedProvider.models.length > 0 ? (
                  <Select
                    value={form.model}
                    onChange={(event) => handleModelChange(event.target.value)}
                    className="mt-1"
                  >
                    {selectedProvider.models.map((model) => (
                      <option key={model} value={model}>
                        {modelOptionLabel(model)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={form.model}
                    onChange={(event) => handleModelChange(event.target.value)}
                    className="mt-1"
                    placeholder="Enter model id"
                  />
                )}
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Capabilities
              </legend>
              <div className="mt-2 space-y-3">
                {(["image", "video", "audio", "voice"] as const).map((kind) => {
                  const options = capabilityCatalog.filter(
                    (capability) =>
                      capability.kind === kind &&
                      selectedModelCapabilitySet.has(capability.id),
                  );
                  if (options.length === 0) return null;
                  const Icon = KIND_ICON[kind];

                  return (
                    <div key={kind}>
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium capitalize text-gray-500 dark:text-gray-400">
                        <Icon className="h-3.5 w-3.5" />
                        {kind}
                      </div>
                      <div className="grid gap-1.5">
                        {options.map((capability) => (
                          <label
                            key={capability.id}
                            className={cn(
                              "theme-border flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors",
                              selectedCapabilitySet.has(capability.id)
                                ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
                                : "theme-surface text-gray-600 hover:[background:var(--app-hover)] dark:text-gray-300",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCapabilitySet.has(capability.id)}
                              onChange={() => toggleCapability(capability.id)}
                              className="h-4 w-4 rounded border-gray-300 text-deep-space-blue-500 focus:ring-deep-space-blue-400 dark:border-gray-600"
                            />
                            <span>{capability.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button type="submit" className="w-full" disabled={saving} isLoading={saving}>
              {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Save Provider" : "Add Provider"}
            </Button>
          </div>
        </form>

      </aside>
    </div>
  );
}
