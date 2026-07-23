// ---------------------------------------------------------------------------
// Domain types — mirrors backend Rust structs
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  settings: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  scope_mode: "role_default" | "custom";
  scopes: string[];
}

export interface CurrentOrg {
  org_id: string;
  org_name: string;
  role: string;
  scopes: string[];
}

export interface OrgRoleScopeDefaults {
  role: string;
  scopes: string[];
}

export interface OrgScopeCatalog {
  scopes: string[];
  role_defaults: OrgRoleScopeDefaults[];
}

export type TokenUsageSource = "chat" | "task" | "routine";

export interface TokenUsageBreakdown {
  key: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface TokenUsageSummary {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  breakdown: TokenUsageBreakdown[];
}

export interface BootstrapStatus {
  has_recovery_bundle: boolean;
  trusted_device_count: number;
  requires_secure_workspace: boolean;
}

export interface OrgMember {
  user_id: string;
  is_owner: boolean;
  email: string;
  name: string;
  role: string;
  scope_mode: "role_default" | "custom";
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: string;
  scope_mode: "role_default" | "custom";
  scopes: string[];
  invited_by: string;
  expires_at: string;
  last_sent_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgInvitationPreview {
  org_id: string;
  org_name: string;
  org_slug: string;
  email: string;
  role: string;
  scope_mode: "role_default" | "custom";
  scopes: string[];
  expires_at: string;
  invited_by: string;
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
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskStatusCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

export interface ExecutionStatusCounts {
  pending: number;
  queued: number;
  running: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
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
  task_id: string | null;
  task_title: string | null;
}

export interface ExecutionDetails extends ExecutionRun {
  task_counts: ExecutionStatusCounts;
  completion_percentage: number;
}

// ---------------------------------------------------------------------------
// Execution Tasks & Step Progress
// ---------------------------------------------------------------------------

export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export interface StepAgent {
  agent: string;
  agent_name: string | null;
  agent_color: string | null;
}

export interface TaskStepProgress {
  step_name: string;
  step_type: string;
  status: StepStatus;
  event_type: string;
  created_at?: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown> | null;
  encrypted_payload?: EncryptedPayload | null;
  agent?: StepAgent | null;
}

export interface ExecutionTaskCurrentStep {
  step_name: string;
  step_type: string;
  status: StepStatus;
  event_type: string;
  created_at: string;
  agent?: StepAgent | null;
}

export interface ExecutionTask {
  id: string | null;
  title: string;
  slug: string;
  status: ExecutionStatus;
  routine_id: string | null;
  current_step?: ExecutionTaskCurrentStep | null;
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
  payload?: Record<string, unknown> | null;
  encrypted_payload?: EncryptedPayload | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ExecutionTraceRoutineStep {
  step_slug: string;
  step_run_id: string;
  step_name?: string;
  step_type?: string;
}

export interface ExecutionTraceEvent {
  id: string;
  org_id: string;
  execution_run_id: string;
  task_id: string | null;
  event_type: string;
  event: Record<string, unknown>;
  routine_step?: ExecutionTraceRoutineStep | null;
  created_at: string;
  sequence: number;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  org_id: string;
  task_number: number;
  identifier: string;
  project_id: string | null;
  project_slug: string | null;
  external_id: string | null;
  title: string;
  instructions: string | null;
  status: TaskWorkflowStatus;
  priority: TaskPriority;
  metadata: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  labels: TaskLabel[];
  slug: string;
  assignee_user_id: string | null;
  execution_target: TaskExecutionTarget | null;
  dispatch: TaskDispatch;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface TaskWorkflowStatus {
  id: string;
  org_id: string;
  name: string;
  category: TaskStatusCategory;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskLabel {
  id: string;
  org_id: string;
  name: string;
  normalized_name: string;
  color: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskExecutionTarget =
  | { type: "agent"; id: string }
  | { type: "routine"; id: string };

export type TaskDispatch =
  | { mode: "manual" }
  | { mode: "scheduled"; state: "queued" | "paused" | "running" };

export interface TaskExecutionRun {
  id: string;
  org_id: string;
  task_id: string | null;
  schedule_id: string | null;
  parent_execution_run_id: string | null;
  trigger: "manual" | "schedule" | "retry" | null;
  project_id: string | null;
  agent_id: string | null;
  routine_id: string | null;
  status: ExecutionStatus;
  scheduled_for: string | null;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskSchedule {
  id: string;
  org_id: string;
  task_id: string;
  definition: TaskScheduleDefinition;
  occurrence_count: number;
  next_run_at: string;
  enabled: boolean;
  overlap_policy: "skip";
  misfire_policy: "run_once";
  last_run_at: string | null;
  authorized_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export type TaskScheduleIntervalUnit = "seconds" | "minutes" | "hours" | "days";
export type TaskScheduleWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type TaskScheduleRecurrence =
  | { frequency: "interval"; every: number; unit: TaskScheduleIntervalUnit }
  | { frequency: "daily"; interval: number }
  | { frequency: "weekly"; interval: number; weekdays: TaskScheduleWeekday[] }
  | { frequency: "monthly"; interval: number; day_of_month: number }
  | { frequency: "yearly"; interval: number; month: number; day: number }
  | { frequency: "cron"; expression: string };

export type TaskScheduleEnd =
  | { type: "never" }
  | { type: "on"; date: string }
  | { type: "after"; occurrences: number };

/** Canonical schedule returned by the platform. `starts_at` is UTC. */
export interface TaskScheduleDefinition {
  starts_at: string;
  timezone: string;
  recurrence: TaskScheduleRecurrence;
  end: TaskScheduleEnd;
}

/** Calendar wall-clock input sent to the platform for timezone resolution. */
export interface TaskScheduleDefinitionInput {
  starts_at: string;
  timezone: string;
  recurrence: TaskScheduleRecurrence;
  end: TaskScheduleEnd;
}

export interface TaskSchedulePreview {
  occurrences: string[];
}

export interface TaskAttachment {
  id: string;
  org_id: string;
  task_id: string;
  execution_run_id: string;
  kind: string;
  name: string;
  content_type: string;
  storage_kind: "database" | "s3";
  encrypted_payload: EncryptedPayload | null;
  size_bytes: number;
  content_digest: string;
  source_routine_id: string | null;
  source_step_slug: string | null;
  destination_step_slug: string | null;
  edge_condition: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

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

export type MessageStatus =
  | "sending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  command?: string;
  status?: MessageStatus;
  runTrace?: import("./agentRunTrace/types").RunTrace;
  runEnvelopeId?: string;
  /** Durable UUID used by the backend row, normally supplied by the worker. */
  persistedId?: string;
  /** Durable user-message UUID this assistant response answers. */
  replyToMessageId?: string;
}

// Outbound: frontend → worker
export interface ChatMessageOutbound {
  type: "chat.message";
  id: string; // client-generated message ID
  project_id: string;
  content: string;
  hidden?: boolean;
  routine_id?: string; // selected chat routine
  agent_id?: string; // target agent
  domain_session_id?: string; // active domain session
  session_id: string; // chat session
  timestamp: string;
}

export interface ChatStreamRequest {
  id: string;
  message: string;
  encrypted_message: EncryptedPayload;
  command?: string;
  session_id: string;
  domain_session_id?: string;
  domain_activation?: {
    domain_session_id: string;
    domain_command: string;
  };
  agent_id?: string;
  target_type?: "agent" | "council";
  target_id?: string;
  project_id?: string;
}

export interface ChatCommand {
  id: string;
  slug: string;
  name: string;
  path: string;
  command: string;
  description: string | null;
  content: string;
  encrypted_payload?: EncryptedPayload | null;
  content_decrypt_error?: string | null;
  entry_path: string;
  root_path: string;
  plugin_root_path: string | null;
  hooks: string[];
  source_type: "native" | "package";
  read_only: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConfigureChatCommandRequest {
  id?: string;
  slug?: string;
  name?: string;
  path?: string;
  command: string;
  description?: string;
  content: string;
}

export interface EncryptedPayload {
  account_id: string;
  encryption_scope?: "user" | "org" | null;
  object_id: string;
  object_type: string;
  algorithm: string;
  key_version: number;
  nonce: string;
  ciphertext: string;
}

export type VoiceInputJobStatus =
  | "uploaded"
  | "queued"
  | "transcribing"
  | "transcribed"
  | "agent_running"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export interface VoiceInputJob {
  id: string;
  org_id: string;
  user_id: string;
  chat_session_id: string;
  agent_id: string;
  worker_id: string | null;
  object_key: string;
  content_type: string;
  byte_size: number;
  encryption_metadata: Record<string, unknown>;
  status: VoiceInputJobStatus;
  transcript_message_id: string | null;
  agent_run_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  metadata: Record<string, unknown>;
}

export interface VoiceInputJobResponse {
  job: VoiceInputJob;
}

export interface WorkerStatus {
  worker_connected: boolean;
  workers?: Array<{
    api_key_id: string;
    connected: boolean;
    capabilities: string[];
    metadata?: WorkerHarnessMetadata | null;
    version?: string | null;
  }>;
}

export interface WorkerHarnessMetadata {
  name?: string | null;
  labels?: string[] | null;
  version?: string | null;
  host?: string | null;
}

export interface WorkerEnrollmentRequest {
  api_key_id: string;
  requested_at: string;
  crypto_version: number;
  enc_public_key: string;
  sign_public_key: string;
  verification_code: string;
  metadata?: WorkerHarnessMetadata | null;
}

export interface WorkerApprovalKeyResponse {
  public_key?: string | null;
}

export interface RecoveryBundlePayload {
  version: number;
  kdf: string;
  iterations: number;
  salt: string;
  nonce: string;
  ciphertext: string;
  created_at: string;
}

export interface RecoveryBundleResponse {
  recovery_bundle?: RecoveryBundlePayload | null;
}

export interface TrustedDevicePayload {
  device_id: string;
  device_label?: string | null;
  enc_public_key: string;
  sign_public_key: string;
  wrapped_ack: WrappedAccountContentKey;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DeviceEnrollmentPayload {
  device_id: string;
  device_label?: string | null;
  enc_public_key: string;
  verification_code: string;
  state: "pending" | "active" | "revoked";
  wrapped_ack?: WrappedAccountContentKey | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ApproveDeviceEnrollmentRequest {
  wrapped_ack: WrappedAccountContentKey;
  verification_code: string;
}

export interface WorkerCertificate {
  account_id: string;
  api_key_id: string;
  issued_at: string;
  enc_public_key: string;
  sign_public_key: string;
  signature: string;
}

export interface WrappedAccountContentKey {
  key_version: number;
  algorithm: string;
  ephemeral_public_key: string;
  nonce: string;
  ciphertext: string;
  created_at: string;
}

export interface WrappedOrgContentKey {
  key_version: number;
  algorithm: string;
  ephemeral_public_key?: string | null;
  nonce: string;
  ciphertext: string;
  created_at: string;
}

export interface CurrentOrgContentKeyStatus {
  org_id: string;
  key_version: number;
  has_user_recovery_access: boolean;
}

export interface CurrentOrgContentKeyRecovery {
  org_id: string;
  key_version: number;
  recovery_wrapped_ock?: WrappedOrgContentKey | null;
}

export interface OrgContentKeyAccessRequest {
  id: string;
  org_id: string;
  requester_user_id: string;
  requester_email: string;
  requester_name: string;
  requester_role: string;
  device_id: string;
  device_label?: string | null;
  enc_public_key: string;
  state: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgContentKeyAccessRequestStatus {
  id: string;
  org_id: string;
  requester_user_id: string;
  requester_role: string;
  device_id: string;
  device_label?: string | null;
  state: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  wrapped_ock?: WrappedOrgContentKey | null;
}

export interface BootstrapCurrentOrgContentKeyRequest {
  device_id: string;
  wrapped_ock: WrappedOrgContentKey;
  recovery_wrapped_ock: WrappedOrgContentKey;
}

export interface UnlockCredential {
  id: string;
  credential_id: string;
  credential_type: string;
  transports: string[];
  aaguid?: string | null;
  backup_eligible?: boolean | null;
  backup_state?: boolean | null;
  sign_count: number;
  label?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export interface PasskeyOptions {
  user_id: string;
  user_name: string;
  user_display_name: string;
  existing_credential_ids: string[];
}

export interface RegisterPasskeyRequest {
  credential_id: string;
  public_key: Record<string, unknown>;
  credential_type: "public-key";
  transports: string[];
  aaguid?: string | null;
  backup_eligible?: boolean | null;
  backup_state?: boolean | null;
  sign_count?: number | null;
  label?: string | null;
  client_response: Record<string, unknown>;
}

export type WorkerEnrollmentState = "pending" | "active" | "revoked";

export interface WorkerEnrollmentStatusResponse {
  api_key_id: string;
  request: WorkerEnrollmentRequest;
  metadata?: WorkerHarnessMetadata | null;
  state: WorkerEnrollmentState;
  certificate?: WorkerCertificate | null;
  wrapped_ack?: WrappedAccountContentKey | null;
  wrapped_ock?: WrappedOrgContentKey | null;
}

export interface ApproveWorkerEnrollmentRequest {
  certificate: WorkerCertificate;
  wrapped_ack: WrappedAccountContentKey;
  wrapped_ock?: WrappedOrgContentKey | null;
}

export interface WorkerAccountKeyTarget {
  api_key_id: string;
  enc_public_key: string;
}

export interface ChatCancelOutbound {
  type: "chat.cancel";
  agent_id?: string;
  session_id?: string;
}

export interface ChatDomainExitOutbound {
  type: "chat.domain_exit";
  project_id?: string | null;
  agent_id: string;
  domain_session_id: string;
}

export interface ChatCancelRequest {
  agent_id?: string;
  session_id?: string;
}

export interface ChatDomainExitRequest {
  project_id?: string | null;
  agent_id: string;
  domain_session_id: string;
  chat_session_id?: string | null;
}

export interface ChatSessionDeleteRequest {
  project_id?: string | null;
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
  reply_to_message_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  user_id: string;
  sender: "user" | "assistant";
  content: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  metadata: NotificationMetadata | null;
  encrypted_payload?: EncryptedPayload | null;
}

export interface NotificationMetadata {
  severity?: "info" | "warning" | "action";
  link?: string;
  hidden?: boolean;
  command?: string;
  source_session_id?: string;
  recipient_user_id?: string | null;
  recipient_handle?: string | null;
  encrypted_payload?: EncryptedPayload;
}

export interface ChatMessagePage {
  messages: PersistedChatMessage[];
  has_more: boolean;
}

export interface QuotaUsageLimit {
  used_bytes: number;
  limit_bytes: number;
}

export interface QuotaResourceCount {
  count: number;
  limit: number;
}

export interface QuotaStatus {
  tier: string;
  storage: {
    s3: QuotaUsageLimit;
    db: QuotaUsageLimit;
  };
  resources: {
    members: QuotaResourceCount;
    runtimes: QuotaResourceCount;
    agents: QuotaResourceCount;
    routines: QuotaResourceCount;
    projects: QuotaResourceCount;
    models: QuotaResourceCount;
    mcp_servers: QuotaResourceCount;
  };
  retention: {
    chat_messages: number;
    notifications: number;
    activity_rows: number;
    execution_runs: number;
  };
}

// ---------------------------------------------------------------------------
// Chat Sessions
// ---------------------------------------------------------------------------

export interface ChatSession {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  target_type: "agent" | "council";
  target_agent_id: string | null;
  target_council_id: string | null;
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
  council_name: string | null;
  council_description: string | null;
}

export interface UnreadCountEntry {
  agent_id: string;
  agent_name: string;
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
  slug: string;
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
  instructions?: string;
  status_id?: string;
  priority?: TaskPriority;
  project_id?: string | null;
  assignee_user_id?: string | null;
  execution_target?: TaskExecutionTarget | null;
  label_ids?: string[];
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
    models: [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini",
    ],
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
      "grok-4.3",
      "grok-4.3-latest",
      "grok-latest",
      "grok-build-0.1",
      "grok-code-fast-1",
      "grok-code-fast",
      "grok-4",
      "grok-4-latest",
      "grok-4-fast",
      "grok-4-fast-reasoning",
      "grok-4-fast-non-reasoning",
      "grok-4-1-fast",
      "grok-4-1-fast-reasoning",
      "grok-4-1-fast-non-reasoning",
      "grok-4-0709",
      "grok-3",
      "grok-3-latest",
      "grok-3-fast",
      "grok-3-mini",
      "grok-3-mini-fast",
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
    models: [
      "llama3.1",
      "codellama",
      "mistral",
      "mixtral",
      "phi3",
      "qwen2.5-coder",
    ],
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
  slug: string;
  name: string;
  description: string | null;
  model: string;
  model_provider: string;
  temperature: number;
  context_window?: number | null;
  tools: unknown[];
  tags: string[];
  base_url: string | null;
  native_tools?: NativeModelTool[];
  capabilities?: ModelCapability[];
  input_modalities?: ModelModality[];
  output_modalities?: ModelModality[];
  execution_modes?: ModelExecutionMode[];
  voice_options?: Record<string, unknown>;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  last_assigned_at: string | null;
}

export interface CreateModelRequest {
  slug: string;
  name: string;
  description?: string;
  model: string;
  model_provider: string;
  temperature?: number;
  context_window?: number;
  tools?: unknown[];
  tags?: string[];
  base_url?: string;
  native_tools?: NativeModelTool[];
  capabilities?: ModelCapability[];
  input_modalities?: ModelModality[];
  output_modalities?: ModelModality[];
  execution_modes?: ModelExecutionMode[];
  voice_options?: Record<string, unknown>;
  project_id?: string;
}

export interface UpdateModelRequest {
  name?: string;
  description?: string | null;
  model?: string;
  model_provider?: string;
  temperature?: number;
  context_window?: number | null;
  tags?: string[];
  base_url?: string | null;
  native_tools?: NativeModelTool[];
  capabilities?: ModelCapability[];
  input_modalities?: ModelModality[];
  output_modalities?: ModelModality[];
  execution_modes?: ModelExecutionMode[];
  voice_options?: Record<string, unknown>;
}

export type NativeModelTool = "web_search" | "x_search";

/** Assignable operation IDs on `models.capabilities`. */
export type ModelCapability =
  | "chat"
  | "transcribe_audio"
  | "generate_speech"
  | "generate_image"
  | "edit_image"
  | "generate_video"
  | "edit_video"
  | "image_to_video"
  | "reference_to_video"
  | "extend_video"
  | (string & {});

/** Read-only behavioral metadata returned by a provider catalog. */
export type ModelCatalogFeature =
  | "tool_calling"
  | "structured_outputs"
  | "reasoning"
  | (string & {});

export type ModelModality = "text" | "audio" | "image" | "file" | "video";

export type ModelExecutionMode =
  | "immediate"
  | "async_job"
  | "realtime_session";

export const NATIVE_MODEL_TOOL_LABELS: Record<NativeModelTool, string> = {
  web_search: "Web Search",
  x_search: "X Search",
};

/** Operations that may appear on models (includes chat). */
export const ASSIGNABLE_OPERATION_CAPABILITIES: Array<{
  id: ModelCapability;
  label: string;
}> = [
  { id: "chat", label: "Chat" },
  { id: "transcribe_audio", label: "Transcribe audio" },
  { id: "generate_speech", label: "Generate speech" },
  { id: "generate_image", label: "Generate image" },
  { id: "edit_image", label: "Edit image" },
  { id: "generate_video", label: "Generate video" },
  { id: "edit_video", label: "Edit video" },
  { id: "image_to_video", label: "Image to video" },
  { id: "reference_to_video", label: "Reference to video" },
  { id: "extend_video", label: "Extend video" },
];

/**
 * Non-chat assignable ops for resource model assignments / package requirements.
 * `chat` is primary conversation via `agents.model_id` only.
 */
export const ASSIGNMENT_CAPABILITIES: Array<{
  id: ModelCapability;
  label: string;
  kind: "image" | "video" | "audio";
}> = [
  { id: "generate_image", label: "Generate image", kind: "image" },
  { id: "edit_image", label: "Edit image", kind: "image" },
  { id: "generate_video", label: "Generate video", kind: "video" },
  { id: "edit_video", label: "Edit video", kind: "video" },
  { id: "image_to_video", label: "Image to video", kind: "video" },
  { id: "reference_to_video", label: "Reference to video", kind: "video" },
  { id: "extend_video", label: "Extend video", kind: "video" },
  { id: "generate_speech", label: "Generate speech", kind: "audio" },
  { id: "transcribe_audio", label: "Transcribe audio", kind: "audio" },
];

/** Behavioral catalog features are separate from assignable operations. */
export const MODEL_CATALOG_FEATURES: Array<{
  id: ModelCatalogFeature;
  label: string;
}> = [
  { id: "tool_calling", label: "Tool calling" },
  { id: "structured_outputs", label: "Structured outputs" },
  { id: "reasoning", label: "Reasoning" },
];

export const MODEL_MODALITY_OPTIONS: ModelModality[] = [
  "text",
  "audio",
  "image",
  "file",
  "video",
];

const ASSIGNMENT_CAPABILITY_IDS = new Set(
  ASSIGNMENT_CAPABILITIES.map((item) => item.id),
);

export function isAssignmentCapability(cap: string): boolean {
  return ASSIGNMENT_CAPABILITY_IDS.has(cap as ModelCapability);
}

export function modelCapabilityLabel(cap: string): string {
  return (
    ASSIGNABLE_OPERATION_CAPABILITIES.find((item) => item.id === cap)?.label ??
    ASSIGNMENT_CAPABILITIES.find((item) => item.id === cap)?.label ??
    cap
  );
}

export function modelCatalogFeatureLabel(feature: string): string {
  return MODEL_CATALOG_FEATURES.find((item) => item.id === feature)?.label ?? feature;
}

// ---------------------------------------------------------------------------
// Agent model capability assignments (non-chat ops)
// ---------------------------------------------------------------------------

export interface ModelAssignment {
  id: string;
  org_id?: string;
  agent_id: string;
  capability: string;
  model_id: string;
  assignment_source: "local" | "package" | string;
  package_install_id?: string | null;
  package_source_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelAssignmentInput {
  capability: string;
  model_id: string;
}

export interface ConfigureModelAssignmentsRequest {
  assignments: ModelAssignmentInput[];
}

export interface ModelAssignmentsResponse {
  assignments: ModelAssignment[];
}

// ---------------------------------------------------------------------------
// Provider model catalogs
// ---------------------------------------------------------------------------

export type ModelCatalogProvider = "openrouter" | "xai";

export type ModelCatalogSource = "cache" | "upstream" | "static";

export interface ModelCatalogTopProvider {
  context_length?: number | null;
  max_completion_tokens?: number | null;
  is_moderated?: boolean | null;
}

export interface ModelCatalogModel {
  id: string;
  canonical_slug?: string | null;
  name: string;
  description?: string | null;
  created?: number | null;
  context_length?: number | null;
  input_modalities: string[];
  output_modalities: string[];
  modality?: string | null;
  tokenizer?: string | null;
  instruct_type?: string | null;
  capabilities: ModelCapability[];
  features: ModelCatalogFeature[];
  supported_parameters: string[];
  supported_voices: string[];
  pricing: Record<string, string>;
  free: boolean;
  top_provider?: ModelCatalogTopProvider | null;
  knowledge_cutoff?: string | null;
  expiration_date?: string | null;
  endpoints_path?: string | null;
  reasoning?: unknown;
  /** False when the catalog documents a provider model Nenjo cannot execute yet. */
  configurable?: boolean;
  unavailable_reason?: string | null;
}

export interface ModelCatalogResponse {
  provider: ModelCatalogProvider | string;
  source: ModelCatalogSource;
  fetched_at: string;
  total: number;
  filtered_total: number;
  models: ModelCatalogModel[];
}

export interface ModelCatalogQuery {
  search?: string;
  capability?: string | string[];
  feature?: string | string[];
  input_modality?: string | string[];
  output_modality?: string | string[];
  supported_parameter?: string | string[];
  free?: boolean;
}

// ---------------------------------------------------------------------------
// Native media provider configuration
// ---------------------------------------------------------------------------

export type NativeMediaCapability =
  | "generate_image"
  | "edit_image"
  | "generate_video"
  | "edit_video"
  | "image_to_video"
  | "reference_to_video"
  | "extend_video"
  | "generate_speech"
  | "transcribe_audio"
  | "realtime_voice_agent";

export type NativeMediaProvider = "openai" | "xai";

export interface NativeMediaCapabilityInfo {
  id: NativeMediaCapability;
  label: string;
  kind: "image" | "video" | "audio" | "voice";
}

export interface NativeMediaProviderInfo {
  id: NativeMediaProvider;
  label: string;
  models: string[];
  capabilities: NativeMediaCapability[];
  model_capabilities?: NativeMediaModelCapabilityInfo[];
}

export interface NativeMediaModelCapabilityInfo {
  model: string;
  capabilities: NativeMediaCapability[];
}

export interface MediaProviderConfig {
  id: string;
  name: string;
  slug: string;
  provider: NativeMediaProvider;
  model: string;
  capabilities: NativeMediaCapability[];
  order_index: number;
  metadata: Record<string, unknown>;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MediaConfig {
  version: string;
  providers: MediaProviderConfig[];
}

export type MediaProviderConfigInput = Omit<
  MediaProviderConfig,
  "id" | "order_index" | "metadata" | "created_by" | "created_at" | "updated_at"
> & {
  id?: string;
  metadata?: Record<string, unknown>;
};

export interface ConfigureMediaProvidersRequest {
  providers: MediaProviderConfigInput[];
}

export interface MediaRequirementInput {
  capability: NativeMediaCapability;
  provider?: NativeMediaProvider | null;
  model?: string | null;
}

export interface MediaAssignment {
  id: string;
  resource_id: string;
  capability: NativeMediaCapability;
  provider: NativeMediaProvider | null;
  model: string | null;
  assignment_source: "local" | "package" | string;
  package_install_id?: string | null;
  package_source_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigureMediaAssignmentsRequest {
  media: MediaRequirementInput[];
}

export interface MediaAssignmentsResponse {
  media: MediaAssignment[];
}

export interface MediaCapabilitiesResponse {
  capabilities: NativeMediaCapabilityInfo[];
  providers: NativeMediaProviderInfo[];
}

export const NATIVE_MEDIA_CAPABILITIES: NativeMediaCapabilityInfo[] = [
  { id: "generate_image", label: "Generate image", kind: "image" },
  { id: "edit_image", label: "Edit image", kind: "image" },
  { id: "generate_video", label: "Generate video", kind: "video" },
  { id: "edit_video", label: "Edit video", kind: "video" },
  { id: "image_to_video", label: "Image to video", kind: "video" },
  { id: "reference_to_video", label: "Reference to video", kind: "video" },
  { id: "extend_video", label: "Extend video", kind: "video" },
  { id: "generate_speech", label: "Generate speech", kind: "audio" },
  { id: "transcribe_audio", label: "Transcribe audio", kind: "audio" },
  { id: "realtime_voice_agent", label: "Realtime voice agent", kind: "voice" },
];

export const NATIVE_MEDIA_PROVIDERS: NativeMediaProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: [
      "gpt-image-1",
      "whisper-1",
      "gpt-4o-transcribe",
      "gpt-4o-mini-transcribe",
    ],
    capabilities: ["generate_image", "transcribe_audio"],
    model_capabilities: [
      {
        model: "gpt-image-1",
        capabilities: ["generate_image"],
      },
      {
        model: "whisper-1",
        capabilities: ["transcribe_audio"],
      },
      {
        model: "gpt-4o-transcribe",
        capabilities: ["transcribe_audio"],
      },
      {
        model: "gpt-4o-mini-transcribe",
        capabilities: ["transcribe_audio"],
      },
    ],
  },
  {
    id: "xai",
    label: "xAI",
    models: [
      "grok-imagine-image-quality",
      "grok-imagine-video",
    ],
    capabilities: [
      "generate_image",
      "edit_image",
      "generate_video",
      "edit_video",
      "image_to_video",
      "reference_to_video",
      "extend_video",
    ],
    model_capabilities: [
      {
        model: "grok-imagine-image-quality",
        capabilities: ["generate_image", "edit_image"],
      },
      {
        model: "grok-imagine-video",
        capabilities: [
          "generate_video",
          "edit_video",
          "image_to_video",
          "reference_to_video",
          "extend_video",
        ],
      },
    ],
  },
];

export interface ApiError {
  message: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Workspace Knowledge (stored in Garage object storage)
// ---------------------------------------------------------------------------

export interface KnowledgePack {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  source_type: "uploaded" | "github" | "package";
  read_only: boolean;
  is_system: boolean;
  metadata: Record<string, unknown>;
  selector: string | null;
  version: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallKnowledgePackRequest {
  name: string;
  slug?: string;
  description?: string | null;
  selector: string;
  source_type?: "github";
  metadata?: Record<string, unknown>;
}

export interface KnowledgeItem {
  id: string;
  org_id: string;
  pack_id: string;
  pack_slug?: string;
  slug: string;
  filename: string;
  path: string | null;
  title: string | null;
  kind: string | null;
  summary: string | null;
  tags: string[];
  content_type: string;
  created_at: string;
  updated_at: string;
  edges: KnowledgeItemEdge[];
}

export interface KnowledgeItemEdge {
  id: string;
  org_id: string;
  source_item_id: string;
  source_doc: string;
  target_item_id: string;
  target_doc: string;
  edge_type: KnowledgeItemEdgeType;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type KnowledgeItemEdgeType =
  | "part_of"
  | "defines"
  | "governs"
  | "classifies"
  | "references"
  | "depends_on"
  | "extends"
  | "related_to";

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

export interface ApiKeyCatalog {
  scopes: string[];
  capabilities: string[];
  exclusive_capabilities: string[];
}

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

export interface McpServer {
  id: string;
  slug: string;
  name: string;
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
  source_type: "native" | "plugin" | "package";
  read_only: boolean;
  metadata: Record<string, unknown>;
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
  org_id: string;
  slug: string;
  name: string;
  path: string;
  description: string | null;
  source_type?: string;
  read_only?: boolean;
  metadata?: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  template?: string;
}

export function isContextBlockLocked(block: Pick<ContextBlock, "read_only" | "source_type">): boolean {
  return Boolean(block.read_only || block.source_type === "package");
}

export interface CreateContextBlockRequest {
  slug: string;
  name: string;
  path?: string;
  description?: string;
  template?: string;
}

export interface UpdateContextBlockRequest {
  name?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export interface Ability {
  id: string;
  slug: string;
  name: string;
  path: string;
  description: string | null;
  activation_condition: string;
  prompt?: string;
  platform_scopes: string[];
  mcp_servers: string[];
  script_tools?: string[];
  is_system: boolean;
  source_type: "native" | "skill" | "package";
  read_only: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customized?: boolean;
  source_ability_id?: string | null;
}

export interface CreateAbilityRequest {
  slug: string;
  name: string;
  path?: string;
  description?: string;
  activation_condition?: string;
  prompt?: string;
  platform_scopes?: string[];
  mcp_servers?: string[];
  script_tools?: string[];
  source_type?: "native" | "skill" | "package";
  read_only?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InstallSkillRequest {
  name: string;
  path?: string;
  description?: string;
  activation_condition?: string;
  selector: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export type PackageSourceAdapter =
  | "nenjo_packages"
  | "claude_marketplace"
  | "codex_plugin";

export interface PackageSource {
  id: string;
  org_id: string;
  name: string;
  source_type: "registry" | "git" | "artifact" | "github";
  adapter: PackageSourceAdapter;
  metadata: Record<string, unknown>;
  status: "active" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageSourceRequest {
  name: string;
  source_type?: "registry" | "git" | "artifact" | "github";
  adapter?: PackageSourceAdapter;
  metadata?: Record<string, unknown>;
}

export interface UpdatePackageSourceRequest {
  name?: string;
  metadata?: Record<string, unknown>;
  status?: "active" | "archived";
}

export interface PackageInstall {
  id: string;
  org_id: string;
  package_source_id: string;
  root_path: string;
  root_type: string;
  root_resource_id: string | null;
  requested_ref: string;
  resolved_commit_sha: string;
  status: "installing" | "installed" | "failed" | "archived";
  current_lock_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageInstallResource {
  id: string;
  org_id: string;
  package_install_id: string;
  package_source_id: string;
  source_path: string;
  resource_type: string;
  resource_name: string;
  resource_id: string;
  resource_version: string | null;
  source_hash: string;
  install_state: "installed" | "skipped_customized" | "removed" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PackageInstallJob {
  id: string;
  org_id: string;
  package_install_id: string;
  operation: "install" | "update";
  status: "queued" | "running" | "succeeded" | "failed";
  ref_override: string | null;
  phase: string;
  progress_percent: number;
  error: string | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export type PackageArgumentScope = "org" | "user";
export type PackageArgumentValueType = "text" | "markdown" | "xml" | "json";

export interface PackageArgumentDefinition {
  package: string;
  package_version: string;
  name: string;
  selector: string;
  scope: PackageArgumentScope;
  type: PackageArgumentValueType;
  required?: boolean;
  default?: string | null;
  description?: string | null;
  sample?: string | null;
}

export interface PackageArgumentBinding {
  package: string;
  name: string;
  scope: PackageArgumentScope;
  value: string;
}

export interface UpdatePackageArgumentBindingsRequest {
  bindings: PackageArgumentBinding[];
}

export interface PackageInstallProgress {
  phase: string;
  progressPercent: number;
}

export interface PackageInstallDetail {
  install: PackageInstall;
  resources: PackageInstallResource[];
  lock: Record<string, unknown> | null;
  job: PackageInstallJob | null;
}

export interface PackageCatalogResponse {
  source: PackageSource;
  manifest: Record<string, unknown>;
}

export interface InstallPackageRequest {
  source_id: string;
  path: string;
  ref_?: string | null;
  argument_bindings?: PackageArgumentBinding[];
}

export interface UpdateAbilityRequest {
  name?: string;
  description?: string;
  activation_condition?: string;
  platform_scopes?: string[];
  mcp_servers?: string[];
  script_tools?: string[];
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

export type RoutineStepType =
  | "agent"
  | "gate"
  | "terminal"
  | "terminal_fail"
  | "council";

export const ROUTINE_STEP_TYPES: { id: RoutineStepType; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "council", label: "Council" },
  { id: "gate", label: "Gate" },
  { id: "terminal", label: "Terminal" },
  { id: "terminal_fail", label: "Terminal (Fail)" },
];

export type RoutineEdgeCondition = "always" | "on_pass" | "on_fail";

export const ROUTINE_EDGE_CONDITIONS: {
  id: RoutineEdgeCondition;
  label: string;
}[] = [
  { id: "always", label: "Always" },
  { id: "on_pass", label: "On Pass" },
  { id: "on_fail", label: "On Fail" },
];

export interface Routine {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  max_retries: number;
  metadata: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RoutineStep {
  id: string;
  routine_id: string;
  slug: string;
  name: string;
  step_type: RoutineStepType;
  council_id: string | null;
  agent_id: string | null;
  config: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
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
  source_step: string;
  target_step_id: string;
  target_step: string;
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
  is_active: boolean;
  is_default: boolean;
  step_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutineStepInstructionsPayload {
  instructions: string;
}

export interface CreateRoutineRequest {
  id?: string;
  name: string;
  description?: string | null;
  project_id?: string | null;
  is_active?: boolean;
  max_retries?: number;
  metadata?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
}

export interface UpdateRoutineRequest {
  name?: string;
  description?: string | null;
  project_id?: string | null;
  is_active?: boolean;
  max_retries?: number;
  metadata?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
}

export interface CreateStepRequest {
  id?: string;
  slug?: string;
  name: string;
  step_type?: RoutineStepType;
  council?: string;
  agent?: string;
  config?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  position_x?: number;
  position_y?: number;
  order_index?: number;
}

export interface UpdateStepRequest {
  slug?: string;
  name?: string;
  step_type?: RoutineStepType;
  council?: string;
  agent?: string | null;
  config?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  position_x?: number;
  position_y?: number;
  order_index?: number;
}

export interface CreateEdgeRequest {
  source_step: string;
  target_step: string;
  condition?: RoutineEdgeCondition;
}

export interface SaveRoutineGraphStepRequest {
  id?: string;
  slug: string;
  name: string;
  step_type: RoutineStepType;
  council?: string;
  agent?: string | null;
  config?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  position_x: number;
  position_y: number;
  order_index: number;
}

export interface SaveRoutineGraphEdgeRequest {
  source_step: string;
  target_step: string;
  condition?: RoutineEdgeCondition;
  metadata?: Record<string, unknown>;
}

export interface SaveRoutineGraphRequest extends UpdateRoutineRequest {
  entry_steps: string[];
  steps: SaveRoutineGraphStepRequest[];
  edges: SaveRoutineGraphEdgeRequest[];
}

export interface ConfigureRoutineMetadataRequest {
  name?: string;
  description?: string | null;
  project_id?: string | null;
  is_active?: boolean;
  max_retries?: number;
}

export interface ConfigureRoutineRequest {
  id?: string;
  routine?: string;
  metadata?: ConfigureRoutineMetadataRequest;
  runtime_metadata?: Record<string, unknown>;
  encrypted_payload?: EncryptedPayload | null;
  graph?: {
    entry_steps: string[];
    steps: SaveRoutineGraphStepRequest[];
    edges: SaveRoutineGraphEdgeRequest[];
  };
}

export type DelegationStrategy =
  | "dynamic"
  | "broadcast"
  | "decompose"
  | "round_robin"
  | "vote";

export const DELEGATION_STRATEGIES: {
  id: DelegationStrategy;
  label: string;
  description: string;
}[] = [
  {
    id: "dynamic",
    label: "Dynamic",
    description:
      "Leader freely decides which agents to delegate to at runtime using the delegate_to tool",
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
    description:
      "Members process sequentially, each building on previous output",
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
  slug?: string;
  name: string;
  description: string | null;
  created_by: string | null;
  is_system: boolean;
  /** Prompt configuration. Loaded separately from the prompt endpoint when needed. */
  prompt_config?: PromptConfig;
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
  model_name?: string | null;
  source_type: "native" | "package";
  read_only: boolean;
  metadata: Record<string, unknown>;
  domain_ids?: string[];
  mcp_servers?: string[];
  script_tools?: string[];
  abilities?: string[];
}

export interface PromptConfigResponse {
  prompt_config?: PromptConfig | null;
  encrypted_payload?: EncryptedPayload | null;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  color?: string;
  model_id?: string;
  platform_scopes?: string[];
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  color?: string;
  model_id?: string | null;
  platform_scopes?: string[];
  abilities?: string[];
  domains?: string[];
  mcp_servers?: string[];
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
  /** Task-specific templates keyed by Nenjo's accepted wire names:
   * `task`, `chat`, `gate`.
   */
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
  command: string;
  rendered_addon: string;
}

export interface PreviewAbility {
  id: string;
  name: string;
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
  slug: string;
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
  slug: string;
  name: string;
  description?: string;
  leader_agent: string;
  delegation_strategy?: DelegationStrategy;
  config?: Record<string, unknown>;
  members?: { agent: string; priority?: number; config?: Record<string, unknown> }[];
}

export interface UpdateCouncilRequest {
  name?: string;
  description?: string;
  delegation_strategy?: DelegationStrategy;
  config?: Record<string, unknown>;
}

export interface AddCouncilMemberRequest {
  agent: string;
  priority?: number;
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
  slug: string;
  name: string;
  path: string;
  description: string | null;
  command: string;
  manifest?: DomainManifest;
  category: string | null;
  tags: string[];
  is_system: boolean;
  source_type?: "native" | "package";
  read_only?: boolean;
  metadata?: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainManifest {
  prompt: DomainPromptConfig;
  platform_scopes?: string[];
  abilities?: string[];
  mcp_servers?: string[];
  script_tools?: string[];
  session?: DomainSessionConfig;
}

export interface DomainPromptConfig {
  developer_prompt_addon?: string;
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
  project_id: string | null;
  agent_id: string;
  domain_id: string;
  user_id: string;
  status: "active" | "completed" | "cancelled";
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDomainRequest {
  slug: string;
  name: string;
  path?: string;
  description?: string;
  command: string;
  manifest?: DomainManifest;
  category?: string;
  tags?: string[];
}

export interface UpdateDomainRequest {
  name?: string;
  description?: string;
  command?: string;
  category?: string;
  tags?: string[];
  platform_scopes?: string[];
  abilities?: string[];
  mcp_servers?: string[];
  script_tools?: string[];
}
