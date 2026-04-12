// ---------------------------------------------------------------------------
// Domain types — mirrors backend Rust structs
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  is_system: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PromptContextVariable {
  name: string;
  description: string;
  group: string;
}

export interface PromptContextVariableGroup {
  name: string;
  variables: PromptContextVariable[];
}

export type ExecutionStatus =
  | "pending"
  | "running"
  | "paused"
  | "cancelled"
  | "completed";

export type TaskStatus =
  | "open"
  | "ready"
  | "backlog"
  | "assigned"
  | "in_progress"
  | "done"
  | "failed";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskType = "bug" | "feature" | "task" | "improvement";

export interface TaskStatusCounts {
  ready: number;
  backlog: number;
  assigned: number;
  open: number;
  in_progress: number;
  done: number;
  failed: number;
  total: number;
}

export interface ExecutionRun {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  status: ExecutionStatus;
  config: Record<string, unknown>;
  model_count: number;
  parallel_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  routine_id: string | null;
  routine_name: string | null;
}

export interface ExecutionDetails extends ExecutionRun {
  task_counts: TaskStatusCounts;
  completion_percentage: number;
}

// ---------------------------------------------------------------------------
// Execution Tasks & Step Progress
// ---------------------------------------------------------------------------

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface StepAgent {
  agent_id: string;
  agent_name: string | null;
  agent_color: string | null;
}

export interface TaskStepProgress {
  step_name: string;
  step_type: string;
  status: StepStatus;
  event_type: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  data?: Record<string, unknown>;
  agent?: StepAgent | null;
}

export interface ExecutionTask {
  id: string | null;
  title: string;
  slug: string | null;
  status: TaskStatus;
  routine_id: string | null;
  steps: TaskStepProgress[];
  started_at: string | null;
  completed_at: string | null;
}

export interface ExecutionStepEvent {
  id: string;
  execution_run_id: string;
  task_id: string | null;
  event_type: string;
  step_name: string | null;
  step_type: string | null;
  data: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  project_id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  metadata: Record<string, unknown>;
  tags: string[];
  slug: string | null;
  complexity: number | null;
  routine_id: string | null;
  order_index: number;
  execution_run_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  assigned_to: string | null;
  assigned_agent_id: string | null;
}

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  complexity: number | null;
  order_index: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Routine Events (WebSocket)
// ---------------------------------------------------------------------------

export type RoutineEventType =
  | "phase_started"
  | "phase_completed"
  | "phase_failed"
  | "status_changed"
  | "retry_scheduled"
  | "routine_completed"
  | "routine_failed";

export type RoutinePhase = "implementation" | "review" | "testing";

export interface RoutineEvent {
  task_id: string;
  execution_run_id: string;
  event_type: RoutineEventType;
  phase: RoutinePhase | null;
  data: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Planner Chat
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "assistant";

export type MessageStatus = "sending" | "sent" | "delivered" | "failed" | "cancelled";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status?: MessageStatus;
  /** Server-generated UUID set when the backend confirms persistence. */
  persistedId?: string;
}

// Outbound: frontend → worker
export interface ChatMessageOutbound {
  type: "chat.message";
  id: string;           // client-generated message ID
  project_id: string;
  content: string;
  hidden?: boolean;
  routine_id?: string; // selected chat routine
  agent_id?: string;     // target agent
  domain_session_id?: string; // active domain session
  session_id: string;   // chat session
  timestamp: string;
}

export interface ChatStreamRequest {
  id: string;
  message: string;
  session_id: string;
  domain_session_id?: string;
  agent_id: string;
  project_id?: string;
}

export interface ChatDomainEnterOutbound {
  type: "chat.domain_enter";
  project_id: string;
  agent_id: string;
  domain_command: string;
  session_id: string;
}

export interface ChatCancelOutbound {
  type: "chat.cancel";
  project_id: string;
  agent_id?: string;
}

export interface ChatDomainExitOutbound {
  type: "chat.domain_exit";
  project_id: string;
  agent_id: string;
  domain_session_id: string;
}

export interface ChatCancelRequest {
  project_id: string;
  agent_id?: string;
  session_id?: string;
}

export interface ChatDomainEnterRequest {
  project_id: string;
  agent_id: string;
  domain_command: string;
  session_id: string;
}

export interface ChatDomainExitRequest {
  project_id: string;
  agent_id: string;
  domain_session_id: string;
}

export interface ChatSessionDeleteRequest {
  project_id: string;
  agent_id: string;
  session_id: string;
}

// Inbound: worker → frontend (wrapped in AgentEvent envelope)
export type ChatMessageInbound =
  | { type: "chat.response"; id: string; content: string; timestamp: string }
  | { type: "chat.response.chunk"; id: string; delta: string }
  | { type: "chat.error"; id: string; error: string; timestamp: string };

// Persisted chat message (from database)
export interface PersistedChatMessage {
  id: string;
  project_id: string | null;
  agent_id: string;
  user_id: string;
  sender: "user" | "assistant";
  content: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  metadata: NotificationMetadata | null;
}

export interface NotificationMetadata {
  severity?: "info" | "warning" | "action";
  link?: string;
  hidden?: boolean;
}

export interface ChatMessagePage {
  messages: PersistedChatMessage[];
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Chat Sessions
// ---------------------------------------------------------------------------

export interface ChatSession {
  id: string;
  project_id: string | null;
  agent_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  message_count: number;
  est_tokens: number;
  channel_type: "chat" | "notification";
  last_read_at: string | null;
}

export interface ChatSessionExtended extends ChatSession {
  project_name: string;
  agent_name: string;
  agent_display_name: string | null;
}

export interface UnreadCountEntry {
  agent_id: string;
  agent_name: string;
  agent_display_name: string | null;
  session_id: string;
  unread_count: number;
}

export interface UnreadSummary {
  total: number;
  by_agent: UnreadCountEntry[];
}

export interface PushConfigResponse {
  enabled: boolean;
  public_key: string | null;
}

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface ChatSessionExtended extends ChatSession {
  project_name: string;
  agent_name: string;
  agent_display_name: string | null;
}

// ---------------------------------------------------------------------------
// Repo Sync
// ---------------------------------------------------------------------------

export type RepoSyncStatus = "syncing" | "synced" | "error";

export interface ProjectRepoSettings {
  repo_url?: string;
  repo_sync_status?: RepoSyncStatus;
  repo_synced_at?: string;
  repo_sync_error?: string;
  target_branch?: string;
  source_branch?: string;
}

// ---------------------------------------------------------------------------
// API request / response helpers
// ---------------------------------------------------------------------------

export interface CreateProjectRequest {
  name: string;
  description?: string;
  repo_url?: string;
}

export interface GenerateTasksRequest {
  specification: string;
  web_links?: string[];
}

export interface GenerateTasksResponse {
  task_ids: string[];
  count: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  acceptance_criteria?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  complexity?: number;
  routine_id?: string | null;
  assigned_agent_id?: string | null;
}

export type ExecutionCommand = "start" | "pause" | "resume" | "cancel";

// ---------------------------------------------------------------------------
// Known Agent Names (behavioral identities)
// ---------------------------------------------------------------------------

export type KnownAgentName =
  | "coder"
  | "reviewer"
  | "tester"
  | "auditor"
  | "architect"
  | "planner"
  | "researcher";

export const KNOWN_AGENT_NAMES: KnownAgentName[] = [
  "coder",
  "reviewer",
  "tester",
  "auditor",
  "architect",
  "planner",
  "researcher",
];

export const KNOWN_AGENT_NAME_LABELS: Record<KnownAgentName, string> = {
  coder: "Coder",
  reviewer: "Reviewer",
  tester: "Tester",
  auditor: "Auditor",
  architect: "Architect",
  planner: "Planner",
  researcher: "Researcher",
};

export const KNOWN_AGENT_NAME_DESCRIPTIONS: Record<KnownAgentName, string> = {
  coder: "Writes and implements code",
  reviewer: "Checks code against acceptance criteria",
  tester: "Checks code quality",
  auditor: "Checks security",
  architect: "Creates requirements docs",
  planner: "Creates tasks from docs",
  researcher: "Researches topics and gathers information",
};

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "openrouter"
  | "ollama"
  | "groq"
  | "deepseek"
  | "minimax"
  | "openai-compatible";

export const MODEL_PROVIDERS: {
  id: ModelProvider;
  label: string;
  models: string[];
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-5.4", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    models: [
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    models: [
      "gemini-3.1-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    models: [
      "grok-4-1-fast-reasoning",
      "grok-4-1-fast-non-reasoning",
      "grok-4-0709",
      "grok-code-fast-1",
      "grok-3",
      "grok-3-mini",
      "grok-2-vision-1212",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: [
      "openrouter/auto",
      // Top ranked models (reasoning, thinking, creativity, programming)
      "google/gemini-2.5-flash",
      "anthropic/claude-sonnet-4.5",
      "google/gemini-3-flash-preview",
      "google/gemini-2.0-flash-001",
      "x-ai/grok-code-fast-1",
      "deepseek/deepseek-v3.2",
      "google/gemini-2.5-flash-lite",
      "x-ai/grok-4.1-fast",
      "deepseek/deepseek-chat-v3-0324",
      "anthropic/claude-opus-4.5",
      "openai/gpt-oss-120b",
      "moonshotai/kimi-k2.5",
      "anthropic/claude-3.7-sonnet",
      "minimax/minimax-m2.1",
      "minimax/minimax-m2.5",
      "google/gemini-2.5-pro",
      "qwen/qwen3-coder",
      "anthropic/claude-sonnet-4",
      "x-ai/grok-4-fast",
      "deepseek/deepseek-r1",
      "anthropic/claude-opus-4.6",
      "openai/gpt-5-mini",
      "openai/gpt-5-codex",
      "qwen/qwen3-235b-a22b",
      "meta-llama/llama-3.3-70b-instruct",
      "mistralai/mistral-nemo",
    ],
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    models: ["llama3.1", "codellama", "mistral", "mixtral", "phi3", "qwen2.5-coder"],
  },
  {
    id: "groq",
    label: "Groq",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    models: ["minimax-m2.7", "minimax-m2.5", "minimax-m2.1", "MiniMax-Text-01"],
  },
  {
    id: "openai-compatible",
    label: "OpenAI Compatible",
    models: [],
  },
];

// ---------------------------------------------------------------------------
// Models (LLM instances — previously "Agents")
// ---------------------------------------------------------------------------

export interface Model {
  id: string;
  name: string;
  description: string | null;
  model: string;
  model_provider: string;
  temperature: number;
  tools: unknown[];
  tags: string[];
  base_url: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  last_assigned_at: string | null;
}

export interface CreateModelRequest {
  name: string;
  description?: string;
  model: string;
  model_provider: string;
  temperature?: number;
  tools?: unknown[];
  tags?: string[];
  base_url?: string;
  project_id?: string;
}

export interface UpdateModelRequest {
  name?: string;
  description?: string | null;
  model?: string;
  model_provider?: string;
  temperature?: number;
  tags?: string[];
  base_url?: string | null;
}

export interface ApiError {
  message: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Project Documents (stored in Garage object storage)
// ---------------------------------------------------------------------------

export interface ProjectDocument {
  id: string;
  project_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  user_id: string;
  scopes: string[];
  /** Worker capabilities this key grants. Empty = all capabilities. */
  capabilities: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** All valid worker capabilities. */
export const WORKER_CAPABILITIES = ["chat", "task", "cron", "manifest", "repo"] as const;
/** Capabilities that can only be held by one key per user. */
export const EXCLUSIVE_CAPABILITIES = ["chat", "cron"] as const;

// ---------------------------------------------------------------------------
// MCP Scopes
// ---------------------------------------------------------------------------

export const MCP_RESOURCE_SCOPES = [
  "agents:read", "agents:write",
  "projects:read", "projects:write",
  "routines:read", "routines:write",
  "mcp_servers:read", "mcp_servers:write",
  "chat:read", "chat:write",
  "models:read", "models:write",
] as const;

export type McpScope = typeof MCP_RESOURCE_SCOPES[number];

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

export interface McpServer {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  transport: "stdio" | "http";
  command: string | null;
  args: string[] | null;
  url: string | null;
  env_schema: McpEnvField[];
  icon: string | null;
  category: string | null;
  tags: string[] | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpEnvField {
  key: string;
  label: string;
  required: boolean;
}

export interface AgentMcpAssignment {
  id: string;
  agent_id: string;
  mcp_server_id: string;
  enabled: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Context Blocks
// ---------------------------------------------------------------------------

export interface ContextBlock {
  id: string;
  name: string;
  path: string;
  display_name: string | null;
  description: string | null;
  template: string;
  is_system: boolean;
  source_block_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContextBlockRequest {
  name: string;
  path?: string;
  display_name?: string;
  description?: string;
  template?: string;
}

export interface UpdateContextBlockRequest {
  name?: string;
  display_name?: string;
  description?: string;
  template?: string;
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export interface Ability {
  id: string;
  name: string;
  path: string;
  display_name: string | null;
  description: string | null;
  activation_condition: string;
  prompt: string;
  platform_scopes: string[];
  mcp_server_ids: string[];
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAbilityRequest {
  name: string;
  path?: string;
  display_name?: string;
  description?: string;
  activation_condition?: string;
  prompt?: string;
  platform_scopes?: string[];
  mcp_server_ids?: string[];
}

export interface UpdateAbilityRequest {
  display_name?: string;
  description?: string;
  activation_condition?: string;
  prompt?: string;
  platform_scopes?: string[];
  mcp_server_ids?: string[];
}

export interface AgentAbilityAssignment {
  id: string;
  agent_id: string;
  ability_id: string;
  enabled: boolean;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name: string;
  expires_at?: string | null;
  /** MCP resource scopes. Empty = full access. */
  scopes?: string[];
  /** Worker capabilities. Empty = all capabilities. */
  capabilities?: string[];
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  raw_key: string;
  scopes: string[];
  capabilities: string[];
  expires_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export type RoutineTrigger =
  | "task.ready"
  | "chat.message"
  | "cron";

export const ROUTINE_TRIGGERS: { id: RoutineTrigger; label: string }[] = [
  { id: "task.ready", label: "Task Ready" },
  { id: "chat.message", label: "Chat Message" },
  { id: "cron", label: "Cron / Scheduled" },
];

export type RoutineStepType = "agent" | "gate" | "terminal" | "terminal_fail" | "council" | "cron" | "lambda";

export const ROUTINE_STEP_TYPES: { id: RoutineStepType; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "council", label: "Council" },
  { id: "cron", label: "Cron" },
  { id: "gate", label: "Gate" },
  { id: "lambda", label: "Lambda" },
  { id: "terminal", label: "Terminal" },
  { id: "terminal_fail", label: "Terminal (Fail)" },
];

export type RoutineEdgeCondition =
  | "always"
  | "on_pass"
  | "on_fail"
  | "on_review_pass"
  | "on_review_fail";

export const ROUTINE_EDGE_CONDITIONS: { id: RoutineEdgeCondition; label: string }[] = [
  { id: "always", label: "Always" },
  { id: "on_pass", label: "On Pass" },
  { id: "on_fail", label: "On Fail" },
  { id: "on_review_pass", label: "On Review Pass" },
  { id: "on_review_fail", label: "On Review Fail" },
];

export interface Routine {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  trigger: string;
  is_active: boolean;
  is_default: boolean;
  max_retries: number;
  metadata: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RoutineStep {
  id: string;
  routine_id: string;
  name: string;
  step_type: RoutineStepType;
  model_id: string | null;
  council_id: string | null;
  agent_id: string | null;
  lambda_id: string | null;
  config: Record<string, unknown>;
  position_x: number; // i32 from backend
  position_y: number; // i32 from backend
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface RoutineEdge {
  id: string;
  routine_id: string;
  source_step_id: string;
  target_step_id: string;
  condition: RoutineEdgeCondition;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RoutineDetail extends Routine {
  steps: RoutineStep[];
  edges: RoutineEdge[];
}

export interface RoutineSummary {
  id: string;
  project_id: string | null;
  name: string;
  trigger: string;
  is_active: boolean;
  is_default: boolean;
  step_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoutineRequest {
  name: string;
  description?: string;
  project_id?: string | null;
  trigger?: RoutineTrigger;
  is_active?: boolean;
  max_retries?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateRoutineRequest {
  name?: string;
  description?: string;
  project_id?: string | null;
  trigger?: RoutineTrigger;
  is_active?: boolean;
  max_retries?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateStepRequest {
  name: string;
  step_type?: RoutineStepType;
  model_id?: string;
  council_id?: string;
  agent_id?: string;
  lambda_id?: string;
  config?: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
  order_index?: number;
}

export interface UpdateStepRequest {
  name?: string;
  step_type?: RoutineStepType;
  model_id?: string;
  council_id?: string;
  agent_id?: string | null;
  lambda_id?: string | null;
  config?: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
  order_index?: number;
}

export interface CreateEdgeRequest {
  source_step_id: string;
  target_step_id: string;
  condition?: RoutineEdgeCondition;
}

export interface SaveRoutineGraphStepRequest {
  client_ref: string;
  id?: string;
  name: string;
  step_type: RoutineStepType;
  model_id?: string;
  council_id?: string;
  agent_id?: string | null;
  lambda_id?: string | null;
  config?: Record<string, unknown>;
  position_x: number;
  position_y: number;
  order_index: number;
}

export interface SaveRoutineGraphEdgeRequest {
  source_ref: string;
  target_ref: string;
  condition?: RoutineEdgeCondition;
  metadata?: Record<string, unknown>;
}

export interface SaveRoutineGraphRequest extends UpdateRoutineRequest {
  entry_step_refs: string[];
  steps: SaveRoutineGraphStepRequest[];
  edges: SaveRoutineGraphEdgeRequest[];
}

export type DelegationStrategy = "dynamic" | "broadcast" | "decompose" | "round_robin" | "vote";

export const DELEGATION_STRATEGIES: {
  id: DelegationStrategy;
  label: string;
  description: string;
}[] = [
  {
    id: "dynamic",
    label: "Dynamic",
    description: "Leader freely decides which agents to delegate to at runtime using the delegate_to tool",
  },
  {
    id: "broadcast",
    label: "Broadcast",
    description: "Send the same prompt to all members, leader synthesizes",
  },
  {
    id: "decompose",
    label: "Decompose",
    description: "Leader breaks task into sub-tasks for each member",
  },
  {
    id: "round_robin",
    label: "Round Robin",
    description: "Members process sequentially, each building on previous output",
  },
  {
    id: "vote",
    label: "Vote",
    description: "All members respond independently, leader picks the best",
  },
];

// ---------------------------------------------------------------------------
// Agents (Behavioral Identities — previously "Agent Roles")
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  created_by: string | null;
  is_system: boolean;
  /** Prompt configuration (JSONB) */
  prompt_config: PromptConfig;
  color: string;
  created_at: string;
  updated_at: string;
  /** Links to the system template this agent was copied from (null for custom or system agents). */
  source_agent_id: string | null;
  /** Whether the prompt is locked (read-only). */
  prompt_locked: boolean;
  /** MCP platform scopes granted to this agent. */
  platform_scopes: string[];
  /** The model assigned directly to this agent. */
  model_id: string | null;
  heartbeat?: AgentHeartbeat | null;
}

export interface AgentHeartbeat {
  id: string;
  agent_id: string;
  interval: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  name: string;
  display_name?: string;
  description?: string;
  color?: string;
  model_id?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  display_name?: string;
  description?: string;
  color?: string;
  model_id?: string | null;
}

// ---------------------------------------------------------------------------
// Prompt Config (PROMPT-10)
// ---------------------------------------------------------------------------

/** Memory profile — guides what agents remember and how memory retrieval is prioritised. */
export interface MemoryProfile {
  core_focus: string[];
  project_focus: string[];
  shared_focus: string[];
}

/** Tool category for profile filtering. */
export type ToolCategory = "read" | "write" | "readwrite";

/** Metadata about a single tool from the registry. */
export interface ToolRegistryEntry {
  name: string;
  description: string;
  category: ToolCategory;
  /** "builtin" or "skill:<name>" */
  source: string;
}

/** Prompt configuration for an agent. */
export interface PromptConfig {
  /** The system prompt for this agent. */
  system_prompt: string;
  /** Developer prompt — sent as a separate `developer` message to OpenAI-spec models, combined with system prompt for others. */
  developer_prompt: string;
  /** Task-specific templates (task_task, gate_eval, cron_task, heartbeat_task). */
  templates: Record<string, string>;
  /** Memory profile — guides what agents remember and retrieval priorities. */
  memory_profile?: MemoryProfile;
}

/** Request to update prompt config. */
export interface UpdatePromptConfigRequest {
  prompt_config: PromptConfig;
}

/** Response for preview prompt — all variants in one response for client-side caching. */
export interface PreviewPromptResponse {
  /** The rendered system prompt. */
  system_prompt: string;
  /** The rendered developer prompt (context blocks injected). */
  developer_prompt: string;
  /** Pre-rendered user message per task type. */
  user_messages: Record<string, string>;
  /** Pre-rendered domain addons for assigned domains. */
  domains: PreviewDomain[];
  /** Pre-rendered ability prompts for assigned abilities. */
  abilities: PreviewAbility[];
}

export interface PreviewDomain {
  id: string;
  name: string;
  display_name: string;
  command: string;
  rendered_addon: string;
}

export interface PreviewAbility {
  id: string;
  name: string;
  display_name: string;
  rendered_prompt: string;
}

// ---------------------------------------------------------------------------
// Agent Summary (lightweight agent info for council detail responses)
// ---------------------------------------------------------------------------

export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  model_id: string | null;
  model_name: string | null;
}

// ---------------------------------------------------------------------------
// Council Types
// ---------------------------------------------------------------------------

export interface Council {
  id: string;
  name: string;
  description: string | null;
  leader_agent_id: string;
  delegation_strategy: DelegationStrategy;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CouncilMember {
  id: string;
  council_id: string;
  agent_id: string;
  priority: number;
  config: Record<string, unknown>;
  created_at: string;
  agent: AgentSummary;
}

export interface CouncilDetail extends Council {
  leader_agent: AgentSummary;
  members: CouncilMember[];
}

export interface CreateCouncilRequest {
  name: string;
  description?: string;
  leader_agent_id: string;
  delegation_strategy?: DelegationStrategy;
  config?: Record<string, unknown>;
  members?: { agent_id: string; priority?: number }[];
}

export interface UpdateCouncilRequest {
  name?: string;
  description?: string;
  delegation_strategy?: DelegationStrategy;
  config?: Record<string, unknown>;
}

export interface AddCouncilMemberRequest {
  agent_id: string;
  priority?: number;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Project Routine Assignments
// ---------------------------------------------------------------------------

export interface ProjectRoutineAssignment {
  id: string;
  project_id: string;
  routine_id: string;
  trigger_type: RoutineTrigger;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CreateProjectRoutineAssignmentRequest {
  project_id: string;
  routine_id: string;
  trigger_type: RoutineTrigger;
  config?: Record<string, unknown>;
}

export interface UpdateProjectRoutineAssignmentRequest {
  routine_id?: string;
  is_active?: boolean;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export interface Domain {
  id: string;
  name: string;
  path: string;
  display_name: string;
  description: string | null;
  command: string;
  manifest: DomainManifest;
  category: string | null;
  tags: string[];
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainManifest {
  schema_version: number;
  domain_type: string;
  prompt: DomainPromptConfig;
  tools: DomainToolConfig;
  artifact?: DomainArtifactConfig;
  session: DomainSessionConfig;
}

export interface DomainPromptConfig {
  system_addon?: string;
  guidelines: string[];
  entry_message?: string;
  exit_message?: string;
}

export interface DomainToolConfig {
  /** Platform scopes escalated when this domain is active (e.g. "routines:write"). */
  additional_scopes?: string[];
  /** External MCP server names to activate for this domain. */
  activate_mcp?: string[];
  /** Ability names to activate for this domain. */
  activate_abilities?: string[];
}

export interface DomainArtifactConfig {
  type: string;
  format: string;
  filename_template?: string;
  schema?: Record<string, unknown>;
  output_template?: string;
}

export interface DomainSessionConfig {
  max_turns: number;
  auto_save_interval: number;
  exit_commands: string[];
}

export interface AgentDomainAssignment {
  id: string;
  agent_id: string;
  domain_id: string;
  domain?: Domain;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DomainSession {
  id: string;
  project_id: string;
  agent_id: string;
  domain_id: string;
  user_id: string;
  status: "active" | "completed" | "cancelled";
  artifact_draft: Record<string, unknown>;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface DomainArtifact {
  id: string;
  session_id: string;
  document_id: string;
  artifact_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateDomainRequest {
  name: string;
  path?: string;
  display_name: string;
  description?: string;
  command: string;
  manifest?: DomainManifest;
  category?: string;
  tags?: string[];
}

export interface UpdateDomainRequest {
  name?: string;
  display_name?: string;
  description?: string;
  command?: string;
  manifest?: DomainManifest;
  category?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Lambdas
// ---------------------------------------------------------------------------

export type LambdaInterpreter = "auto" | "bash" | "sh" | "python3" | "node";

export const LAMBDA_INTERPRETERS: { id: LambdaInterpreter; label: string }[] = [
  { id: "auto", label: "Auto (shebang)" },
  { id: "bash", label: "Bash" },
  { id: "sh", label: "Shell (sh)" },
  { id: "python3", label: "Python 3" },
  { id: "node", label: "Node.js" },
];

export interface Lambda {
  id: string;
  name: string;
  description: string | null;
  path: string;
  body: string;
  interpreter: LambdaInterpreter;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLambdaRequest {
  name: string;
  description?: string;
  path: string;
  body: string;
  interpreter?: LambdaInterpreter;
}

export interface UpdateLambdaRequest {
  name?: string;
  description?: string;
  path?: string;
  body?: string;
  interpreter?: LambdaInterpreter;
}
