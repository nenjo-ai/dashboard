# Agent Run Lifecycle Display Plan

Status: Proposed
Last updated: 2026-06-13
Repo: `dashboard`
Related repos: `../nenjo`, `../platform`

## Goal

Revamp the chat run display so users can understand what an agent is doing during long async operations.

The dashboard should distinguish:

- model provider thinking
- assistant text streaming
- tool execution
- ability/subagent execution
- delegation
- hook execution
- completion, failure, cancellation, and pause states

The animated agent identicon should only animate while the model provider request is active. It should not spin for the whole prompt duration while tools or abilities are running.

The same reducer and display primitives should be reusable in:

- desktop chat
- mobile chat
- project execution run history
- routine execution history
- dashboard recent execution rows
- agent heartbeat execution history

## Current State

The chat UI is driven by:

- `lib/useChatController.ts`
  - `isTyping`
  - `activeTools`
  - `livePreview`
- `components/chat/ChatArea.tsx`
  - `TypingIndicator`
  - `ToolCallLine`
- execution history views
  - `components/dashboard/RecentExecutions.tsx`
  - `components/project/ExecutionPanel.tsx`
  - `components/routine/RoutineRunTab.tsx`
  - `app/dashboard/executions/page.tsx`
  - `components/project/MobileProjectDetail.tsx`
  - `components/agents/MobileAgentDetail.tsx`

Problems:

- `isTyping` represents every busy state, not just model thinking.
- Tool, ability, delegation, and hook previews are concatenated into `livePreview`.
- Ability invocation is displayed like a raw tool call instead of a semantic subagent operation.
- The parent agent identicon continues animating while local/worker tool execution is happening.
- Nested activity exists in the event stream but is flattened visually.
- Execution history has its own task/step display logic, so chat and execution views can diverge.

## UX Principles

1. The agent avatar animation means "waiting on model provider output."
2. Tool work should be structured, scannable, and stationary.
3. Ability use should be a first-class nested operation, not a raw `use_ability(...)` row.
4. Parent and ability/subagent interaction should be visually explicit.
5. Streaming assistant prose should be separate from operation traces.
6. Raw args, stdout, stderr, and encrypted previews should be available, but not forced into the main chat transcript.
7. Completed traces should collapse by default after the final answer, while active traces remain expanded.
8. The trace model should be view-agnostic so mobile and execution history use the same semantic spans.
9. Execution history should render recorded traces with the same ability/tool vocabulary as live chat.

## Target Experience

### Active parent turn

```text
Nenji                                      Thinking
Thinking                                  1.8s
```

The parent identicon animates only while the provider request is active.

### Active tool execution

```text
Nenji                                      Running tools
Tool: rg                                  Done
Tool: sed                                 Running
Tool: cargo test                          Queued
```

The parent identicon is stationary. Tool rows carry the motion/status.

### Active ability execution

```text
Nenji                                      Running ability

Ability: BuildAgent                       Running
Task from parent
"Build a first pass of the dashboard lifecycle trace..."

  BuildAgent                              Running
  Thinking                                0.9s
  Tool: rg                                Done
  Tool: apply_patch                       Done
  Tool: cargo test                        Running

Result to parent
"Implemented the reducer and updated the active trace UI..."
```

Collapsed:

```text
Ability: BuildAgent    Running    3 tools - 1 child turn - 12s
```

The ability title is the actual ability identity, for example `BuildAgent`, not `UseAbility(task=..., ability=...)`.

## Lifecycle Event Contract

The turn loop should emit explicit lifecycle events so the dashboard does not infer model state from tool events.

### Run events

```ts
type RunStarted = {
  event_type: "RunStarted";
  data: {
    run_id: string;
    session_id: string;
    parent_run_id?: string;
    agent_id?: string;
    agent_name?: string;
  };
};

type RunCompleted = {
  event_type: "RunCompleted";
  data: {
    run_id: string;
    session_id: string;
  };
};

type RunFailed = {
  event_type: "RunFailed";
  data: {
    run_id: string;
    session_id: string;
    message: string;
  };
};

type RunCancelled = {
  event_type: "RunCancelled";
  data: {
    run_id: string;
    session_id: string;
  };
};
```

### Model events

```ts
type ModelRequestStarted = {
  event_type: "ModelRequestStarted";
  data: {
    run_id: string;
    request_id: string;
    provider?: string;
    model?: string;
  };
};

type AssistantTextDelta = {
  event_type: "AssistantTextDelta";
  data: {
    run_id: string;
    request_id: string;
    delta: string;
  };
};

type ModelRequestCompleted = {
  event_type: "ModelRequestCompleted";
  data: {
    run_id: string;
    request_id: string;
  };
};
```

Rules:

- `ModelRequestStarted` sets phase to `thinking` and animates the agent identicon.
- `AssistantTextDelta` streams into the assistant message body, not the operation preview.
- `ModelRequestCompleted` stops the identicon animation unless another provider request starts.

### Tool events

```ts
type ToolCallStarted = {
  event_type: "ToolCallStarted";
  data: {
    run_id: string;
    call_id: string;
    parent_call_id?: string;
    tool_name: string;
    tool_args?: unknown;
    text_preview?: string;
  };
};

type ToolOutputDelta = {
  event_type: "ToolOutputDelta";
  data: {
    run_id: string;
    call_id: string;
    stream: "stdout" | "stderr" | "preview";
    delta: string;
  };
};

type ToolCallCompleted = {
  event_type: "ToolCallCompleted";
  data: {
    run_id: string;
    call_id: string;
    success: boolean;
    output_preview?: string;
    error_preview?: string;
  };
};
```

Rules:

- Tool execution sets phase to `executing_tools`.
- Parent identicon is stationary during tool execution.
- Tool args are summarized in the row and fully visible in details.

### Ability events

```ts
type AbilityCallStarted = {
  event_type: "AbilityCallStarted";
  data: {
    run_id: string;
    call_id: string;
    ability_name: string;
    ability_display_name?: string;
    tool_name: string;
    task_preview?: string;
  };
};

type AbilityChildEvent = {
  event_type: "AbilityChildEvent";
  data: {
    run_id: string;
    call_id: string;
    child_event: AgentLifecycleEvent;
  };
};

type AbilityResult = {
  event_type: "AbilityResult";
  data: {
    run_id: string;
    call_id: string;
    result_preview?: string;
  };
};

type AbilityCallCompleted = {
  event_type: "AbilityCallCompleted";
  data: {
    run_id: string;
    call_id: string;
    success: boolean;
  };
};
```

Rules:

- Ability execution sets the parent run phase to `running_ability`.
- The ability gets its own nested trace block.
- The ability block title is derived from `ability_display_name` or `ability_name`, not the raw tool signature.
- The parent task and child result are displayed as separate sections.
- Raw `use_ability` args are available in a details drawer.

Display name fallback:

```ts
displayName =
  event.ability_display_name ??
  event.ability_name ??
  args.ability ??
  args.name ??
  parseAbilityFromToolName(tool_name) ??
  "Ability";
```

### Delegation events

```ts
type DelegationStarted = {
  event_type: "DelegationStarted";
  data: {
    run_id: string;
    call_id: string;
    target_agent: string;
    task_preview?: string;
  };
};

type DelegationChildEvent = {
  event_type: "DelegationChildEvent";
  data: {
    run_id: string;
    call_id: string;
    child_event: AgentLifecycleEvent;
  };
};

type DelegationCompleted = {
  event_type: "DelegationCompleted";
  data: {
    run_id: string;
    call_id: string;
    success: boolean;
    result_preview?: string;
  };
};
```

Delegation uses the same nested trace structure as abilities, but the label is the target agent.

## Dashboard State Model

Replace the current busy-state trio as the primary rendering model:

```ts
isTyping: boolean;
activeTools: ToolEntry[];
livePreview?: string;
```

with:

```ts
type RunPhase =
  | "idle"
  | "queued"
  | "thinking"
  | "streaming"
  | "executing_tools"
  | "running_ability"
  | "delegating"
  | "running_hook"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

type RunTrace = {
  id: string;
  sessionId: string;
  source: "chat" | "execution" | "routine" | "heartbeat";
  executionRunId?: string;
  taskId?: string;
  phase: RunPhase;
  startedAt: string;
  completedAt?: string;
  spans: TraceSpan[];
};

type TraceStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type TraceSpan =
  | ModelSpan
  | ToolSpan
  | AbilitySpan
  | DelegationSpan
  | HookSpan
  | MessageSpan;
```

Ability span:

```ts
type AbilitySpan = {
  kind: "ability";
  id: string;
  status: TraceStatus;
  name: string;
  displayName: string;
  toolName: string;
  taskPreview?: string;
  resultPreview?: string;
  rawArgs?: unknown;
  children: TraceSpan[];
  startedAt: string;
  completedAt?: string;
};
```

Tool span:

```ts
type ToolSpan = {
  kind: "tool";
  id: string;
  status: TraceStatus;
  name: string;
  argsSummary?: string;
  rawArgs?: unknown;
  outputPreview?: string;
  errorPreview?: string;
  stdout?: string;
  stderr?: string;
  children?: TraceSpan[];
  startedAt: string;
  completedAt?: string;
};
```

## Shared Trace Package

The reducer and display types should live outside `components/chat` so all runtime surfaces can use them.

Suggested structure:

- `lib/agentRunTrace/types.ts`
- `lib/agentRunTrace/reducer.ts`
- `lib/agentRunTrace/adapters/chatStream.ts`
- `lib/agentRunTrace/adapters/executionHistory.ts`
- `components/agent-run-trace/AgentRunTrace.tsx`
- `components/agent-run-trace/TraceSpanRow.tsx`
- `components/agent-run-trace/AbilityTraceBlock.tsx`
- `components/agent-run-trace/ToolTraceRow.tsx`
- `components/agent-run-trace/TraceDetailsDrawer.tsx`

The chat hook should own live subscription state, but it should not own trace semantics. Execution history views should use the same reducer output shape.

## Execution History Adapter

Execution history currently loads:

- execution runs through `useExecutions`, `useRecentExecutions`, and `useAgentExecutions`
- execution tasks through `useExecutionTasks`
- realtime execution updates through `subscribeExecutionRealtime`

The plan should add an adapter that converts persisted execution tasks/steps and realtime execution events into `RunTrace`.

```ts
function executionTasksToRunTrace(
  execution: ExecutionDetails,
  tasks: ExecutionTask[],
): RunTrace;

function reduceExecutionRealtimeEvent(
  state: RunTrace,
  event: ExecutionRealtimeEvent,
): RunTrace;
```

Mapping rules:

- execution run becomes a `RunTrace` with `source: "execution"`, `executionRunId`, and run status.
- execution task becomes a top-level span or grouped child run, depending on the task type.
- execution steps become `ToolSpan`, `AbilitySpan`, `DelegationSpan`, `HookSpan`, or `MessageSpan`.
- existing step metadata should be used to recover semantic ability names when available.
- raw task/step payloads should be preserved in details, not row labels.

Execution-specific display:

- history rows default to collapsed summaries.
- expanding a run shows the same `AgentRunTrace` component in read-only mode.
- failed/cancelled execution traces expand the failed span by default.
- active/running execution traces can update through realtime events.

Required integration points:

- `components/dashboard/RecentExecutions.tsx`
- `components/project/ExecutionPanel.tsx`
- `components/routine/RoutineRunTab.tsx`
- `app/dashboard/executions/page.tsx`
- `components/project/MobileProjectDetail.tsx`
- `components/agents/MobileAgentDetail.tsx`

## Component Plan

### New components

- `AgentRunTrace`
  - top-level active/completed trace surface
  - owns phase label, elapsed time, and collapse behavior
  - supports `mode: "live" | "history"` and `density: "regular" | "compact"`
  - supports `viewport: "desktop" | "mobile"` or responsive CSS equivalent
- `TraceSpanRow`
  - generic span row with icon, status, label, duration, expand/collapse
- `AbilityTraceBlock`
  - semantic ability display
  - sections: task from parent, child activity, result to parent, details
- `ToolTraceRow`
  - tool name, summarized args, status, output/error preview, details
- `ModelThinkingRow`
  - small provider/model row
  - only row that triggers parent identicon animation
- `TraceDetailsDrawer`
  - raw args/output for debugging without polluting the main transcript
- `ExecutionRunTraceSummary`
  - compact summary for execution list/history rows
  - can expand into `AgentRunTrace` in history mode

### Components to replace or migrate

- Replace `TypingIndicator` with `AgentRunTrace`.
- Replace `ToolCallLine` with `ToolTraceRow`.
- Keep compatibility rendering for old `activeTools` until the new reducer is stable.
- Replace duplicated execution step displays incrementally with shared trace components.

### Mobile requirements

The same `AgentRunTrace` component should render in mobile chat and mobile execution views.

Mobile behavior:

- full-width trace surface
- no hover-only controls
- tap targets at least 40px
- raw details open as a bottom sheet or inline disclosure
- nested spans use indentation and compact labels without horizontal overflow
- long ability names and tool names truncate in headers but remain visible in details
- completed trace summaries fit inside mobile execution cards

Desktop behavior:

- chat trace width follows assistant bubble width
- execution history uses denser rows and expandable sections
- raw details can use a side drawer, popover, or inline disclosure

## Reducer Plan

Create a trace reducer near the internal `useChatController`:

```ts
function reduceRunTrace(
  state: RunTrace | undefined,
  event: AgentLifecycleEvent,
): RunTrace | undefined;
```

Responsibilities:

- create traces on `RunStarted`
- update phase from lifecycle events
- append assistant deltas to the assistant message, not `livePreview`
- create/update spans by `call_id`
- nest child spans under ability/delegation/tool parents
- complete/fail/cancel spans
- collapse completed traces after a short delay

The reducer should be pure and UI-independent. Hooks and components decide whether a trace is live, historical, compact, read-only, or interactive.

## Compatibility Adapter

The dashboard should support current stream events while the new backend lifecycle events roll out.

Current events:

- `ToolCalls`
- `ToolCompleted`
- `AbilityActivated`
- `AbilityCompleted`
- `DelegationStarted`
- `DelegationCompleted`
- `HookStarted`
- `HookCompleted`
- `Done`
- `Error`

Adapter rules:

- `AbilityActivated` becomes `AbilityCallStarted`.
- `AbilityCompleted` becomes `AbilityResult` plus `AbilityCallCompleted`.
- `ToolCalls` becomes one or more `ToolCallStarted`.
- `ToolCompleted` becomes `ToolCallCompleted`.
- `Done` becomes `RunCompleted`.
- `Error` becomes `RunFailed`.

Current events cannot identify exact provider thinking windows. Until `ModelRequestStarted` and `ModelRequestCompleted` exist, the dashboard should use a conservative fallback:

- animate immediately after user send
- stop animation when tool/ability/delegation/hook work starts
- resume animation only when a model lifecycle event or assistant text delta indicates provider output

## Implementation Phases

### Phase 1: Event contract in worker/platform

Repos:

- `../nenjo`
- `../platform` if API/event DTOs live there

Tasks:

- add lifecycle event types for run, model, tool, ability, delegation, and hook spans
- emit `ModelRequestStarted` before each provider request
- emit `ModelRequestCompleted` after provider response is received
- emit `AssistantTextDelta` for assistant prose
- include stable `run_id`, `call_id`, and `parent_call_id`
- include `ability_name` and `ability_display_name` on ability start
- preserve encrypted payload behavior for sensitive previews

Acceptance criteria:

- dashboard can tell when provider request is active without guessing
- ability display name is available without parsing raw tool args
- nested events can be associated with the correct parent span

### Phase 2: Dashboard trace reducer

Repo:

- `dashboard`

Tasks:

- define `RunTrace`, `TraceSpan`, and lifecycle event types
- add compatibility adapter for existing stream events
- add execution history adapter for `ExecutionDetails` and `ExecutionTask[]`
- update the public `useChat` hook to expose `activeRunTrace`
- keep `isTyping`, `activeTools`, and `livePreview` only as compatibility shims during migration
- stop appending ability/tool/delegation previews into one shared `livePreview`

Acceptance criteria:

- provider thinking, tool execution, and ability execution are distinct phases
- assistant text streams into assistant messages
- tool and ability previews are stored on their own spans
- persisted execution tasks can be converted into read-only traces
- reducer tests cover live chat events and execution-history conversion

### Phase 3: Active trace UI

Repo:

- `dashboard`

Tasks:

- implement `AgentRunTrace`
- render active phase label and elapsed time
- animate parent `RoleIdenticon` only for `thinking` or `streaming`
- render tools as stable rows
- render ability blocks with display names like `BuildAgent`
- render task/result sections separately from child activity
- add expand/collapse for raw details
- support desktop and mobile layouts
- expose compact/history modes for execution rows

Acceptance criteria:

- parent avatar does not spin while tools or abilities are running
- ability rows show semantic names, not `UseAbility(...)`
- nested ability work is readable without concatenated text
- no text overlaps in narrow mobile widths
- mobile chat uses the same trace data and display primitives as desktop chat

### Phase 4: Completed trace behavior

Repo:

- `dashboard`

Tasks:

- collapse completed traces by default after final answer appears
- keep failed/cancelled traces expanded
- add an "Activity" disclosure under completed assistant responses
- persist enough trace metadata for reload/resume if stream durability supports it
- use the same completed trace component inside execution history expansion

Acceptance criteria:

- final answer remains the main chat artifact
- completed operation detail is available without dominating the transcript
- failed runs preserve enough context to debug
- execution history and chat completed activity use the same span labels and status vocabulary

### Phase 5: Polish and observability

Repos:

- `dashboard`
- `../nenjo`
- `../platform`

Tasks:

- add duration timers for runs and spans
- add provider/model labels on thinking spans
- add stdout/stderr streaming in details
- add raw event drawer behind a debug affordance
- add tests for reducer event ordering and nested span updates
- add screenshot coverage for desktop chat, mobile chat, and execution history traces

Acceptance criteria:

- reducer handles out-of-order completion gracefully
- repeated tool names do not overwrite each other because `call_id` is stable
- long args/output are truncated in rows and readable in details
- execution history, routine history, and mobile execution cards remain readable with nested ability spans

## Open Questions

1. Should completed traces be persisted with chat messages, or remain ephemeral stream UI?
2. Should ability child events be embedded as `AbilityChildEvent`, or should child runs have independent `parent_run_id` and be joined client-side?
3. Do we need provider request token/cost metadata in `ModelRequestCompleted` for display later?
4. Should raw event debug UI be admin/development-only?
5. Should ability display names come from manifest metadata, backend lookup, or worker-side event enrichment?
6. Should execution history store canonical lifecycle events, or continue deriving traces from task/step records?
7. Should mobile execution history open expanded traces inline or in a dedicated details screen?

## Non-Goals

- Redesigning the entire chat page.
- Changing ability semantics.
- Displaying full sensitive prompts by default.
- Replacing encrypted payload handling.
- Adding a general distributed tracing backend.

## First Implementation Slice

The smallest useful slice:

1. Emit `ModelRequestStarted` and `ModelRequestCompleted`.
2. Emit `AbilityCallStarted` with `ability_name`, `ability_display_name`, and `task_preview`.
3. Add `activeRunTrace` in `useChat`.
4. Replace `TypingIndicator` with `AgentRunTrace` for active runs.
5. Render ability blocks with semantic titles and separated task/result sections.
6. Use the same `AgentRunTrace` in mobile chat.
7. Add the execution-history adapter and use it in one history surface first, likely `RecentExecutions`.

This slice fixes the biggest UX issue: the parent avatar only spins while thinking, and ability execution no longer appears as concatenated preview text.
