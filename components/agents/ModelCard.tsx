"use client";

import type { Model } from "@/lib/types";
import { NATIVE_MODEL_TOOL_LABELS } from "@/lib/types";
import { Card } from "@/components/ui/Card";

interface ModelCardProps {
  model: Model;
  onEdit: (model: Model) => void;
  onView: (model: Model) => void;
  onDelete: (model: Model) => void;
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    xai: "xAI",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    groq: "Groq",
  };
  return labels[provider] ?? provider;
}

export function ModelCard({ model, onEdit, onView, onDelete }: ModelCardProps) {
  const nativeTools = model.native_tools ?? [];

  return (
    <Card className="relative group transition-all">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold bg-deep-space-blue-50 text-deep-space-blue-600 dark:bg-deep-space-blue-900/50 dark:text-deep-space-blue-300">
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">
                {model.model}
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {providerLabel(model.model_provider)}
              </p>
            </div>
          </div>
        </div>

        {model.description && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2 dark:text-gray-400">
            {model.description}
          </p>
        )}

        {nativeTools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {nativeTools.map((tool) => (
              <span
                key={tool}
                className="rounded-md border border-deep-space-blue-200 bg-deep-space-blue-50 px-2 py-0.5 text-[10px] font-medium text-deep-space-blue-700 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
              >
                {NATIVE_MODEL_TOOL_LABELS[tool] ?? tool}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
            temp {model.temperature.toFixed(2)}
          </span>
          <div className="flex flex-wrap gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onView(model)}
              className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              View
            </button>
            <button
              onClick={() => onEdit(model)}
              className="rounded-md px-2 py-1 text-xs text-deep-space-blue-600 hover:bg-deep-space-blue-50 transition-colors dark:text-deep-space-blue-400 dark:hover:bg-deep-space-blue-900/30"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(model)}
              className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
