import { normalizeToolCallArgs } from "../toolCallDisplay.ts";
import type { EncryptedPayload } from "../types";
import type { ActiveToolEntry } from "./types";

export type LifecyclePayload = {
  label?: string;
  summary?: string;
  event?: Record<string, unknown>;
  message?: string;
  delta?: string;
  checkpoint?: string;
  status?: string;
  details?: unknown;
  tool_name?: string;
  tool_args?: unknown;
  text_preview?: string;
  output?: unknown;
  output_preview?: string;
  error_preview?: string;
  task_preview?: string;
  result_preview?: string;
};

export type ToolPreviewPayload = LifecyclePayload & {
  provider_native?: boolean;
  provider?: string;
  tool_origin?: string;
};

export type ToolStreamData = Record<string, unknown> & {
  batch_id?: string;
  call_id?: string;
  parent_call_id?: string;
  tool_name?: string;
  success?: boolean;
  payload?: ToolPreviewPayload;
  encrypted_payload?: EncryptedPayload;
};

export function isAbilityTool(name: string): boolean {
  return name === "use_ability" || name.startsWith("ability/");
}

export function appendPreview(
  existing?: string,
  incoming?: string,
): string | undefined {
  const next = incoming?.trim();
  if (!next) return existing;
  const previous = existing?.trim();
  return previous ? `${previous}\n\n${next}` : next;
}

export function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function providerDisplayName(provider?: string): string {
  if (!provider) return "provider";
  if (provider.toLowerCase() === "xai") return "xAI";
  return provider;
}

function toolDisplayName(toolName: string): string {
  return toolName.replaceAll("_", " ");
}

export function providerToolPreview(
  toolName: string,
  provider: string | undefined,
  status: "started" | "completed" | "failed",
): string {
  const providerName = providerDisplayName(provider);
  if (toolName === "web_search") {
    if (status === "started") return `Searching the web with ${providerName}`;
    if (status === "failed") return "Web search failed";
    return "Web search completed";
  }
  if (toolName === "x_search") {
    if (status === "started") return `Searching X with ${providerName}`;
    if (status === "failed") return "X search failed";
    return "X search completed";
  }
  const label = toolDisplayName(toolName);
  if (status === "started") return `Running ${label} with ${providerName}`;
  if (status === "failed") return `${label} failed`;
  return `${label} completed`;
}

export function isProviderTool(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): boolean {
  return (
    data.provider_native === true ||
    data.tool_origin === "provider" ||
    payload?.provider_native === true ||
    payload?.tool_origin === "provider"
  );
}

export function providerForTool(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): string | undefined {
  return stringField(payload?.provider) ?? stringField(data.provider);
}

export function toolArgsSummary(
  data: ToolStreamData,
  payload?: ToolPreviewPayload,
): string {
  const args =
    payload?.tool_args !== undefined ? payload.tool_args : data.tool_args;
  if (args !== undefined) return normalizeToolCallArgs(args);
  return stringField(data.args_summary) ?? "";
}

export function upsertActiveTool(
  tools: ActiveToolEntry[],
  next: ActiveToolEntry,
): ActiveToolEntry[] {
  const matches = (tool: ActiveToolEntry) =>
    next.callId ? tool.callId === next.callId : tool.name === next.name;
  const update = (tool: ActiveToolEntry): ActiveToolEntry =>
    matches(tool)
      ? {
          ...tool,
          ...next,
          args: next.args || tool.args,
          textPreview: next.textPreview ?? tool.textPreview,
          outputPreview: next.outputPreview ?? tool.outputPreview,
          errorPreview: next.errorPreview ?? tool.errorPreview,
        }
      : {
          ...tool,
          children: tool.children?.map(update),
        };

  if (tools.some(matches)) return tools.map(update);
  return [...tools.map(update), next];
}

export function hookToolDisplayName(
  hook: string | undefined,
  hookEvent: string | undefined,
): string {
  const label = hook?.trim() || "hook";
  const event = hookEvent?.trim();
  return event ? `hook/${label}:${event}` : `hook/${label}`;
}
