import type {
  Project,
  Task,
  ExecutionDetails,
  CreateProjectRequest,
  GenerateTasksRequest,
  GenerateTasksResponse,
  DependencyGraph,
  UpdateTaskRequest,
  ExecutionCommand,
  Model,
  CreateModelRequest,
  UpdateModelRequest,
  CouncilDetail,
  CreateCouncilRequest,
  UpdateCouncilRequest,
  CouncilMember,
  AddCouncilMemberRequest,
  AgentDefinition,
  CreateAgentRequest,
  UpdateAgentRequest,
  Domain,
  CreateDomainRequest,
  UpdateDomainRequest,
  AgentDomainAssignment,
  DomainSession,
  DomainArtifact,
  PersistedChatMessage,
  ChatMessagePage,
  ChatSession,
  PromptContextVariableGroup,
  Lambda,
  CreateLambdaRequest,
  UpdateLambdaRequest,
  ChatSessionExtended,
} from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_V1 = `${API_BASE}/api/v1`;
const FETCH_TIMEOUT_MS = 15000;

export const WS_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
    .replace(/^http/, "ws");

// ---------------------------------------------------------------------------
// Generic fetcher (used by SWR and direct calls)
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Optional global token getter — set this from a component that has access
 * to Clerk's `useAuth().getToken` so that all API calls automatically
 * include the Bearer token.
 *
 * Usage (e.g. in your dashboard layout):
 * ```ts
 * import { useAuth } from "@clerk/nextjs";
 * import { setAuthTokenGetter } from "@/lib/api";
 *
 * const { getToken } = useAuth();
 * useEffect(() => { setAuthTokenGetter(getToken); }, [getToken]);
 * ```
 */
let _getToken: (() => Promise<string | null>) | null = null;
let _tokenGetterReady: Promise<void> | null = null;
let _resolveTokenGetterReady: (() => void) | null = null;

function tokenGetterReadyPromise(): Promise<void> {
  if (_getToken) return Promise.resolve();
  if (!_tokenGetterReady) {
    _tokenGetterReady = new Promise<void>((resolve) => {
      _resolveTokenGetterReady = resolve;
    });
  }
  return _tokenGetterReady;
}

export function setAuthTokenGetter(
  getter: (() => Promise<string | null>) | null,
) {
  _getToken = getter;
  if (getter) {
    _resolveTokenGetterReady?.();
    _resolveTokenGetterReady = null;
    _tokenGetterReady = Promise.resolve();
  } else {
    _tokenGetterReady = null;
    _resolveTokenGetterReady = null;
  }
}

/**
 * Build headers with the Clerk session token attached (if available).
 * Accepts optional extra headers to merge in.
 */
async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  if (!_getToken) {
    await Promise.race([
      tokenGetterReadyPromise(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }

  if (_getToken) {
    const token = await _getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Authenticated fetch wrapper. Attaches the Clerk session token and
 * throws `ApiError` on non-2xx responses.
 */
async function authFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = await authHeaders();

  // If caller provided headers, merge them (caller wins on conflicts)
  if (init?.headers) {
    const extra =
      init.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : Array.isArray(init.headers)
          ? Object.fromEntries(init.headers)
          : init.headers;
    Object.assign(headers, extra);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(body, res.status);
  }

  return res;
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function projectsUrl(): string {
  return `${API_V1}/projects`;
}

export function projectUrl(id: string): string {
  return `${API_V1}/projects/${id}`;
}

export function systemProjectUrl(): string {
  return `${API_V1}/projects/system`;
}

export async function fetchSystemProject(): Promise<Project> {
  return fetcher<Project>(systemProjectUrl());
}

// ---- Prompt Context Variables -----------------------------------------------

export function promptContextVariablesUrl(): string {
  return `${API_V1}/prompt-context-variables`;
}

export async function fetchPromptContextVariables(): Promise<PromptContextVariableGroup[]> {
  return fetcher<PromptContextVariableGroup[]>(promptContextVariablesUrl());
}

export async function fetchProjects(): Promise<Project[]> {
  return fetcher<Project[]>(projectsUrl());
}

export async function fetchProject(id: string): Promise<Project> {
  return fetcher<Project>(projectUrl(id));
}

export async function createProject(
  data: CreateProjectRequest,
): Promise<Project> {
  const res = await authFetch(projectsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<Project>;
}

export async function deleteProject(id: string): Promise<void> {
  await authFetch(projectUrl(id), { method: "DELETE" });
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description" | "settings">>,
): Promise<Project> {
  const res = await authFetch(projectUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<Project>;
}

export async function deleteAllTasks(
  projectId: string,
): Promise<{ deleted: number }> {
  const res = await authFetch(`${API_V1}/projects/${projectId}/tasks`, {
    method: "DELETE",
  });
  return res.json() as Promise<{ deleted: number }>;
}

export async function syncRepo(
  projectId: string,
  repoUrl: string,
): Promise<{ status: string }> {
  const res = await authFetch(`${API_V1}/projects/${projectId}/sync-repo`, {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  return res.json() as Promise<{ status: string }>;
}

export async function disconnectRepo(projectId: string): Promise<void> {
  await authFetch(`${API_V1}/projects/${projectId}/disconnect-repo`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function tasksUrl(projectId: string, params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): string {
  const search = new URLSearchParams();
  search.set("project_id", projectId);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  return `${API_V1}/tasks?${search.toString()}`;
}

export function taskUrl(id: string): string {
  return `${API_V1}/tasks/${id}`;
}

export async function fetchTasks(
  projectId: string,
  status?: string,
): Promise<Task[]> {
  return fetcher<Task[]>(tasksUrl(projectId, { status }));
}

export async function createTask(
  data: { project_id: string; title: string; description?: string },
): Promise<Task> {
  const res = await authFetch(`${API_V1}/tasks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Task>;
}

export async function updateTask(
  id: string,
  data: UpdateTaskRequest,
): Promise<Task> {
  const res = await authFetch(taskUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Task>;
}

export async function deleteTask(id: string): Promise<void> {
  await authFetch(taskUrl(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Task Generation
// ---------------------------------------------------------------------------

export function generateTasksUrl(projectId: string): string {
  return `${API_V1}/projects/${projectId}/generate-tasks`;
}

export async function generateTasks(
  projectId: string,
  data: GenerateTasksRequest,
): Promise<GenerateTasksResponse> {
  const res = await authFetch(generateTasksUrl(projectId), {
    method: "POST",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<GenerateTasksResponse>;
}

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

export function dependencyGraphUrl(projectId: string): string {
  return `${API_V1}/projects/${projectId}/dependency-graph`;
}

export async function fetchDependencyGraph(
  projectId: string,
): Promise<DependencyGraph> {
  return fetcher<DependencyGraph>(dependencyGraphUrl(projectId));
}

// ---------------------------------------------------------------------------
// Task Dependencies
// ---------------------------------------------------------------------------

export async function addDependency(taskId: string, dependsOnId: string): Promise<void> {
  await authFetch(`${API_V1}/tasks/${taskId}/dependencies`, {
    method: "POST",
    body: JSON.stringify({ depends_on_id: dependsOnId }),
  });
}

export async function removeDependency(taskId: string, depId: string): Promise<void> {
  await authFetch(`${API_V1}/tasks/${taskId}/dependencies/${depId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

export function executionsUrl(params?: {
  project_id?: string;
  status?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  if (params?.project_id) search.set("project_id", params.project_id);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return `${API_V1}/executions${qs ? `?${qs}` : ""}`;
}

export function executionUrl(id: string): string {
  return `${API_V1}/executions/${id}`;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function activityUrl(params?: {
  project_id?: string;
  category?: string;
  resource_type?: string;
  before?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  if (params?.project_id) search.set("project_id", params.project_id);
  if (params?.category) search.set("category", params.category);
  if (params?.resource_type) search.set("resource_type", params.resource_type);
  if (params?.before) search.set("before", params.before);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return `${API_V1}/activity${qs ? `?${qs}` : ""}`;
}

export async function fetchExecutions(
  projectId?: string,
  limit?: number,
  status?: string,
): Promise<ExecutionDetails[]> {
  return fetcher<ExecutionDetails[]>(
    executionsUrl({ project_id: projectId, status, limit }),
  );
}

export async function createExecution(data: {
  project_id: string;
  parallel_count: number;
  config?: Record<string, unknown>;
}): Promise<ExecutionDetails> {
  const res = await authFetch(`${API_V1}/executions`, {
    method: "POST",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<ExecutionDetails>;
}

export function executionTasksUrl(executionId: string): string {
  return `${API_V1}/executions/${executionId}/tasks`;
}

export function executionEventsUrl(executionId: string): string {
  return `${API_V1}/executions/${executionId}/events`;
}

export async function fetchExecutionTasks(
  executionId: string,
): Promise<import("./types").ExecutionTask[]> {
  return fetcher<import("./types").ExecutionTask[]>(
    executionTasksUrl(executionId),
  );
}

export async function fetchExecutionEvents(
  executionId: string,
): Promise<import("./types").ExecutionStepEvent[]> {
  return fetcher<import("./types").ExecutionStepEvent[]>(
    executionEventsUrl(executionId),
  );
}

export async function sendExecutionCommand(
  executionId: string,
  command: ExecutionCommand,
): Promise<ExecutionDetails> {
  const res = await authFetch(`${API_V1}/executions/${executionId}/command`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });

  return res.json() as Promise<ExecutionDetails>;
}

// ---------------------------------------------------------------------------
// Models (LLM instances — previously "Agents")
// ---------------------------------------------------------------------------

export function modelsUrl(params?: {
  project_id?: string;
}): string {
  const search = new URLSearchParams();
  if (params?.project_id) search.set("project_id", params.project_id);
  const qs = search.toString();
  return `${API_V1}/models${qs ? `?${qs}` : ""}`;
}

export function modelUrl(id: string): string {
  return `${API_V1}/models/${id}`;
}

export async function fetchModels(projectId?: string): Promise<Model[]> {
  return fetcher<Model[]>(modelsUrl({ project_id: projectId }));
}

export async function fetchModel(id: string): Promise<Model> {
  return fetcher<Model>(modelUrl(id));
}

export async function createModel(data: CreateModelRequest): Promise<Model> {
  const res = await authFetch(modelsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<Model>;
}

export async function updateModel(
  id: string,
  data: UpdateModelRequest,
): Promise<Model> {
  const res = await authFetch(modelUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<Model>;
}

export async function deleteModel(id: string): Promise<void> {
  await authFetch(modelUrl(id), { method: "DELETE" });
}

export async function fetchAllTags(projectId?: string): Promise<string[]> {
  return fetcher<string[]>(
    `${API_V1}/models/tags${projectId ? `?project_id=${projectId}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Project Documents (Garage object storage)
// ---------------------------------------------------------------------------

export function projectDocumentsUrl(projectId: string): string {
  return `${API_V1}/projects/${projectId}/documents`;
}

export function projectDocumentUrl(projectId: string, docId: string): string {
  return `${API_V1}/projects/${projectId}/documents/${docId}`;
}

export async function fetchProjectDocuments(
  projectId: string,
): Promise<import("./types").ProjectDocument[]> {
  return fetcher(projectDocumentsUrl(projectId));
}

export async function uploadProjectDocument(
  projectId: string,
  file: File,
): Promise<import("./types").ProjectDocument> {
  const formData = new FormData();
  formData.append("file", file);

  // For file uploads, we need to let the browser set the Content-Type
  // (with boundary), so we override the default JSON content type.
  const headers = await authHeaders();
  delete headers["Content-Type"];

  const res = await fetch(projectDocumentsUrl(projectId), {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(body, res.status);
  }

  return res.json() as Promise<import("./types").ProjectDocument>;
}

export async function deleteProjectDocument(
  projectId: string,
  docId: string,
): Promise<void> {
  await authFetch(projectDocumentUrl(projectId, docId), {
    method: "DELETE",
  });
}

export function downloadProjectDocumentUrl(
  projectId: string,
  docId: string,
): string {
  return projectDocumentUrl(projectId, docId);
}

export function projectDocumentContentUrl(
  projectId: string,
  docId: string,
): string {
  return `${API_V1}/projects/${projectId}/documents/${docId}/content`;
}

export async function fetchDocumentContent(
  projectId: string,
  docId: string,
): Promise<{ content: string; filename: string; content_type: string; size_bytes: number }> {
  return fetcher(projectDocumentContentUrl(projectId, docId));
}

export async function updateDocumentContent(
  projectId: string,
  docId: string,
  content: string,
): Promise<import("./types").ProjectDocument> {
  const res = await authFetch(projectDocumentContentUrl(projectId, docId), {
    method: "PUT",
    body: JSON.stringify({ content }),
  });

  return res.json() as Promise<import("./types").ProjectDocument>;
}

// ---------------------------------------------------------------------------
// Auth / Current User
// ---------------------------------------------------------------------------

export function authMeUrl(): string {
  return `${API_V1}/auth/me`;
}

export async function fetchCurrentUser(): Promise<{
  user_id: string | null;
  clerk_id?: string;
  session_id?: string | null;
  org_id?: string | null;
  org_role?: string | null;
  onboarded?: boolean;
}> {
  return fetcher(authMeUrl());
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export function apiKeysUrl(): string {
  return `${API_V1}/api-keys`;
}

export function apiKeyUrl(id: string): string {
  return `${API_V1}/api-keys/${id}`;
}

export async function fetchApiKeys(): Promise<import("./types").ApiKey[]> {
  return fetcher(apiKeysUrl());
}

export async function createApiKey(
  data: import("./types").CreateApiKeyRequest,
): Promise<import("./types").CreateApiKeyResponse> {
  const res = await authFetch(apiKeysUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });

  return res.json() as Promise<import("./types").CreateApiKeyResponse>;
}

export async function deleteApiKey(id: string): Promise<void> {
  await authFetch(apiKeyUrl(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Worker Status
// ---------------------------------------------------------------------------

export function workerStatusUrl(): string {
  return `${API_V1}/workers/status`;
}

export function workerPingUrl(): string {
  return `${API_V1}/workers/ping`;
}

export async function fetchWorkerStatus(): Promise<{ worker_connected: boolean }> {
  return fetcher<{ worker_connected: boolean }>(workerStatusUrl());
}

export async function pingWorker(): Promise<{ worker_connected: boolean }> {
  const res = await authFetch(workerPingUrl(), { method: "POST" });
  return res.json() as Promise<{ worker_connected: boolean }>;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export function wsUrl(): string {
  return `${WS_BASE}/ws`;
}

/**
 * Retrieve the current Clerk JWT token (if set via `setAuthTokenGetter`).
 * Used by the chat WebSocket hook for the handshake.
 */
export async function getAuthToken(): Promise<string | null> {
  if (!_getToken) {
    await Promise.race([
      tokenGetterReadyPromise(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  if (!_getToken) return null;
  return _getToken();
}

// ---------------------------------------------------------------------------
// Routines (user-scoped, like councils)
// ---------------------------------------------------------------------------

export function routinesUrl(): string {
  return `${API_V1}/routines`;
}

export function routineUrl(routineId: string): string {
  return `${API_V1}/routines/${routineId}`;
}

export function routineStepsUrl(routineId: string): string {
  return `${API_V1}/routines/${routineId}/steps`;
}

export function routineStepUrl(routineId: string, stepId: string): string {
  return `${API_V1}/routines/${routineId}/steps/${stepId}`;
}

export function routineEdgesUrl(routineId: string): string {
  return `${API_V1}/routines/${routineId}/edges`;
}

export function routineEdgeUrl(routineId: string, edgeId: string): string {
  return `${API_V1}/routines/${routineId}/edges/${edgeId}`;
}

export async function fetchRoutines(): Promise<import("./types").RoutineSummary[]> {
  return fetcher(routinesUrl());
}

export async function fetchRoutine(
  routineId: string,
): Promise<import("./types").RoutineDetail> {
  return fetcher(routineUrl(routineId));
}

export async function createRoutine(
  data: import("./types").CreateRoutineRequest,
): Promise<import("./types").Routine> {
  const res = await authFetch(routinesUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRoutine(
  routineId: string,
  data: import("./types").UpdateRoutineRequest,
): Promise<import("./types").Routine> {
  const res = await authFetch(routineUrl(routineId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function saveRoutineGraph(
  routineId: string,
  data: import("./types").SaveRoutineGraphRequest,
): Promise<import("./types").RoutineDetail> {
  const res = await authFetch(`${routineUrl(routineId)}/graph`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteRoutine(
  routineId: string,
): Promise<void> {
  await authFetch(routineUrl(routineId), { method: "DELETE" });
}

export async function createRoutineStep(
  routineId: string,
  data: import("./types").CreateStepRequest,
): Promise<import("./types").RoutineStep> {
  const res = await authFetch(routineStepsUrl(routineId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRoutineStep(
  routineId: string,
  stepId: string,
  data: import("./types").UpdateStepRequest,
): Promise<import("./types").RoutineStep> {
  const res = await authFetch(routineStepUrl(routineId, stepId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteRoutineStep(
  routineId: string,
  stepId: string,
): Promise<void> {
  await authFetch(routineStepUrl(routineId, stepId), {
    method: "DELETE",
  });
}

export async function createRoutineEdge(
  routineId: string,
  data: import("./types").CreateEdgeRequest,
): Promise<import("./types").RoutineEdge> {
  const res = await authFetch(routineEdgesUrl(routineId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteRoutineEdge(
  routineId: string,
  edgeId: string,
): Promise<void> {
  await authFetch(routineEdgeUrl(routineId, edgeId), {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Councils
// ---------------------------------------------------------------------------

export function councilsUrl(): string {
  return `${API_V1}/councils`;
}

export function councilUrl(councilId: string): string {
  return `${API_V1}/councils/${councilId}`;
}

export function councilMembersUrl(councilId: string): string {
  return `${API_V1}/councils/${councilId}/members`;
}

export function councilMemberUrl(councilId: string, memberId: string): string {
  return `${API_V1}/councils/${councilId}/members/${memberId}`;
}

export async function fetchCouncils(): Promise<CouncilDetail[]> {
  return fetcher<CouncilDetail[]>(councilsUrl());
}

export async function fetchCouncil(councilId: string): Promise<CouncilDetail> {
  return fetcher<CouncilDetail>(councilUrl(councilId));
}

export async function createCouncil(
  data: CreateCouncilRequest,
): Promise<CouncilDetail> {
  const res = await authFetch(councilsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<CouncilDetail>;
}

export async function updateCouncil(
  councilId: string,
  data: UpdateCouncilRequest,
): Promise<CouncilDetail> {
  const res = await authFetch(councilUrl(councilId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<CouncilDetail>;
}

export async function deleteCouncil(councilId: string): Promise<void> {
  await authFetch(councilUrl(councilId), { method: "DELETE" });
}

export async function addCouncilMember(
  councilId: string,
  data: AddCouncilMemberRequest,
): Promise<CouncilMember> {
  const res = await authFetch(councilMembersUrl(councilId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<CouncilMember>;
}

export async function updateCouncilMember(
  councilId: string,
  memberId: string,
  data: Partial<AddCouncilMemberRequest>,
): Promise<CouncilMember> {
  const res = await authFetch(councilMemberUrl(councilId, memberId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<CouncilMember>;
}

export async function removeCouncilMember(
  councilId: string,
  memberId: string,
): Promise<void> {
  await authFetch(councilMemberUrl(councilId, memberId), {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Agents (Behavioral Identities — previously "Agent Roles")
// ---------------------------------------------------------------------------

export function agentsUrl(): string {
  return `${API_V1}/agents`;
}

export function agentUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}`;
}

export async function fetchAgents(): Promise<AgentDefinition[]> {
  return fetcher<AgentDefinition[]>(agentsUrl());
}

export async function fetchAgent(agentId: string): Promise<AgentDefinition> {
  return fetcher<AgentDefinition>(agentUrl(agentId));
}

export async function createAgent(
  data: CreateAgentRequest,
): Promise<AgentDefinition> {
  const res = await authFetch(agentsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<AgentDefinition>;
}

export async function updateAgent(
  agentId: string,
  data: UpdateAgentRequest,
): Promise<AgentDefinition> {
  const res = await authFetch(agentUrl(agentId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<AgentDefinition>;
}

export async function deleteAgent(agentId: string): Promise<void> {
  await authFetch(agentUrl(agentId), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Agent Platform Scopes
// ---------------------------------------------------------------------------

export async function updateAgentPlatformScopes(
  agentId: string,
  scopes: string[],
): Promise<AgentDefinition> {
  const res = await authFetch(`${agentUrl(agentId)}/platform-scopes`, {
    method: "PATCH",
    body: JSON.stringify({ scopes }),
  });
  return res.json() as Promise<AgentDefinition>;
}

// ---------------------------------------------------------------------------
// Agent Prompt Management (PROMPT-10)
// ---------------------------------------------------------------------------

export function agentPromptUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/prompt`;
}

export function agentPreviewUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/preview`;
}

export async function fetchAgentPrompt(
  agentId: string,
): Promise<import("./types").PromptConfig> {
  return fetcher<import("./types").PromptConfig>(agentPromptUrl(agentId));
}

export async function updateAgentPrompt(
  agentId: string,
  promptConfig: import("./types").PromptConfig,
): Promise<import("./types").PromptConfig> {
  const res = await authFetch(agentPromptUrl(agentId), {
    method: "PATCH",
    body: JSON.stringify({ prompt_config: promptConfig }),
  });
  return res.json() as Promise<import("./types").PromptConfig>;
}

export async function previewAgentPrompt(
  agentId: string,
  projectId?: string,
): Promise<import("./types").PreviewPromptResponse> {
  const url = projectId
    ? `${agentPreviewUrl(agentId)}?project_id=${projectId}`
    : agentPreviewUrl(agentId);
  const res = await authFetch(url);
  return res.json() as Promise<import("./types").PreviewPromptResponse>;
}

export async function resetAgentToDefault(
  agentId: string,
): Promise<AgentDefinition> {
  const res = await authFetch(`${API_V1}/agents/${agentId}/reset`, {
    method: "POST",
  });
  return res.json() as Promise<AgentDefinition>;
}

// ---------------------------------------------------------------------------
// System Updates
// ---------------------------------------------------------------------------

export interface SystemUpdateResult {
  updated_agents: string[];
  updated_domains: string[];
  updated_context_blocks: string[];
  updated_abilities: string[];
}

export interface PendingUpdate {
  id: string;
  name: string;
  resource_type: string;
  display_name: string | null;
}

export async function applyAllSystemUpdates(): Promise<SystemUpdateResult> {
  const res = await authFetch(`${API_V1}/system-updates/apply`, {
    method: "POST",
  });
  return res.json() as Promise<SystemUpdateResult>;
}

export async function getPendingSystemUpdates(): Promise<PendingUpdate[]> {
  const res = await authFetch(`${API_V1}/system-updates/pending`);
  return res.json() as Promise<PendingUpdate[]>;
}

export async function setAgentPromptLock(
  agentId: string,
  locked: boolean,
): Promise<import("./types").AgentDefinition> {
  const res = await authFetch(`${agentUrl(agentId)}/prompt/lock`, {
    method: "PATCH",
    body: JSON.stringify({ locked }),
  });
  return res.json() as Promise<import("./types").AgentDefinition>;
}

// ---------------------------------------------------------------------------
// Project Routine Assignments
// ---------------------------------------------------------------------------

export function projectRoutineAssignmentsUrl(projectId: string): string {
  return `${API_V1}/projects/${projectId}/routine-assignments`;
}

export function projectRoutineAssignmentUrl(projectId: string, assignmentId: string): string {
  return `${API_V1}/projects/${projectId}/routine-assignments/${assignmentId}`;
}

export async function fetchProjectRoutineAssignments(
  projectId: string,
): Promise<import("./types").ProjectRoutineAssignment[]> {
  return fetcher(projectRoutineAssignmentsUrl(projectId));
}

export async function fetchProjectRoutineAssignment(
  projectId: string,
  assignmentId: string,
): Promise<import("./types").ProjectRoutineAssignment> {
  return fetcher(projectRoutineAssignmentUrl(projectId, assignmentId));
}

export async function createProjectRoutineAssignment(
  projectId: string,
  data: import("./types").CreateProjectRoutineAssignmentRequest,
): Promise<import("./types").ProjectRoutineAssignment> {
  const res = await authFetch(projectRoutineAssignmentsUrl(projectId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").ProjectRoutineAssignment>;
}

export async function updateProjectRoutineAssignment(
  projectId: string,
  assignmentId: string,
  data: import("./types").UpdateProjectRoutineAssignmentRequest,
): Promise<import("./types").ProjectRoutineAssignment> {
  const res = await authFetch(projectRoutineAssignmentUrl(projectId, assignmentId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").ProjectRoutineAssignment>;
}

export async function deleteProjectRoutineAssignment(
  projectId: string,
  assignmentId: string,
): Promise<void> {
  await authFetch(projectRoutineAssignmentUrl(projectId, assignmentId), {
    method: "DELETE",
  });
}

export async function triggerRoutineAssignment(
  projectId: string,
  assignmentId: string,
): Promise<void> {
  await authFetch(
    `${projectRoutineAssignmentUrl(projectId, assignmentId)}/trigger`,
    { method: "POST" },
  );
}

export async function triggerRoutine(routineId: string): Promise<void> {
  await authFetch(`${routineUrl(routineId)}/trigger`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Chat Messages
// ---------------------------------------------------------------------------

export function chatMessagesUrl(params?: {
  project_id?: string;
  agent_id?: string;
  limit?: number;
  before?: string;
  session_id?: string;
}): string {
  const qs = new URLSearchParams();
  if (params?.project_id) qs.set("project_id", params.project_id);
  if (params?.agent_id) qs.set("agent_id", params.agent_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.before) qs.set("before", params.before);
  if (params?.session_id) qs.set("session_id", params.session_id);
  const q = qs.toString();
  return `${API_V1}/chat-messages${q ? `?${q}` : ""}`;
}

export async function fetchChatMessages(
  projectId: string,
  agentId: string,
  opts?: { limit?: number; before?: string; session_id: string },
): Promise<ChatMessagePage> {
  return fetcher<ChatMessagePage>(
    chatMessagesUrl({
      project_id: projectId,
      agent_id: agentId,
      limit: opts?.limit,
      before: opts?.before,
      session_id: opts?.session_id,
    }),
  );
}

export async function createChatMessage(body: {
  project_id: string;
  agent_id: string;
  sender: string;
  content: string;
  session_id: string;
  idempotency_key?: string;
}): Promise<PersistedChatMessage> {
  const res = await authFetch(chatMessagesUrl(), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<PersistedChatMessage>;
}

export async function deleteChatMessages(
  projectId: string,
  agentId: string,
): Promise<void> {
  await authFetch(
    chatMessagesUrl({ project_id: projectId, agent_id: agentId }),
    { method: "DELETE" },
  );
}

export async function deleteChatMessage(messageId: string): Promise<void> {
  await authFetch(`${API_V1}/chat-messages/${messageId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Chat Sessions
// ---------------------------------------------------------------------------

export async function fetchChatSessions(
  projectId: string,
  agentId: string,
): Promise<ChatSession[]> {
  return fetcher<ChatSession[]>(
    `${API_V1}/chat-sessions?project_id=${projectId}&agent_id=${agentId}`,
  );
}

export async function createChatSession(body: {
  project_id: string;
  agent_id: string;
  title?: string;
}): Promise<ChatSession> {
  const res = await authFetch(`${API_V1}/chat-sessions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ChatSession>;
}

export async function updateChatSession(
  id: string,
  body: { title: string },
): Promise<void> {
  await authFetch(`${API_V1}/chat-sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function archiveChatSession(id: string): Promise<void> {
  await authFetch(`${API_V1}/chat-sessions/${id}/archive`, { method: "POST" });
}

export async function deleteChatSession(id: string): Promise<void> {
  await authFetch(`${API_V1}/chat-sessions/${id}`, { method: "DELETE" });
}

export const allChatSessionsUrl = (limit = 50, offset = 0, channelType = "chat") =>
  `${API_V1}/chat-sessions/all?limit=${limit}&offset=${offset}&channel_type=${channelType}`;

export async function fetchAllChatSessions(params?: {
  limit?: number;
  offset?: number;
  channelType?: string;
}): Promise<ChatSessionExtended[]> {
  return fetcher<ChatSessionExtended[]>(
    allChatSessionsUrl(params?.limit, params?.offset, params?.channelType),
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsUnreadUrl = () => `${API_V1}/notifications/unread`;

export async function markNotificationRead(sessionId: string): Promise<void> {
  await authFetch(`${API_V1}/notifications/${sessionId}/read`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export function domainsUrl(): string {
  return `${API_V1}/domains`;
}

export function domainUrl(id: string): string {
  return `${API_V1}/domains/${id}`;
}

export async function fetchDomains(): Promise<Domain[]> {
  const res = await authFetch(domainsUrl());
  return res.json() as Promise<Domain[]>;
}

export async function fetchDomain(id: string): Promise<Domain> {
  const res = await authFetch(domainUrl(id));
  return res.json() as Promise<Domain>;
}

export async function createDomain(data: CreateDomainRequest): Promise<Domain> {
  const res = await authFetch(domainsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Domain>;
}

export async function updateDomain(
  id: string,
  data: UpdateDomainRequest,
): Promise<Domain> {
  const res = await authFetch(domainUrl(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Domain>;
}

export async function deleteDomain(id: string): Promise<void> {
  await authFetch(domainUrl(id), { method: "DELETE" });
}

export async function moveDomain(id: string, path: string): Promise<Domain> {
  const res = await authFetch(`${domainUrl(id)}/move`, { method: "PATCH", body: JSON.stringify({ path }) });
  return res.json() as Promise<Domain>;
}

export async function deleteDomainFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/domains/folders/delete`, { method: "DELETE", body: JSON.stringify({ path }) });
}

export async function renameDomainFolder(oldPath: string, newPath: string): Promise<void> {
  await authFetch(`${API_V1}/domains/folders/rename`, { method: "PATCH", body: JSON.stringify({ old_path: oldPath, new_path: newPath }) });
}

export async function uploadDomain(file: File): Promise<Domain> {
  const form = new FormData();
  form.append("file", file);
  const res = await authFetch(`${domainsUrl()}/upload`, {
    method: "POST",
    body: form,
  });
  return res.json() as Promise<Domain>;
}

// ---------------------------------------------------------------------------
// Agent-Domain Assignments
// ---------------------------------------------------------------------------

export function agentDomainsUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/domains`;
}

export function agentDomainUrl(agentId: string, domainId: string): string {
  return `${API_V1}/agents/${agentId}/domains/${domainId}`;
}

export async function fetchAgentDomains(
  agentId: string,
): Promise<AgentDomainAssignment[]> {
  const res = await authFetch(agentDomainsUrl(agentId));
  return res.json() as Promise<AgentDomainAssignment[]>;
}

export async function assignDomainToAgent(
  agentId: string,
  domainId: string,
): Promise<AgentDomainAssignment> {
  const res = await authFetch(agentDomainUrl(agentId, domainId), {
    method: "POST",
  });
  return res.json() as Promise<AgentDomainAssignment>;
}

export async function removeDomainFromAgent(
  agentId: string,
  domainId: string,
): Promise<void> {
  await authFetch(agentDomainUrl(agentId, domainId), { method: "DELETE" });
}

export async function toggleAgentDomain(
  agentId: string,
  domainId: string,
  enabled: boolean,
): Promise<AgentDomainAssignment> {
  const res = await authFetch(agentDomainUrl(agentId, domainId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return res.json() as Promise<AgentDomainAssignment>;
}

// ---------------------------------------------------------------------------
// Domain Sessions
// ---------------------------------------------------------------------------

export async function createDomainSession(
  domainId: string,
  projectId: string,
  agentId: string,
): Promise<DomainSession> {
  const res = await authFetch(`${domainUrl(domainId)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, agent_id: agentId }),
  });
  return res.json() as Promise<DomainSession>;
}

export async function fetchDomainSession(
  sessionId: string,
): Promise<DomainSession> {
  const res = await authFetch(`${API_V1}/domains/sessions/${sessionId}`);
  return res.json() as Promise<DomainSession>;
}

export async function updateDomainSessionDraft(
  sessionId: string,
  artifactDraft: Record<string, unknown>,
): Promise<DomainSession> {
  const res = await authFetch(`${API_V1}/domains/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifact_draft: artifactDraft }),
  });
  return res.json() as Promise<DomainSession>;
}

export async function completeDomainSession(
  sessionId: string,
): Promise<DomainSession> {
  const res = await authFetch(
    `${API_V1}/domains/sessions/${sessionId}/complete`,
    { method: "POST" },
  );
  return res.json() as Promise<DomainSession>;
}

export async function cancelDomainSession(
  sessionId: string,
): Promise<DomainSession> {
  const res = await authFetch(
    `${API_V1}/domains/sessions/${sessionId}/cancel`,
    { method: "POST" },
  );
  return res.json() as Promise<DomainSession>;
}

export async function fetchActiveDomainSession(
  projectId: string,
  agentId: string,
): Promise<DomainSession | null> {
  const res = await authFetch(
    `${API_V1}/domains/sessions/active?project_id=${projectId}&agent_id=${agentId}`,
  );
  if (res.status === 204) return null;
  return res.json() as Promise<DomainSession>;
}

// ---------------------------------------------------------------------------
// Domain Artifacts
// ---------------------------------------------------------------------------

export async function fetchProjectDomainArtifacts(
  projectId: string,
): Promise<DomainArtifact[]> {
  const res = await authFetch(
    `${API_V1}/projects/${projectId}/domain-artifacts`,
  );
  return res.json() as Promise<DomainArtifact[]>;
}

// ---------------------------------------------------------------------------
// Lambdas
// ---------------------------------------------------------------------------

export function lambdasUrl(): string {
  return `${API_V1}/lambdas`;
}

export function lambdaUrl(id: string): string {
  return `${API_V1}/lambdas/${id}`;
}

export async function fetchLambdas(): Promise<Lambda[]> {
  return fetcher<Lambda[]>(lambdasUrl());
}

export async function fetchLambda(id: string): Promise<Lambda> {
  return fetcher<Lambda>(lambdaUrl(id));
}

export async function createLambda(data: CreateLambdaRequest): Promise<Lambda> {
  const res = await authFetch(lambdasUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Lambda>;
}

export async function updateLambda(
  id: string,
  data: UpdateLambdaRequest,
): Promise<Lambda> {
  const res = await authFetch(lambdaUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<Lambda>;
}

export async function deleteLambda(id: string): Promise<void> {
  await authFetch(lambdaUrl(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

export function mcpServersUrl(): string {
  return `${API_V1}/mcp-servers`;
}

export function mcpServerUrl(id: string): string {
  return `${API_V1}/mcp-servers/${id}`;
}

export function agentMcpUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/mcp`;
}

export function agentMcpAssignmentUrl(agentId: string, mcpId: string): string {
  return `${API_V1}/agents/${agentId}/mcp/${mcpId}`;
}

export async function fetchMcpServers(): Promise<import("./types").McpServer[]> {
  return fetcher(mcpServersUrl());
}

export async function createMcpServer(
  data: {
    name: string;
    display_name: string;
    description?: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env_schema?: import("./types").McpEnvField[];
    icon?: string;
    category?: string;
    tags?: string[];
  },
): Promise<import("./types").McpServer> {
  const res = await authFetch(mcpServersUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").McpServer>;
}

export async function updateMcpServer(
  id: string,
  data: Partial<{
    display_name: string;
    description: string;
    transport: "stdio" | "http";
    command: string;
    args: string[];
    url: string;
    env_schema: import("./types").McpEnvField[];
    icon: string;
    category: string;
    tags: string[];
  }>,
): Promise<import("./types").McpServer> {
  const res = await authFetch(mcpServerUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").McpServer>;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await authFetch(mcpServerUrl(id), { method: "DELETE" });
}

export async function fetchAgentMcpServers(
  agentId: string,
): Promise<import("./types").McpServer[]> {
  return fetcher(agentMcpUrl(agentId));
}

export async function assignMcpToAgent(
  agentId: string,
  mcpId: string,
): Promise<import("./types").AgentMcpAssignment> {
  const res = await authFetch(agentMcpAssignmentUrl(agentId, mcpId), {
    method: "POST",
  });
  return res.json() as Promise<import("./types").AgentMcpAssignment>;
}

export async function removeMcpFromAgent(
  agentId: string,
  mcpId: string,
): Promise<void> {
  await authFetch(agentMcpAssignmentUrl(agentId, mcpId), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// MCP Registry search
// ---------------------------------------------------------------------------

export interface McpRegistryKeyValueInput {
  name?: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  format?: string;
  value?: string;
  variables?: Record<string, McpRegistryKeyValueInput>;
}

export interface McpRegistryPackage {
  registryType?: string;
  identifier?: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type?: string };
  environmentVariables?: McpRegistryKeyValueInput[];
  runtimeArguments?: McpRegistryKeyValueInput[];
  packageArguments?: McpRegistryKeyValueInput[];
}

export interface McpRegistryRemote {
  type?: string;
  url?: string;
  headers?: McpRegistryKeyValueInput[];
}

export interface McpRegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string; source?: string };
  remotes?: McpRegistryRemote[];
  packages?: McpRegistryPackage[];
}

export interface McpRegistrySearchResult {
  servers: McpRegistryServer[];
  nextCursor?: string;
}

export async function searchMcpRegistry(
  query: string,
  limit = 20,
  cursor?: string,
): Promise<McpRegistrySearchResult> {
  let url = `${API_V1}/mcp-servers/registry/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

  const raw = await fetcher<{
    metadata?: { nextCursor?: string };
    servers?: Array<{
      server?: McpRegistryServer;
    }>;
  }>(url);

  // Flatten the nested server objects from the registry API
  const servers: McpRegistryServer[] = (raw.servers || [])
    .map((entry) => entry.server)
    .filter((s): s is McpRegistryServer => !!s);

  return {
    servers,
    nextCursor: raw.metadata?.nextCursor,
  };
}

export async function getMcpRegistryServer(
  serverName: string,
): Promise<McpRegistryServer> {
  const url = `${API_V1}/mcp-servers/registry/${encodeURIComponent(serverName)}/latest`;
  const raw = await fetcher<{ server?: McpRegistryServer }>(url);
  if (!raw.server) throw new Error("Server not found");
  return raw.server;
}

// ---------------------------------------------------------------------------
// Context Blocks
// ---------------------------------------------------------------------------

export function contextBlocksUrl(): string {
  return `${API_V1}/context-blocks`;
}

export function contextBlockUrl(id: string): string {
  return `${API_V1}/context-blocks/${id}`;
}

export async function fetchContextBlocks(): Promise<import("./types").ContextBlock[]> {
  return fetcher(contextBlocksUrl());
}

export async function createContextBlock(
  data: import("./types").CreateContextBlockRequest,
): Promise<import("./types").ContextBlock> {
  const res = await authFetch(contextBlocksUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").ContextBlock>;
}

export async function updateContextBlock(
  id: string,
  data: import("./types").UpdateContextBlockRequest,
): Promise<import("./types").ContextBlock> {
  const res = await authFetch(contextBlockUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").ContextBlock>;
}

export async function deleteContextBlock(id: string): Promise<void> {
  await authFetch(contextBlockUrl(id), { method: "DELETE" });
}

export async function moveContextBlock(
  id: string,
  path: string,
): Promise<import("./types").ContextBlock> {
  const res = await authFetch(`${contextBlockUrl(id)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ path }),
  });
  return res.json() as Promise<import("./types").ContextBlock>;
}

export async function deleteFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/context-blocks/folders/${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

export async function renameFolder(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await authFetch(`${API_V1}/context-blocks/folders/rename`, {
    method: "PATCH",
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export function abilitiesUrl(): string {
  return `${API_V1}/abilities`;
}

export function abilityUrl(id: string): string {
  return `${API_V1}/abilities/${id}`;
}

export function agentAbilitiesUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/abilities`;
}

export async function fetchAbilities(): Promise<import("./types").Ability[]> {
  return fetcher(abilitiesUrl());
}

export async function fetchAbility(id: string): Promise<import("./types").Ability> {
  return fetcher(abilityUrl(id));
}

export async function createAbility(
  data: import("./types").CreateAbilityRequest,
): Promise<import("./types").Ability> {
  const res = await authFetch(abilitiesUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").Ability>;
}

export async function updateAbility(
  id: string,
  data: import("./types").UpdateAbilityRequest,
): Promise<import("./types").Ability> {
  const res = await authFetch(abilityUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").Ability>;
}

export async function deleteAbility(id: string): Promise<void> {
  await authFetch(abilityUrl(id), { method: "DELETE" });
}

export async function moveAbility(
  id: string,
  path: string,
): Promise<import("./types").Ability> {
  const res = await authFetch(`${abilityUrl(id)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ path }),
  });
  return res.json() as Promise<import("./types").Ability>;
}

export async function deleteAbilityFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/abilities/folders/delete`, {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export async function renameAbilityFolder(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await authFetch(`${API_V1}/abilities/folders/rename`, {
    method: "PATCH",
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
}

export async function fetchAgentAbilities(
  agentId: string,
): Promise<import("./types").Ability[]> {
  return fetcher(agentAbilitiesUrl(agentId));
}

export async function setAgentAbilities(
  agentId: string,
  abilityIds: string[],
): Promise<import("./types").AgentAbilityAssignment[]> {
  const res = await authFetch(agentAbilitiesUrl(agentId), {
    method: "PUT",
    body: JSON.stringify({ ability_ids: abilityIds }),
  });
  return res.json() as Promise<import("./types").AgentAbilityAssignment[]>;
}
