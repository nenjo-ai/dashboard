"use client";

import { cn } from "@/lib/cn";
import { useState, useCallback, useMemo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  EncryptedPayload,
  ExecutionDetails,
  ExecutionCommand,
  ExecutionTask,
  RoutineDetail,
  TaskStepProgress,
} from "@/lib/types";
import {
  createExecution,
  sendExecutionCommand,
} from "@/lib/api";
import { subscribeExecutionRealtime } from "@/lib/executionRealtime";
import { useExecutionTasks, useRoutine } from "@/lib/hooks";
import { decryptContentPayload } from "@/lib/cryptoContent";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { formatToolCallSignature, normalizeToolCallArgs } from "@/lib/toolCallDisplay";


interface ExecutionPanelProps {
  projectId: string;
  executions: ExecutionDetails[] | undefined;
  isLoading: boolean;
  onRefresh: () => void;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

function canStart(e: ExecutionDetails): boolean {
  return e.status === "pending";
}

function canPause(e: ExecutionDetails): boolean {
  return e.status === "running";
}

function canResume(e: ExecutionDetails): boolean {
  return e.status === "paused";
}

function canCancel(e: ExecutionDetails): boolean {
  return e.status === "pending" || e.status === "running" || e.status === "paused";
}

// ---------------------------------------------------------------------------
// Status icons
// ---------------------------------------------------------------------------

function StatusIcon({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "h-4 w-4" : "h-3 w-3";

  switch (status) {
    case "resolved":
    case "done":
    case "passed":
    case "step_completed":
      return (
        <svg className={cn(sizeClass, "text-emerald-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "closed":
    case "failed":
    case "step_failed":
      return (
        <svg className={cn(sizeClass, "text-red-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "assigned":
    case "in_progress":
    case "running":
    case "step_started":
      return (
        <svg className={cn(sizeClass, "text-yellow-500 animate-spin shrink-0")} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    case "step_warning":
      return (
        <svg className={cn(sizeClass, "text-amber-500 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case "skipped":
      return (
        <svg className={cn(sizeClass, "text-gray-400 shrink-0")} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.69zM12.75 8.689c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.69z" />
        </svg>
      );
    default:
      return <span className={cn(sizeClass, "theme-surface-muted rounded-full shrink-0 block")} />;
  }
}

function StepTypeBadge({ stepType }: { stepType: string }) {
  const colors: Record<string, string> = {
    agent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    gate: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    council: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    terminal: "theme-surface-muted theme-text-muted",
    merge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    setup: "theme-surface-muted theme-text-muted",
  };
  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded-sm text-[10px] font-medium", colors[stepType] ?? colors.agent)}>
      {stepType}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Task row (expandable)
// ---------------------------------------------------------------------------

/** Deduplicate step events by step_name, keeping only the latest event per step.
 *  The backend returns all events (step_started, step_completed, step_failed)
 *  as separate rows. We collapse them so only the most recent status is shown.
 *  Preserves step_type and agent from earlier events when a later event lacks them. */
function deduplicateSteps(steps: TaskStepProgress[]): TaskStepProgress[] {
  const map = new Map<string, TaskStepProgress>();
  for (const step of steps) {
    const key = stepIdentityKey(step);
    const prev = map.get(key);
    if (prev) {
      // Carry forward fields that step_completed doesn't populate.
      const merged = { ...step };
      if (!merged.step_type && prev.step_type) merged.step_type = prev.step_type;
      if (!merged.agent && prev.agent) merged.agent = prev.agent;
      map.set(key, merged);
    } else {
      map.set(key, step);
    }
  }
  return Array.from(map.values());
}

interface DisplayStep {
  step: TaskStepProgress;
  children: TaskStepProgress[];
  attemptLabel?: string;
}

type StepPayloadData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stepIdentityKey(step: TaskStepProgress): string {
  const stepRunId = step.data?.step_run_id;
  if (typeof stepRunId === "string" && stepRunId.length > 0) {
    return `routine-run:${stepRunId}`;
  }
  const stepId = step.data?.step_id;
  if (typeof stepId === "string" && stepId.length > 0) {
    return `routine:${stepId}`;
  }
  if (step.step_type === "agent" && step.agent?.agent) {
    return `agent:${step.agent.agent}:${step.step_name}`;
  }
  return `${step.step_type}:${step.step_name}`;
}

function agentStepIdentityKey(step: TaskStepProgress): string | null {
  if (!step.agent?.agent) return null;
  return `${step.agent.agent}:${stepIdentityKey(step)}`;
}

function extractStringFields(data: Record<string, unknown> | undefined): StepPayloadData {
  if (!data) return {};

  const extracted: StepPayloadData = {};
  for (const key of ["error", "warning"]) {
    if (typeof data[key] === "string" && String(data[key]).trim().length > 0) {
      extracted[key] = data[key];
    }
  }

  return extracted;
}

async function resolveStepPayload(
  data: Record<string, unknown> | undefined,
  directPayload?: Record<string, unknown> | null,
  directEncryptedPayload?: EncryptedPayload | null,
): Promise<StepPayloadData | null> {
  if (!data && !directPayload && !directEncryptedPayload) return null;

  const resolved: StepPayloadData = {
    ...extractStringFields(data),
  };

  if (directPayload) {
    Object.assign(resolved, directPayload);
  }

  if (directEncryptedPayload) {
    try {
      const decrypted = await decryptContentPayload(directEncryptedPayload);
      if (decrypted) {
        const parsed = JSON.parse(decrypted) as unknown;
        if (isRecord(parsed)) {
          Object.assign(resolved, parsed);
        }
      }
    } catch (error) {
      console.warn("Failed to decrypt execution step payload", {
        objectId: directEncryptedPayload.object_id,
        objectType: directEncryptedPayload.object_type,
        keyVersion: directEncryptedPayload.key_version,
        error,
      });
    }
  }

  return Object.keys(resolved).length > 0 ? resolved : null;
}

function getResolvedText(
  payload: StepPayloadData | null | undefined,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function mergeStep(prev: TaskStepProgress, next: TaskStepProgress): TaskStepProgress {
  const merged = { ...next };
  const prevPayload = isRecord(prev.payload) ? prev.payload : null;
  const nextPayload = isRecord(next.payload) ? next.payload : null;
  if (!merged.step_type && prev.step_type) merged.step_type = prev.step_type;
  if (!merged.agent && prev.agent) merged.agent = prev.agent;
  merged.data = { ...(prev.data ?? {}), ...(next.data ?? {}) };
  if (prevPayload || nextPayload) {
    merged.payload = { ...(prevPayload ?? {}), ...(nextPayload ?? {}) };
  } else if (!merged.payload && prev.payload) {
    merged.payload = prev.payload;
  }
  if (!merged.encrypted_payload && prev.encrypted_payload) {
    merged.encrypted_payload = prev.encrypted_payload;
  }
  return merged;
}

function isCompletedStep(step: TaskStepProgress): boolean {
  return (
    step.event_type === "step_completed" ||
    step.event_type === "step_failed" ||
    step.event_type === "failed" ||
    step.event_type === "done"
  );
}

function stepCreatedTime(step: TaskStepProgress): number {
  const time = step.created_at ? new Date(step.created_at).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function routineStepKey(step: TaskStepProgress): string {
  const stepId = step.data?.step_id;
  if (typeof stepId === "string" && stepId.length > 0) {
    return `routine:${stepId}`;
  }
  return `${step.step_type}:${step.step_name}`;
}

function isWorktreeStep(step: TaskStepProgress): boolean {
  return step.step_type === "worktree" || step.step_name.startsWith("worktree_");
}

function isChildActivityStep(step: TaskStepProgress): boolean {
  return step.step_type === "tool" || step.step_type === "ability" || step.step_type === "delegation";
}

function childActivityKey(step: TaskStepProgress): string {
  const toolCallId = step.data?.tool_call_id;
  if (typeof toolCallId === "string" && toolCallId.length > 0) {
    return `tool-call:${toolCallId}`;
  }

  const toolIndex = step.data?.tool_index;
  if (typeof toolIndex === "number") {
    return `${step.step_type}:${step.step_name}:${toolIndex}`;
  }

  return `${step.step_type}:${step.step_name}`;
}

function routineOrderIndex(step: TaskStepProgress, routine: RoutineDetail | undefined): number | null {
  if (!routine) return null;
  const stepId = step.data?.step_id;
  const routineStep =
    typeof stepId === "string"
      ? routine.steps.find((candidate) => candidate.id === stepId)
      : routine.steps.find(
          (candidate) =>
            candidate.name === step.step_name && candidate.step_type === step.step_type,
        );
  return routineStep?.order_index ?? null;
}

function orderDisplaySteps(groups: DisplayStep[], routine: RoutineDetail | undefined): DisplayStep[] {
  const withIndex = groups.map((group, index) => ({ ...group, originalIndex: index }));
  const setup = withIndex.filter((group) => group.step.step_name === "worktree_setup");
  const cleanup = withIndex.filter((group) => group.step.step_name === "worktree_cleanup");
  const body = withIndex.filter(
    (group) =>
      group.step.step_name !== "worktree_setup" &&
      group.step.step_name !== "worktree_cleanup",
  );

  body.sort((a, b) => {
    const aTime = stepCreatedTime(a.step);
    const bTime = stepCreatedTime(b.step);
    if (aTime !== bTime) return aTime - bTime;

    const aOrder = routineOrderIndex(a.step, routine);
    const bOrder = routineOrderIndex(b.step, routine);
    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.originalIndex - b.originalIndex;
  });

  const ordered = [...setup, ...body, ...cleanup];
  const attemptCounts = new Map<string, number>();
  let previousRoutineOrder: number | null = null;
  let previousRoutineStepName: string | null = null;

  return ordered.map(({ originalIndex: _originalIndex, ...group }) => {
    if (isWorktreeStep(group.step) || isChildActivityStep(group.step)) {
      return group;
    }

    const key = routineStepKey(group.step);
    const attempt = (attemptCounts.get(key) ?? 0) + 1;
    attemptCounts.set(key, attempt);

    let attemptLabel: string | undefined;
    const currentOrder = routineOrderIndex(group.step, routine);
    if (attempt > 1) {
      attemptLabel = `attempt ${attempt}`;
      if (
        currentOrder != null &&
        previousRoutineOrder != null &&
        currentOrder <= previousRoutineOrder &&
        previousRoutineStepName
      ) {
        attemptLabel = `${attemptLabel} after ${previousRoutineStepName}`;
      }
    }

    if (currentOrder != null) {
      previousRoutineOrder = currentOrder;
      previousRoutineStepName = group.step.step_name;
    }

    return { ...group, attemptLabel };
  });
}

function buildDisplaySteps(
  steps: TaskStepProgress[],
  routine: RoutineDetail | undefined,
): DisplayStep[] {
  const groups: DisplayStep[] = [];
  const parentIndex = new Map<string, number>();
  const agentParentIndex = new Map<string, number>();
  let currentParentName: string | null = null;

  const upsertTopLevel = (step: TaskStepProgress): number => {
    const key = stepIdentityKey(step);
    const existingIndex = parentIndex.get(key);
    if (existingIndex != null) {
      groups[existingIndex] = {
        ...groups[existingIndex],
        step: mergeStep(groups[existingIndex].step, step),
      };
      return existingIndex;
    }

    const nextIndex = groups.length;
    groups.push({ step, children: [] });
    parentIndex.set(key, nextIndex);
    parentIndex.set(step.step_name, nextIndex);
    const agentKey = agentStepIdentityKey(step);
    if (agentKey && step.step_type === "agent") {
      agentParentIndex.set(agentKey, nextIndex);
    }
    return nextIndex;
  };

  const upsertAgentTopLevel = (step: TaskStepProgress): number => {
    const agentKey = agentStepIdentityKey(step);
    if (!agentKey) return upsertTopLevel(step);

    const existingIndex = agentParentIndex.get(agentKey);
    if (existingIndex != null) {
      groups[existingIndex] = {
        ...groups[existingIndex],
        step: mergeStep(groups[existingIndex].step, {
          ...step,
          step_name: groups[existingIndex].step.step_name,
        }),
      };
      return existingIndex;
    }

    return upsertTopLevel(step);
  };

  const upsertChild = (groupIndex: number, step: TaskStepProgress) => {
    const toolNames = Array.isArray(step.data?.tool_names)
      ? step.data.tool_names.filter((value): value is string => typeof value === "string")
      : [step.step_name];
    const toolCallIds = Array.isArray(step.data?.tool_call_ids)
      ? step.data.tool_call_ids
      : [];
    const toolArgs = Array.isArray(step.data?.tool_args)
      ? step.data.tool_args
      : [];

    for (let toolIndex = 0; toolIndex < toolNames.length; toolIndex += 1) {
      const toolName = toolNames[toolIndex];
      const childStep: TaskStepProgress = {
        ...step,
        step_name: toolName,
        data: {
          ...(step.data ?? {}),
          tool_call_id:
            typeof toolCallIds[toolIndex] === "string"
              ? toolCallIds[toolIndex]
              : step.data?.tool_call_id,
          tool_index: toolIndex,
          tool_args:
            toolArgs[toolIndex] != null
              ? normalizeToolCallArgs(toolArgs[toolIndex])
              : normalizeToolCallArgs(step.data?.tool_args),
        },
      };

      const childKey = childActivityKey(childStep);
      const existingIndex = groups[groupIndex].children.findIndex(
        (child) => childActivityKey(child) === childKey,
      );

      if (existingIndex >= 0) {
        groups[groupIndex].children[existingIndex] = mergeStep(
          groups[groupIndex].children[existingIndex],
          childStep,
        );
      } else {
        groups[groupIndex].children.push(childStep);
      }
    }
  };

  const createImplicitAgentParent = (step: TaskStepProgress): number | null => {
    if (!step.agent?.agent) return null;
    const stepId = step.data?.step_id;
    const stepRunId = step.data?.step_run_id;
    const implicitStep: TaskStepProgress = {
      ...step,
      step_name: step.agent.agent_name ?? "agent",
      step_type: "agent",
      event_type: step.event_type === "step_completed" ? "step_started" : step.event_type,
      status: step.status === "passed" ? "running" : step.status,
      duration_ms: null,
      data: {
        ...(typeof stepId === "string" ? { step_id: stepId } : {}),
        ...(typeof stepRunId === "string" ? { step_run_id: stepRunId } : {}),
      },
      payload: null,
      encrypted_payload: null,
    };
    return upsertAgentTopLevel(implicitStep);
  };

  for (const rawStep of steps) {
    if (!isChildActivityStep(rawStep)) {
      if (rawStep.step_type === "agent" && rawStep.agent?.agent) {
        upsertAgentTopLevel(rawStep);
      } else {
        upsertTopLevel(rawStep);
      }
      currentParentName = rawStep.step_name;
    }
  }

  currentParentName = null;

  for (const rawStep of steps) {
    if (!isChildActivityStep(rawStep)) {
      currentParentName = rawStep.step_name;
      continue;
    }

    const parentToolName =
      typeof rawStep.data?.parent_tool_name === "string"
        ? rawStep.data.parent_tool_name
        : null;
    const parentStepId =
      typeof rawStep.data?.step_run_id === "string"
        ? `routine-run:${rawStep.data.step_run_id}`
        : typeof rawStep.data?.step_id === "string"
          ? `routine:${rawStep.data.step_id}`
          : null;
    const parentGroupIndex =
      parentStepId != null
        ? parentIndex.get(parentStepId)
        : parentToolName != null
          ? parentIndex.get(parentToolName)
          : undefined;

    if (parentGroupIndex != null && groups[parentGroupIndex].step.step_type !== "tool") {
      upsertChild(parentGroupIndex, rawStep);
      continue;
    }

    const rawAgentKey = agentStepIdentityKey(rawStep);
    const agentGroupIndex = rawAgentKey
      ? agentParentIndex.get(rawAgentKey) ?? createImplicitAgentParent(rawStep)
      : null;

    if (agentGroupIndex != null) {
      upsertChild(agentGroupIndex, rawStep);
      continue;
    }

    const currentParentGroupIndex =
      currentParentName != null ? parentIndex.get(currentParentName) : undefined;

    if (currentParentGroupIndex != null && groups[currentParentGroupIndex].step.step_type !== "tool") {
      upsertChild(currentParentGroupIndex, rawStep);
      continue;
    }

    upsertTopLevel(rawStep);
  }

  return orderDisplaySteps(groups, routine);
}

/** Extract token counts from a step's data — supports both flat (output_preview flow)
 *  and nested metrics (real-time flow) shapes. */
function getStepTokens(data: Record<string, unknown> | undefined): { input: number; output: number; total: number } {
  if (!data) return { input: 0, output: 0, total: 0 };
  const m = data.metrics as Record<string, unknown> | undefined;
  const input = (typeof m?.input_tokens === "number" ? m.input_tokens : 0)
    + (typeof data.input_tokens === "number" ? data.input_tokens : 0);
  const output = (typeof m?.output_tokens === "number" ? m.output_tokens : 0)
    + (typeof data.output_tokens === "number" ? data.output_tokens : 0);
  const total = (typeof m?.total_tokens === "number" ? m.total_tokens : 0) || (input + output);
  return { input, output, total };
}

function MarkdownPreview({ content }: { content: string }) {
  const normalized = content
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:break-all prose-pre:bg-gray-800 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:text-xs prose-pre:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_pre_code]:break-normal prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-blockquote:border-deep-space-blue-300 dark:prose-blockquote:border-deep-space-blue-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            if (className) {
              return <code className={className} {...props}>{children}</code>;
            }
            return <code {...props}>{children}</code>;
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function friendlyToolName(toolName: string): string {
  return toolName.replace(/^app\.nenjo\.platform\//, "");
}

function hasToolArgs(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function getToolArgs(
  data: Record<string, unknown> | undefined,
  payload: StepPayloadData | null | undefined,
): string {
  const payloadArgs = payload?.tool_args;
  const dataArgs = data?.tool_args;
  const resolvedFromPayload = hasToolArgs(payloadArgs)
    ? normalizeToolCallArgs(payloadArgs)
    : "";
  const resolvedFromData = hasToolArgs(dataArgs)
    ? normalizeToolCallArgs(dataArgs)
    : "";
  if (resolvedFromPayload) return resolvedFromPayload;
  if (resolvedFromData) return resolvedFromData;
  return "";
}

function TaskRow({
  task,
  defaultExpanded = false,
  defaultOpenActivity = false,
}: {
  task: ExecutionTask;
  defaultExpanded?: boolean;
  defaultOpenActivity?: boolean;
}) {
  const { routine } = useRoutine(task.routine_id ?? undefined);
  const displaySteps = useMemo(
    () => buildDisplaySteps(task.steps ?? [], routine),
    [task.steps, routine],
  );
  const steps = useMemo(() => deduplicateSteps(task.steps ?? []), [task.steps]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openActivity, setOpenActivity] = useState<Record<string, boolean>>(() => {
    if (!defaultOpenActivity) return {};

    const initial: Record<string, boolean> = {};
    for (const { step, children } of displaySteps) {
      if (children.length === 0 || !isCompletedStep(step)) continue;
      initial[`${task.id ?? task.slug ?? task.title}:${stepIdentityKey(step)}`] = true;
    }
    return initial;
  });
  const [resolvedPayloads, setResolvedPayloads] = useState<Record<string, StepPayloadData>>({});

  const totalDuration = steps.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);
  const totalTokens = steps.reduce(
    (acc, s) => acc + getStepTokens(s.data as Record<string, unknown> | undefined).total, 0
  );

  useEffect(() => {
    if (!expanded) {
      return;
    }

    let cancelled = false;

    const stepEntries = displaySteps.flatMap(({ step, children }, parentIndex) => [
      [`step:${parentIndex}`, step] as const,
      ...children.map((child, childIndex) => [`step:${parentIndex}:child:${childIndex}`, child] as const),
    ]);

    void Promise.all(
      stepEntries.map(async ([key, step]) => {
        const resolved = await resolveStepPayload(
          step.data as Record<string, unknown> | undefined,
          step.payload ?? null,
          step.encrypted_payload ?? null,
        );
        return [key, resolved] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, StepPayloadData> = {};
      for (const [key, resolved] of entries) {
        if (resolved) next[key] = resolved;
      }
      setResolvedPayloads(next);
    });

    return () => {
      cancelled = true;
    };
  }, [expanded, displaySteps]);

  return (
    <div className="theme-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:[background:var(--app-hover)]"
      >
        <StatusIcon status={task.status} size="md" />
        <span className="theme-text flex-1 truncate text-sm font-medium">
          {task.slug ?? task.title}
        </span>
        {totalTokens > 0 && (
          <span className="theme-text-muted shrink-0 text-[10px] tabular-nums">
            {formatTokens(totalTokens)} tok
          </span>
        )}
        {totalDuration > 0 && (
          <span className="theme-text-muted shrink-0 text-xs tabular-nums">
            {formatDuration(totalDuration)}
          </span>
        )}
        <svg
          className={cn(
            "theme-text-muted h-3.5 w-3.5 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {expanded && displaySteps.length > 0 && (
        <div className="pl-10 pr-4 pb-2 space-y-1">
          {displaySteps.map(({ step, children, attemptLabel }, parentIndex) => {
            const d = step.data as Record<string, unknown> | undefined;
            const resolved = resolvedPayloads[`step:${parentIndex}`];
            const metrics = d?.metrics as
              | { execution_count?: number }
              | undefined;
            const tokens = getStepTokens(d);
            const errorMsg =
              (step.event_type === "step_failed" || step.event_type === "failed") &&
              (getResolvedText(resolved, "error") ?? (d?.error ? String(d.error) : null))
                ? (getResolvedText(resolved, "error") ?? String(d?.error))
                : null;
            const warningMsg =
              step.event_type === "step_warning" &&
              (getResolvedText(resolved, "warning") ?? (d?.warning ? String(d.warning) : null))
                ? (getResolvedText(resolved, "warning") ?? String(d?.warning))
                : null;
            const isTerminal = step.step_type === "terminal" || step.step_type === "terminal_fail";
            const outputPreview =
              step.event_type === "step_completed" && !isTerminal
                ? getResolvedText(resolved, "output_preview")
                : null;
            const agent = step.agent;
            const isRunning =
              step.event_type === "step_started" || step.event_type === "running";
            const hasActivity = step.step_type !== "tool" && (children.length > 0 || isRunning);
            const stepKey = stepIdentityKey(step);
            const activityKey = `${task.id ?? task.slug ?? task.title}:${stepKey}`;
            const renderKey = `${activityKey}:${parentIndex}`;
            const isDone = isCompletedStep(step);
            const activityExpanded = !!openActivity[activityKey];
            const activityLabel = isDone ? "source activity" : "live stream";
            return (
              <div key={renderKey}>
                <div className="flex items-center gap-2 py-1">
                  {agent ? (
                    <RoleIdenticon
                      roleId={agent.agent}
                      color={agent.agent_color ?? "#6B7280"}
                      size={14}
                      className="shrink-0"
                      animate={isRunning}
                      name={agent.agent_name ?? undefined}
                    />
                  ) : (
                    <StatusIcon status={step.event_type} />
                  )}
                  <span className="theme-text flex-1 truncate text-xs">
                    {step.step_name}
                  </span>
                  {attemptLabel && (
                    <span className="shrink-0 rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                      {attemptLabel}
                    </span>
                  )}
                  {metrics?.execution_count != null && metrics.execution_count > 1 && (
                    <span className="text-[10px] text-amber-600 font-medium">
                      x{metrics.execution_count}
                    </span>
                  )}
                  <StepTypeBadge stepType={step.step_type} />
                  {tokens.total > 0 && (
                    <span
                      className="theme-text-muted shrink-0 text-[10px] tabular-nums"
                      title={`In: ${tokens.input.toLocaleString()} / Out: ${tokens.output.toLocaleString()}`}
                    >
                      {formatTokens(tokens.total)} tok
                    </span>
                  )}
                  {step.duration_ms != null && step.duration_ms > 0 && (
                    <span className="theme-text-muted shrink-0 text-xs tabular-nums">
                      {formatDuration(step.duration_ms)}
                    </span>
                  )}
                </div>
                {outputPreview && (
                  <div className="theme-surface-muted theme-text ml-5 mt-0.5 mb-1 max-h-64 overflow-y-auto break-words rounded-md px-2.5 py-1.5 text-xs">
                    <MarkdownPreview content={outputPreview} />
                  </div>
                )}
                {errorMsg && (
                  <div className="ml-5 mt-0.5 mb-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-wrap wrap-break-word">
                    {errorMsg}
                  </div>
                )}
                {warningMsg && (
                  <div className="ml-5 mt-0.5 mb-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 whitespace-pre-wrap wrap-break-word">
                    {warningMsg}
                  </div>
                )}
                {hasActivity && (
                  <div className="ml-5 mt-1 mb-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenActivity((prev) => ({
                          ...prev,
                          [activityKey]: !prev[activityKey],
                        }))
                      }
                      className="theme-surface theme-border theme-text inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:[background:var(--app-hover)]"
                    >
                      <span>{activityExpanded ? "Hide" : "Show"} {activityLabel}</span>
                      <span className="theme-surface-muted theme-text-muted rounded-sm px-1.5 py-0.5 text-[10px]">
                        {children.length || (isRunning ? "live" : 0)}
                      </span>
                    </button>
                  </div>
                )}
                {hasActivity && activityExpanded && (
                  <div className="theme-border theme-surface-muted ml-5 mt-1 mb-2 rounded-md border px-3 py-2">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn("inline-flex h-2 w-2 rounded-full", isDone ? "bg-gray-400" : "bg-yellow-500 animate-pulse")} />
                      <span className="theme-text-muted text-[11px] font-semibold uppercase tracking-wide">
                        {isDone ? "Source activity" : "Live stream"}
                      </span>
                    </div>
                    {children.length === 0 ? (
                      <div className="theme-surface rounded-md px-2.5 py-2 text-xs [color:var(--app-text-muted)]">
                        Waiting for tool activity…
                      </div>
                    ) : (
                    <div className="space-y-0.5">
                      {children.map((child, childIndex) => {
                        const childData = child.data as Record<string, unknown> | undefined;
                        const childResolved =
                          resolvedPayloads[`step:${parentIndex}:child:${childIndex}`];
                        const childError =
                          (child.event_type === "step_failed" || child.event_type === "failed") &&
                          (getResolvedText(childResolved, "error")
                            ?? (childData?.error ? String(childData.error) : null))
                            ? (getResolvedText(childResolved, "error") ?? String(childData?.error))
                            : null;
                        const signature = formatToolCallSignature(
                          friendlyToolName(child.step_name),
                          getToolArgs(childData, childResolved),
                        );
                        const statusLabel = childError
                          ? "failed"
                          : isCompletedStep(child)
                            ? "done"
                            : null;

                        return (
                          <div key={`${renderKey}:${stepIdentityKey(child)}:${childIndex}`} className="theme-surface rounded-md px-2 py-1.5">
                            <div className="flex items-start gap-2">
                              <StatusIcon status={child.event_type} />
                              <div className="min-w-0 flex-1">
                                <div className="theme-border theme-surface-muted rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed theme-text">
                                  <span className="whitespace-pre-wrap break-words">{signature}</span>
                                  {statusLabel && (
                                    <span className={cn(
                                      "ml-2 font-sans text-[10px] font-medium",
                                      childError
                                        ? "text-red-500/80 dark:text-red-400/80"
                                        : "text-emerald-500/80 dark:text-emerald-400/80",
                                    )}>
                                      {statusLabel}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History row (expandable with task list)
// ---------------------------------------------------------------------------

/** Aggregate token counts across all steps in all tasks for a history row. */
function aggregateRunTokens(tasks: ExecutionTask[] | undefined): { input: number; output: number; total: number } {
  if (!tasks) return { input: 0, output: 0, total: 0 };
  let input = 0;
  let output = 0;
  for (const task of tasks) {
    for (const step of task.steps ?? []) {
      const d = step.data as Record<string, unknown> | undefined;
      const m = d?.metrics as Record<string, unknown> | undefined;
      input += (typeof m?.input_tokens === "number" ? m.input_tokens : 0)
        + (typeof d?.input_tokens === "number" ? d.input_tokens : 0);
      output += (typeof m?.output_tokens === "number" ? m.output_tokens : 0)
        + (typeof d?.output_tokens === "number" ? d.output_tokens : 0);
    }
  }
  return { input, output, total: input + output };
}

function HistoryRow({ execution: exec }: { execution: ExecutionDetails }) {
  const [expanded, setExpanded] = useState(false);
  const { tasks } = useExecutionTasks(expanded ? exec.id : undefined);
  const tokens = useMemo(() => aggregateRunTokens(tasks), [tasks]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:[background:var(--app-hover)]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant={exec.status} showDot>
            {exec.status}
          </Badge>
          <div className="min-w-0">
            <p className="theme-text truncate text-sm">
              {exec.routine_name ?? `Run #${exec.id.slice(0, 8)}`}
            </p>
            <p className="theme-text-muted text-xs">
              {exec.parallel_count} parallel ·{" "}
              {exec.task_counts.total} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {tokens.total > 0 && (
            <span
              className="theme-text-muted hidden text-[10px] tabular-nums sm:block"
              title={`In: ${tokens.input.toLocaleString()} · Out: ${tokens.output.toLocaleString()}`}
            >
              {formatTokens(tokens.total)} tok
            </span>
          )}
          {exec.task_counts.total > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="theme-surface-muted h-1.5 w-16 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.min(exec.completion_percentage, 100)}%`,
                  }}
                />
              </div>
              <span className="theme-text-muted text-xs">
                {Math.round(exec.completion_percentage)}%
              </span>
            </div>
          )}
          <span className="theme-text-muted text-xs">
            {formatRelativeTime(exec.created_at)}
          </span>
          <svg
            className={cn(
              "theme-text-muted h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="theme-border border-t">
          {tasks && tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
              />
            ))
          ) : (
            <div className="theme-text-muted px-5 py-3 text-xs">
              {tasks ? "No tasks in this run" : "Loading tasks..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionPanel({
  projectId,
  executions,
  isLoading,
  onRefresh,
}: ExecutionPanelProps) {
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [parallelCount, setParallelCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Active execution = most recent non-terminal
  const activeExecution = useMemo(
    () =>
      executions?.find(
        (e) =>
          e.status === "running" ||
          e.status === "paused" ||
          e.status === "pending",
      ),
    [executions],
  );

  // Fetch tasks for active/selected run
  const { tasks: executionTasks, mutate: mutateTasks } = useExecutionTasks(
    activeExecution?.id,
  );

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = (includeTasks: boolean) => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        onRefresh();
        if (includeTasks) {
          void mutateTasks();
        }
      }, 350);
    };

    void subscribeExecutionRealtime(
      (event) => {
        const type = typeof event.data.type === "string" ? event.data.type : "";
        if (
          type === "task.step_event" ||
          type === "task.completed" ||
          type === "execution.started" ||
          type === "execution.completed"
        ) {
          scheduleRefresh(true);
        }
      },
      controller.signal,
    ).catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Execution realtime stream failed:", error);
      }
    });

    return () => {
      controller.abort();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [onRefresh, mutateTasks]);

  const handleCreate = useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      await createExecution({
        project: projectId,
        parallel_count: parallelCount,
      });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create execution.");
    } finally {
      setCreating(false);
    }
  }, [projectId, parallelCount, onRefresh]);

  const handleCommand = useCallback(
    async (executionId: string, command: ExecutionCommand) => {
      setError(null);
      setSending(command);
      try {
        await sendExecutionCommand(executionId, command);
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${command} execution.`);
      } finally {
        setSending(null);
      }
    },
    [onRefresh],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      onRefresh();
      await mutateTasks();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, mutateTasks]);

  if (isLoading) {
    return (
      <div className="theme-surface theme-border space-y-4 rounded-xl border p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  // Count running tasks
  const runningTasks = executionTasks?.filter(
    (t) => t.status === "assigned" || t.status === "in_progress",
  ).length ?? 0;
  const doneTasks = executionTasks?.filter(
    (t) => t.status === "done" || t.status === "failed",
  ).length ?? 0;
  const readyTasks = executionTasks?.filter(
    (t) => t.status === "ready",
  ).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Active execution card */}
      {activeExecution ? (
        <div className="theme-surface theme-border rounded-xl border">
          {/* Header */}
          <div className="theme-border flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <h3 className="theme-text text-sm font-semibold">
                Execution Run
              </h3>
              <Badge variant={activeExecution.status} showDot>
                {activeExecution.status}
              </Badge>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  activeExecution.status === "running" || activeExecution.status === "pending"
                    ? "bg-emerald-500 animate-pulse"
                    : activeExecution.status === "paused"
                      ? "bg-yellow-500"
                      : "bg-[var(--app-border-strong)]",
                )}
                title="Realtime execution state"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="theme-text-muted text-xs">
                {formatRelativeTime(activeExecution.created_at)}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="theme-text-muted rounded-md p-1.5 transition-colors hover:[background:var(--app-hover)] hover:[color:var(--app-text)] disabled:opacity-50"
                title="Refresh statuses"
              >
                <svg
                  className={cn("h-4 w-4", refreshing && "animate-spin")}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.016 4.356v4.992" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="theme-text-muted text-xs">
                  {doneTasks} / {activeExecution.task_counts.total} tasks complete
                </span>
                <span className="theme-text text-xs font-medium">
                  {Math.round(activeExecution.completion_percentage)}%
                </span>
              </div>
              <div className="theme-surface-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-deep-space-blue-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(activeExecution.completion_percentage, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                {
                  label: "Slots",
                  value: `${runningTasks}/${activeExecution.parallel_count}`,
                },
                { label: "Ready", value: readyTasks },
                { label: "Running", value: runningTasks },
                { label: "Done", value: doneTasks },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="theme-surface-muted rounded-lg px-2 py-2"
                >
                  <p className="theme-text text-lg font-bold">{value}</p>
                  <p className="theme-text-muted text-[10px] uppercase tracking-wider">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-2">
              {canStart(activeExecution) && (
                <Button
                  size="sm"
                  onClick={() => handleCommand(activeExecution.id, "start")}
                  disabled={!!sending}
                >
                  {sending === "start" ? "Starting..." : "Start Execution"}
                </Button>
              )}
              {canPause(activeExecution) && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCommand(activeExecution.id, "pause")}
                  disabled={!!sending}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  {sending === "pause" ? "Pausing..." : "Pause"}
                </Button>
              )}
              {canResume(activeExecution) && (
                <Button
                  size="sm"
                  onClick={() => handleCommand(activeExecution.id, "resume")}
                  disabled={!!sending}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  {sending === "resume" ? "Resuming..." : "Resume"}
                </Button>
              )}
              {canCancel(activeExecution) && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleCommand(activeExecution.id, "cancel")}
                  disabled={!!sending}
                >
                  {sending === "cancel" ? "Cancelling..." : "Cancel"}
                </Button>
              )}
            </div>
          </div>

          {/* Task list (GitHub Actions style) */}
          {executionTasks && executionTasks.length > 0 && (
            <div className="theme-border border-t">
              <div className="px-5 py-2.5">
                <h4 className="theme-text-muted text-xs font-medium uppercase tracking-wider">
                  Tasks
                </h4>
              </div>
              <div>
                {executionTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No active execution — creation UI */
        <div className="theme-surface theme-border rounded-xl border p-5">
          <h3 className="theme-text mb-3 text-sm font-semibold">
            Start New Execution
          </h3>
          <p className="theme-text-muted mb-4 text-sm">
            Create an execution run to start processing tasks with AI agents.
            Each task uses its own assigned routine.
          </p>

          <div className="flex items-end gap-3">
            <div>
              <label
                htmlFor="parallel-count"
                className="theme-text-muted mb-1 block text-xs font-medium"
              >
                Parallel Tasks
              </label>
              <input
                id="parallel-count"
                type="number"
                min={1}
                max={20}
                value={parallelCount}
                onChange={(e) =>
                  setParallelCount(
                    Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                  )
                }
                className="theme-surface theme-border theme-text w-20 rounded-lg border px-3 py-2 text-sm focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500"
              />
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Start Execution
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Execution history */}
      {executions && executions.length > 0 && (
        <div className="theme-surface theme-border rounded-xl border">
          <div className="theme-border border-b px-5 py-3">
            <h3 className="theme-text text-sm font-semibold">
              Execution History
            </h3>
          </div>
          <div className="theme-border divide-y">
            {executions.map((exec) => (
              <HistoryRow key={exec.id} execution={exec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
