import type {
  ExecutionTask,
  ExecutionTaskCurrentStep,
  RoutineDetail,
  RoutineStep,
  TaskStepProgress,
} from "./types";

export interface RoutineDisplayStep {
  step: TaskStepProgress;
  children: TaskStepProgress[];
  attemptLabel?: string;
}

export interface RoutineDisplayOptions {
  includeRoutinePlaceholders?: boolean;
  includeWorktreePlaceholders?: boolean;
}

export interface CurrentExecutionStepDisplay {
  step_name: string;
  step_type: string;
  status: string;
  event_type: string;
  agent_name?: string | null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stepDataString(step: TaskStepProgress, key: string): string | null {
  return stringField(step.data?.[key]);
}

function isPlaceholderStep(step: TaskStepProgress): boolean {
  return step.data?.placeholder === true;
}

export function routineIsCompletedStep(step: TaskStepProgress): boolean {
  return (
    step.event_type === "step_completed" ||
    step.event_type === "step_failed" ||
    step.event_type === "tool_completed" ||
    step.event_type === "tool_failed" ||
    step.event_type === "ability_completed" ||
    step.event_type === "ability_failed" ||
    step.event_type === "delegation_completed" ||
    step.event_type === "delegation_failed" ||
    step.event_type === "failed" ||
    step.event_type === "done"
  );
}

function normalizeCurrentStep(
  step: ExecutionTaskCurrentStep | TaskStepProgress,
): CurrentExecutionStepDisplay {
  return {
    step_name: step.step_name,
    step_type: step.step_type || "agent",
    status: step.status,
    event_type: step.event_type,
    agent_name: step.agent?.agent_name,
  };
}

function taskIsTerminal(task: ExecutionTask): boolean {
  return ["completed", "failed", "cancelled"].includes(task.status);
}

function isRunningDisplayStep(step: TaskStepProgress): boolean {
  return (
    step.status === "running" ||
    step.event_type === "step_started" ||
    step.event_type === "running" ||
    step.event_type === "progress" ||
    step.event_type === "step_warning"
  );
}

function projectedParentFromChild(
  child: TaskStepProgress,
): CurrentExecutionStepDisplay | null {
  if (!isRoutineChildActivityStep(child)) return null;
  const stepSlug = child.data?.step_slug;
  if (typeof stepSlug !== "string" || stepSlug.trim().length === 0) return null;

  return {
    step_name: stepSlug,
    step_type: "agent",
    status: "running",
    event_type: child.event_type,
    agent_name: child.agent?.agent_name,
  };
}

export function isRoutineChildActivityStep(step: TaskStepProgress): boolean {
  return (
    step.step_type === "tool" ||
    step.step_type === "ability" ||
    step.step_type === "delegation"
  );
}

export function routineChildActivityKey(step: TaskStepProgress): string {
  const toolCallId = stepDataString(step, "tool_call_id");
  if (toolCallId) return `tool-call:${toolCallId}`;

  const callId = stepDataString(step, "call_id");
  if (callId) return `${step.step_type}:${callId}`;

  const toolIndex = step.data?.tool_index;
  if (typeof toolIndex === "number") {
    return `${step.step_type}:${step.step_name}:${toolIndex}`;
  }

  return `${step.step_type}:${step.step_name}`;
}

function routineStepForEvent(
  step: TaskStepProgress,
  routine: RoutineDetail | undefined,
): RoutineStep | undefined {
  if (!routine) return undefined;

  const stepId = stepDataString(step, "step_id");
  if (stepId) {
    const byId = routine.steps.find((candidate) => candidate.id === stepId);
    if (byId) return byId;
  }

  const stepSlug = stepDataString(step, "step_slug");
  if (stepSlug) {
    const bySlug = routine.steps.find((candidate) => candidate.slug === stepSlug);
    if (bySlug) return bySlug;
  }

  return routine.steps.find(
    (candidate) =>
      candidate.name === step.step_name && candidate.step_type === step.step_type,
  );
}

function routineOrderIndex(
  step: TaskStepProgress,
  routine: RoutineDetail | undefined,
): number | null {
  return routineStepForEvent(step, routine)?.order_index ?? null;
}

function routineParentAliases(
  step: TaskStepProgress,
  routine: RoutineDetail | undefined,
): string[] {
  const aliases = new Set<string>();

  const stepRunId = stepDataString(step, "step_run_id");
  if (stepRunId) aliases.add(`routine-run:${stepRunId}`);

  const stepId = stepDataString(step, "step_id");
  if (stepId) aliases.add(`routine:${stepId}`);

  const stepSlug = stepDataString(step, "step_slug");
  if (stepSlug) aliases.add(`routine-slug:${stepSlug}`);

  const routineStep = routineStepForEvent(step, routine);
  if (routineStep) {
    aliases.add(`routine:${routineStep.id}`);
    aliases.add(`routine-slug:${routineStep.slug}`);
    aliases.add(`${routineStep.step_type}:${routineStep.name}`);
    aliases.add(routineStep.name);
  }

  aliases.add(`${step.step_type}:${step.step_name}`);
  if (step.step_name) aliases.add(step.step_name);

  return Array.from(aliases);
}

function routineAttemptKey(
  step: TaskStepProgress,
  routine: RoutineDetail | undefined,
): string {
  const routineStep = routineStepForEvent(step, routine);
  if (routineStep) return `routine:${routineStep.id}`;

  const stepId = stepDataString(step, "step_id");
  if (stepId) return `routine:${stepId}`;

  const stepSlug = stepDataString(step, "step_slug");
  if (stepSlug) return `routine-slug:${stepSlug}`;

  return `${step.step_type}:${step.step_name}`;
}

export function routineStepIdentityKey(
  step: TaskStepProgress,
  routine?: RoutineDetail,
): string {
  if (isRoutineChildActivityStep(step)) return routineChildActivityKey(step);
  return routineParentAliases(step, routine)[0] ?? `${step.step_type}:${step.step_name}`;
}

function mergeStep(prev: TaskStepProgress, next: TaskStepProgress): TaskStepProgress {
  const prevPayload =
    typeof prev.payload === "object" && prev.payload !== null ? prev.payload : null;
  const nextPayload =
    typeof next.payload === "object" && next.payload !== null ? next.payload : null;

  const mergedData = { ...(prev.data ?? {}), ...(next.data ?? {}) };
  if (prev.data?.placeholder === true && next.data?.placeholder !== true) {
    delete mergedData.placeholder;
  }

  return {
    ...next,
    step_name: next.step_name || prev.step_name,
    step_type: next.step_type || prev.step_type,
    agent: next.agent ?? prev.agent,
    data: mergedData,
    payload:
      prevPayload || nextPayload
        ? { ...(prevPayload ?? {}), ...(nextPayload ?? {}) }
        : next.payload ?? prev.payload,
    encrypted_payload: next.encrypted_payload ?? prev.encrypted_payload,
  };
}

function stepCreatedTime(step: TaskStepProgress): number {
  const time = step.created_at ? new Date(step.created_at).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function isWorktreeStep(step: TaskStepProgress): boolean {
  return step.step_type === "worktree" || step.step_name.startsWith("worktree_");
}

function implicitRoutineParent(
  child: TaskStepProgress,
  routine: RoutineDetail | undefined,
): TaskStepProgress | null {
  const stepRunId = stepDataString(child, "step_run_id");
  const stepId = stepDataString(child, "step_id");
  const stepSlug = stepDataString(child, "step_slug");
  const routineStep = routineStepForEvent(child, routine);

  if (!stepRunId && !stepId && !stepSlug && !routineStep) return null;

  return {
    ...child,
    step_name: routineStep?.name ?? stepSlug ?? child.agent?.agent_name ?? child.step_name,
    step_type: routineStep?.step_type ?? "agent",
    event_type: routineIsCompletedStep(child) ? "step_started" : child.event_type,
    status: child.status === "passed" ? "running" : child.status,
    duration_ms: null,
    data: {
      ...(stepId ? { step_id: stepId } : {}),
      ...(stepSlug ? { step_slug: stepSlug } : {}),
      ...(stepRunId ? { step_run_id: stepRunId } : {}),
    },
    payload: null,
    encrypted_payload: null,
  };
}

function orderDisplaySteps(
  groups: RoutineDisplayStep[],
  routine: RoutineDetail | undefined,
): RoutineDisplayStep[] {
  const withIndex = groups.map((group, index) => ({ ...group, originalIndex: index }));
  const setup = withIndex.filter((group) => group.step.step_name === "worktree_setup");
  const cleanup = withIndex.filter((group) => group.step.step_name === "worktree_cleanup");
  const body = withIndex.filter(
    (group) =>
      group.step.step_name !== "worktree_setup" &&
      group.step.step_name !== "worktree_cleanup",
  );

  const actualGroups = body.filter((group) => !isPlaceholderStep(group.step));
  const projectedSortTime = (group: RoutineDisplayStep): number => {
    if (!isPlaceholderStep(group.step)) return stepCreatedTime(group.step);

    const order = routineOrderIndex(group.step, routine);
    if (order == null || actualGroups.length === 0) return order ?? 0;

    let previousTime: number | null = null;
    let nextTime: number | null = null;
    for (const actual of actualGroups) {
      const actualOrder = routineOrderIndex(actual.step, routine);
      const actualTime = stepCreatedTime(actual.step);
      if (actualOrder == null) continue;
      if (actualOrder < order && (previousTime == null || actualTime > previousTime)) {
        previousTime = actualTime;
      }
      if (actualOrder > order && (nextTime == null || actualTime < nextTime)) {
        nextTime = actualTime;
      }
    }

    if (previousTime != null && nextTime != null) {
      return previousTime + (nextTime - previousTime) / 2;
    }
    if (previousTime != null) return previousTime + (order + 1) / 1000;
    if (nextTime != null) return nextTime - (order + 1) / 1000;
    return order;
  };

  body.sort((a, b) => {
    const aOrder = routineOrderIndex(a.step, routine);
    const bOrder = routineOrderIndex(b.step, routine);
    if (aOrder != null && bOrder != null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    const aTime = projectedSortTime(a);
    const bTime = projectedSortTime(b);
    if (aTime !== bTime) return aTime - bTime;

    return a.originalIndex - b.originalIndex;
  });

  const ordered = [...setup, ...body, ...cleanup];
  const attemptCounts = new Map<string, number>();
  let previousRoutineOrder: number | null = null;
  let previousRoutineStepName: string | null = null;

  return ordered.map(({ originalIndex: _originalIndex, ...group }) => {
    if (isWorktreeStep(group.step) || isRoutineChildActivityStep(group.step)) {
      return group;
    }

    const aliases = routineParentAliases(group.step, routine);
    const key =
      aliases.find((alias) => alias.startsWith("routine:")) ??
      aliases.find((alias) => alias.startsWith("routine-slug:")) ??
      `${group.step.step_type}:${group.step.step_name}`;
    const attempt = (attemptCounts.get(key) ?? 0) + 1;
    attemptCounts.set(key, attempt);

    let attemptLabel: string | undefined = group.attemptLabel;
    const currentOrder = routineOrderIndex(group.step, routine);
    if (attempt > 1) {
      attemptLabel = `loopback attempt ${attempt}`;
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

function displayableRoutineSteps(routine: RoutineDetail | undefined): RoutineStep[] {
  return (
    routine?.steps
      .filter((step) => step.step_type !== "terminal" && step.step_type !== "terminal_fail")
      .sort((a, b) => a.order_index - b.order_index) ?? []
  );
}

function placeholderStep(
  step_name: string,
  step_type: string,
  data: Record<string, unknown>,
): TaskStepProgress {
  return {
    step_name,
    step_type,
    status: "pending",
    event_type: "pending",
    started_at: null,
    completed_at: null,
    duration_ms: null,
    data: { placeholder: true, ...data },
    payload: null,
    encrypted_payload: null,
    agent: null,
  };
}

function routinePlaceholderSteps(
  routine: RoutineDetail | undefined,
  options: RoutineDisplayOptions,
): TaskStepProgress[] {
  const placeholders = displayableRoutineSteps(routine).map((step) =>
    placeholderStep(step.name, step.step_type, {
      step_id: step.id,
      step_slug: step.slug,
    }),
  );

  if (options.includeWorktreePlaceholders) {
    return [
      placeholderStep("worktree_setup", "worktree", {}),
      ...placeholders,
      placeholderStep("worktree_cleanup", "worktree", {}),
    ];
  }

  return placeholders;
}

export function buildRoutineDisplaySteps(
  steps: TaskStepProgress[],
  routine?: RoutineDetail,
  options: RoutineDisplayOptions = {},
): RoutineDisplayStep[] {
  const groups: RoutineDisplayStep[] = [];
  const parentIndex = new Map<string, number>();
  let currentParentName: string | null = null;
  const includeRoutinePlaceholders = options.includeRoutinePlaceholders ?? true;
  const allSteps = includeRoutinePlaceholders
    ? [...routinePlaceholderSteps(routine, options), ...steps]
    : steps;
  const attemptRunsByKey = new Map<string, Set<string>>();
  let previousActualRoutineOrder: number | null = null;
  let previousActualRoutineStepName: string | null = null;

  const registerAliases = (index: number, step: TaskStepProgress) => {
    for (const alias of routineParentAliases(step, routine)) {
      parentIndex.set(alias, index);
    }
  };

  const recordAttempt = (index: number, step: TaskStepProgress) => {
    if (isPlaceholderStep(step) || isWorktreeStep(step)) return;
    const stepRunId = stepDataString(step, "step_run_id");
    if (!stepRunId) return;

    const key = routineAttemptKey(step, routine);
    const runs = attemptRunsByKey.get(key) ?? new Set<string>();
    const isNewRun = !runs.has(stepRunId);
    if (isNewRun) {
      runs.add(stepRunId);
      attemptRunsByKey.set(key, runs);

      if (runs.size > 1) {
        const currentOrder = routineOrderIndex(step, routine);
        const suffix =
          currentOrder != null &&
          previousActualRoutineOrder != null &&
          currentOrder <= previousActualRoutineOrder &&
          previousActualRoutineStepName
            ? ` after ${previousActualRoutineStepName}`
            : "";
        groups[index] = {
          ...groups[index],
          attemptLabel: `loopback attempt ${runs.size}${suffix}`,
        };
      }
    }

    const order = routineOrderIndex(step, routine);
    if (order != null) {
      previousActualRoutineOrder = order;
      previousActualRoutineStepName = step.step_name;
    }
  };

  const upsertParent = (step: TaskStepProgress): number => {
    const aliases = routineParentAliases(step, routine);
    const stepRunAlias = aliases.find((alias) => alias.startsWith("routine-run:"));
    const exactRunIndex = stepRunAlias ? parentIndex.get(stepRunAlias) : undefined;
    const existingIndex =
      exactRunIndex ??
      aliases
        .map((alias) => parentIndex.get(alias))
        .find((index): index is number => index != null);

    if (existingIndex != null) {
      const merged = mergeStep(groups[existingIndex].step, step);
      groups[existingIndex] = {
        ...groups[existingIndex],
        step: merged,
      };
      registerAliases(existingIndex, merged);
      recordAttempt(existingIndex, step);
      return existingIndex;
    }

    const nextIndex = groups.length;
    groups.push({ step, children: [] });
    registerAliases(nextIndex, step);
    recordAttempt(nextIndex, step);
    return nextIndex;
  };

  const upsertChild = (groupIndex: number, step: TaskStepProgress) => {
    const toolNames = Array.isArray(step.data?.tool_names)
      ? step.data.tool_names.filter((value): value is string => typeof value === "string")
      : [step.step_name];
    const toolCallIds = Array.isArray(step.data?.tool_call_ids)
      ? step.data.tool_call_ids
      : [];
    const toolArgs = Array.isArray(step.data?.tool_args) ? step.data.tool_args : [];

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
          tool_args: toolArgs[toolIndex] ?? step.data?.tool_args,
        },
      };
      const childKey = routineChildActivityKey(childStep);
      const existingChildIndex = groups[groupIndex].children.findIndex(
        (child) => routineChildActivityKey(child) === childKey,
      );

      if (existingChildIndex >= 0) {
        groups[groupIndex].children[existingChildIndex] = mergeStep(
          groups[groupIndex].children[existingChildIndex],
          childStep,
        );
      } else {
        groups[groupIndex].children.push(childStep);
      }
    }
  };

  for (const rawStep of allSteps) {
    if (isRoutineChildActivityStep(rawStep)) continue;
    upsertParent(rawStep);
    currentParentName = rawStep.step_name;
  }

  currentParentName = null;

  for (const rawStep of allSteps) {
    if (!isRoutineChildActivityStep(rawStep)) {
      currentParentName = rawStep.step_name;
      continue;
    }

    const parentGroupIndex = routineParentAliases(rawStep, routine)
      .map((alias) => parentIndex.get(alias))
      .find((index): index is number => index != null);

    if (parentGroupIndex != null && groups[parentGroupIndex].step.step_type !== "tool") {
      if (isPlaceholderStep(groups[parentGroupIndex].step)) {
        const implicitParent = implicitRoutineParent(rawStep, routine);
        if (implicitParent) {
          const merged = mergeStep(groups[parentGroupIndex].step, implicitParent);
          groups[parentGroupIndex] = {
            ...groups[parentGroupIndex],
            step: merged,
          };
          registerAliases(parentGroupIndex, merged);
        }
      }
      upsertChild(parentGroupIndex, rawStep);
      continue;
    }

    const implicitParent = implicitRoutineParent(rawStep, routine);
    if (implicitParent) {
      const implicitParentIndex = upsertParent(implicitParent);
      upsertChild(implicitParentIndex, rawStep);
      continue;
    }

    const currentParentGroupIndex =
      currentParentName != null ? parentIndex.get(currentParentName) : undefined;
    if (
      currentParentGroupIndex != null &&
      groups[currentParentGroupIndex].step.step_type !== "tool"
    ) {
      upsertChild(currentParentGroupIndex, rawStep);
      continue;
    }

    upsertParent(rawStep);
  }

  return orderDisplaySteps(groups, routine);
}

export function currentExecutionTaskStep(
  task: ExecutionTask,
  routine?: RoutineDetail,
): CurrentExecutionStepDisplay | null {
  if (taskIsTerminal(task)) return null;

  if (task.current_step) {
    return normalizeCurrentStep(task.current_step);
  }

  const displaySteps = buildRoutineDisplaySteps(task.steps ?? [], routine);
  const runningParent = [...displaySteps]
    .reverse()
    .map((group) => group.step)
    .find((step) => !isRoutineChildActivityStep(step) && isRunningDisplayStep(step));
  if (runningParent) {
    return normalizeCurrentStep(runningParent);
  }

  const latestRunningChild = [...(task.steps ?? [])]
    .reverse()
    .find((step) => isRoutineChildActivityStep(step) && isRunningDisplayStep(step));
  const projectedParent = latestRunningChild
    ? projectedParentFromChild(latestRunningChild)
    : null;
  if (projectedParent) return projectedParent;

  const latestNonTerminalParent = [...displaySteps]
    .reverse()
    .map((group) => group.step)
    .find(
      (step) =>
        !isPlaceholderStep(step) &&
        !isRoutineChildActivityStep(step) &&
        !routineIsCompletedStep(step),
    );
  if (latestNonTerminalParent) {
    return normalizeCurrentStep(latestNonTerminalParent);
  }

  return null;
}
