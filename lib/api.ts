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
  AgentHeartbeat,
  PromptConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  Domain,
  DomainManifest,
  CreateDomainRequest,
  UpdateDomainRequest,
  AgentDomainAssignment,
  DomainSession,
  PersistedChatMessage,
  ChatMessagePage,
  ChatSession,
  PromptContextVariableGroup,
  ChatSessionExtended,
  PushConfigResponse,
  PushSubscriptionRecord,
  ChatCancelRequest,
  ChatDomainExitRequest,
  ChatSessionDeleteRequest,
  ChatStreamRequest,
  EncryptedPayload,
  PromptConfigResponse,
  TokenUsageSource,
} from "./types";
import { mutate as mutateSWR } from "swr";
import {
  decryptContentPayload,
  encryptOrgContentPayload,
} from "./cryptoContent";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_V1 = "/api/platform";
const FETCH_TIMEOUT_MS = 15000;
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_FALLBACK_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 10000;
const CATALOG_CACHE_VERSION = 2;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_CACHE_MAX_BYTES = 512 * 1024;
const CATALOG_CACHE_PREFIX = "nenjo.catalog-cache";
const DOCUMENT_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

interface DocumentContentResult {
  content: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

interface DocumentContentCacheEntry {
  orgId: string;
  savedAt: number;
  data: DocumentContentResult;
}

type ProjectSettingsPayload = Record<string, unknown>;

const documentContentCache = new Map<string, DocumentContentCacheEntry>();

function normalizeOptionalProjectId(projectId: string | null | undefined): string | null {
  return projectId && projectId !== NIL_UUID ? projectId : null;
}

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return url;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayFromResponse(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1000, RATE_LIMIT_MAX_DELAY_MS);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), RATE_LIMIT_MAX_DELAY_MS);
    }
  }

  return Math.min(
    RATE_LIMIT_FALLBACK_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    RATE_LIMIT_MAX_DELAY_MS,
  );
}

/**
 * Optional global token getter retained for compatibility with components
 * that still initialize auth plumbing. Browser API calls route through the
 * dashboard BFF and do not attach Clerk bearer tokens directly.
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
type AuthTokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;

let _getActiveOrgId: (() => string | null) | null = null;

export function setAuthTokenGetter(
  getter: AuthTokenGetter | null,
) {
  void getter;
}

export function setActiveOrgIdGetter(
  getter: (() => string | null) | null,
) {
  _getActiveOrgId = getter;
}

/**
 * Build API request headers. Browser requests do not attach Clerk session
 * tokens; the dashboard BFF converts the Clerk cookie session into an
 * internal server-to-platform credential.
 */
async function authHeaders(
  extra?: Record<string, string>,
  _options?: { skipTokenCache?: boolean },
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  const activeOrgId = _getActiveOrgId?.()?.trim();
  if (activeOrgId) {
    headers["X-Nenjo-Org-Id"] = activeOrgId;
  }

  return headers;
}

async function authHeadersWithOptions(options?: {
  extra?: Record<string, string>;
  includeOrgHeader?: boolean;
  skipTokenCache?: boolean;
}): Promise<Record<string, string>> {
  const headers = await authHeaders(options?.extra, {
    skipTokenCache: options?.skipTokenCache,
  });
  if (options?.includeOrgHeader === false) {
    delete headers["X-Nenjo-Org-Id"];
  }
  return headers;
}

export async function authRequestHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  return authHeaders(extra);
}

/**
 * Authenticated fetch wrapper. Requests route through the dashboard BFF,
 * which authenticates the Clerk cookie session server-side and attaches the
 * internal platform credential.
 */
async function authFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const resolvedUrl = resolveApiUrl(url);
  const includeOrgHeader =
    !resolvedUrl.endsWith("/api/platform/auth/me")
    && !resolvedUrl.endsWith("/api/platform/auth/bootstrap-status")
    && !resolvedUrl.endsWith("/api/platform/orgs")
    && !resolvedUrl.endsWith("/api/platform/orgs/")
    && !resolvedUrl.endsWith("/api/platform/orgs/current");
  const initHeaders =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : Array.isArray(init?.headers)
        ? Object.fromEntries(init.headers)
        : init?.headers;

  for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
    const headers = await authHeadersWithOptions({
      includeOrgHeader,
      skipTokenCache: attempt > 1,
    });
    if (initHeaders) {
      Object.assign(headers, initHeaders);
    }
    if (typeof FormData !== "undefined" && init?.body instanceof FormData) {
      delete headers["Content-Type"];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(resolvedUrl, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`, 504);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 429 && attempt < RATE_LIMIT_MAX_ATTEMPTS) {
      await sleep(retryDelayFromResponse(res, attempt));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "Unknown error");
      const invalidToken =
        res.status === 401 &&
        body.includes('"code":"invalid_token"') &&
        attempt < RATE_LIMIT_MAX_ATTEMPTS;
      if (invalidToken) {
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (
        res.status === 404 &&
        contentType.includes("text/html") &&
        resolvedUrl.includes("/api/v1/")
      ) {
        throw new ApiError(
          "Dashboard API request hit the Next app instead of the platform API. Set `NEXT_PUBLIC_API_URL` or configure `API_PROXY_TARGET` for the dashboard dev server.",
          res.status,
        );
      }
      throw new ApiError(body, res.status);
    }

    return res;
  }

  throw new ApiError("Rate limit exceeded", 429);
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  return res.json() as Promise<T>;
}

interface CatalogCacheEntry<T> {
  version: number;
  orgId: string;
  url: string;
  savedAt: number;
  data: T;
}

function activeCatalogOrgId(): string | null {
  return _getActiveOrgId?.()?.trim() || null;
}

function scopedCacheKey(orgId: string, url: string): string {
  return `${orgId}:${url}`;
}

function catalogStorageKey(orgId: string, url: string): string {
  return `${CATALOG_CACHE_PREFIX}:${CATALOG_CACHE_VERSION}:${orgId}:${url}`;
}

function isCatalogUrl(url: string): boolean {
  if (url === projectsUrl()) return true;
  if (url === modelsUrl()) return true;
  if (url.startsWith(`${modelsUrl()}?`)) return true;
  if (/\/api\/v1\/knowledge$/.test(url)) return true;
  if (/\/api\/v1\/knowledge\/[^/]+\/items$/.test(url)) return true;
  if (/\/api\/v1\/knowledge\/[^/]+\/items\/[^/]+\/edges$/.test(url)) return true;
  if (/\/api\/v1\/marketplaces$/.test(url)) return true;
  return [
    agentsUrl(),
    domainsUrl(),
    abilitiesUrl(),
    contextBlocksUrl(),
    mcpServersUrl(),
    councilsUrl(),
    routinesUrl(),
  ].includes(url);
}

function readDocumentContentCache(url: string): DocumentContentResult | null {
  const orgId = activeCatalogOrgId();
  if (!orgId) return null;

  const key = scopedCacheKey(orgId, url);
  const entry = documentContentCache.get(key);
  if (!entry) return null;

  const isValid =
    entry.orgId === orgId &&
    Date.now() - entry.savedAt <= DOCUMENT_CONTENT_CACHE_TTL_MS;

  if (!isValid) {
    documentContentCache.delete(key);
    return null;
  }

  return entry.data;
}

function writeDocumentContentCache(url: string, data: DocumentContentResult): void {
  const orgId = activeCatalogOrgId();
  if (!orgId) return;

  documentContentCache.set(scopedCacheKey(orgId, url), {
    orgId,
    savedAt: Date.now(),
    data,
  });
}

function clearDocumentContentCache(url?: string): void {
  const orgId = activeCatalogOrgId();
  if (!orgId) {
    documentContentCache.clear();
    return;
  }

  if (url) {
    documentContentCache.delete(scopedCacheKey(orgId, url));
    return;
  }

  const prefix = `${orgId}:`;
  Array.from(documentContentCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      documentContentCache.delete(key);
    }
  });
}

function readCatalogCache<T>(url: string): T | null {
  if (typeof window === "undefined") return null;

  const orgId = activeCatalogOrgId();
  if (!orgId) return null;

  try {
    const raw = window.localStorage.getItem(catalogStorageKey(orgId, url));
    if (!raw) return null;

    const entry = JSON.parse(raw) as CatalogCacheEntry<T>;
    const isValid =
      entry.version === CATALOG_CACHE_VERSION &&
      entry.orgId === orgId &&
      entry.url === url &&
      Date.now() - entry.savedAt <= CATALOG_CACHE_TTL_MS;

    if (!isValid) {
      window.localStorage.removeItem(catalogStorageKey(orgId, url));
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function writeCatalogCache<T>(url: string, data: T): void {
  if (typeof window === "undefined") return;

  const orgId = activeCatalogOrgId();
  if (!orgId) return;

  try {
    const entry: CatalogCacheEntry<T> = {
      version: CATALOG_CACHE_VERSION,
      orgId,
      url,
      savedAt: Date.now(),
      data,
    };
    const serialized = JSON.stringify(entry);
    if (serialized.length > CATALOG_CACHE_MAX_BYTES) return;

    window.localStorage.setItem(catalogStorageKey(orgId, url), serialized);
  } catch {
    // Ignore storage failures.
  }
}

function clearCatalogCacheMatching(shouldClear: (url: string) => boolean): void {
  if (typeof window === "undefined") return;

  const orgId = activeCatalogOrgId();
  const prefix = orgId
    ? `${CATALOG_CACHE_PREFIX}:${CATALOG_CACHE_VERSION}:${orgId}:`
    : `${CATALOG_CACHE_PREFIX}:`;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const cachedUrl = key.slice(prefix.length);
      if (!shouldClear(cachedUrl)) continue;
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }

  void mutateSWR(
    (key) => typeof key === "string" && shouldClear(key),
  );
}

export function clearCatalogCache(url?: string): void {
  clearCatalogCacheMatching(url ? (cachedUrl) => cachedUrl === url : isCatalogUrl);
}

export async function catalogFetcher<T>(url: string): Promise<T> {
  const cached = readCatalogCache<T>(url);
  if (cached) return cached;

  const data = await fetcher<T>(url);
  writeCatalogCache(url, data);
  return data;
}

export const catalogSWROptions = {
  revalidateOnFocus: false,
  dedupingInterval: CATALOG_CACHE_TTL_MS,
  keepPreviousData: true,
};

function invalidateProjectCatalogCache(): void {
  clearCatalogCache(projectsUrl());
}

function invalidateModelsCatalogCache(): void {
  clearCatalogCacheMatching((url) => url === modelsUrl() || url.startsWith(`${modelsUrl()}?`));
}

function invalidateAgentsCatalogCache(): void {
  clearCatalogCache(agentsUrl());
}

function invalidateDomainsCatalogCache(): void {
  clearCatalogCache(domainsUrl());
}

function invalidateAbilitiesCatalogCache(): void {
  clearCatalogCache(abilitiesUrl());
}

function invalidateContextBlocksCatalogCache(): void {
  clearCatalogCache(contextBlocksUrl());
}

function invalidateMcpServersCatalogCache(): void {
  clearCatalogCache(mcpServersUrl());
}

function invalidateMarketplacesCatalogCache(sourceId?: string): void {
  clearCatalogCache(marketplaceSourcesUrl());
  void sourceId;
}

function invalidatePackageCatalogCache(sourceId?: string): void {
  clearCatalogCacheMatching((url) => {
    if (url === packageSourcesUrl() || url === packageInstallsUrl()) return true;
    if (!url.startsWith(`${API_V1}/packages/catalog`)) return false;
    if (!sourceId) return true;
    return url.includes(`source_id=${encodeURIComponent(sourceId)}`);
  });
}

function invalidateCouncilsCatalogCache(): void {
  clearCatalogCache(councilsUrl());
}

function invalidateRoutinesCatalogCache(): void {
  clearCatalogCache(routinesUrl());
}

function invalidateKnowledgeCatalogCache(packId?: string): void {
  clearCatalogCache(knowledgePacksUrl());
  if (packId) clearCatalogCache(knowledgeItemsUrl(packId));
}

function invalidateKnowledgeItemCache(packId: string, itemId: string): void {
  invalidateKnowledgeCatalogCache(packId);
  clearCatalogCache(knowledgeItemEdgesUrl(packId, itemId));
  clearDocumentContentCache(knowledgeItemContentUrl(packId, itemId));
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

async function decryptProjectSettings(
  project: Project,
): Promise<Project> {
  const settings = project.settings as ProjectSettingsPayload;
  if (!isEncryptedPayload(project.encrypted_payload)) {
    return project;
  }

  const encryptedSettings = await decryptJsonPayload<ProjectSettingsPayload>(
    project.encrypted_payload,
    {},
    "project settings",
  );
  return {
    ...project,
    settings: {
      ...settings,
      ...encryptedSettings,
    },
  };
}

async function encryptProjectSettingsForWrite(
  projectId: string,
  settings: ProjectSettingsPayload,
): Promise<{
  settings: ProjectSettingsPayload;
  encrypted_payload?: import("./types").EncryptedPayload;
}> {
  const next: ProjectSettingsPayload = { ...settings };
  const sensitiveSettings: ProjectSettingsPayload = {};

  if (typeof settings.context === "string") {
    sensitiveSettings.context = settings.context;
    delete next.context;
  }

  if (settings.metadata && typeof settings.metadata === "object") {
    sensitiveSettings.metadata = settings.metadata;
    delete next.metadata;
  }

  return {
    settings: next,
    encrypted_payload: Object.keys(sensitiveSettings).length
      ? await encryptOrgJsonPayload({
          objectId: projectId,
          objectType: "project.settings",
          value: sensitiveSettings,
          label: "Project settings",
        })
      : undefined,
  };
}

// ---- Prompt Context Variables -----------------------------------------------

export function promptContextVariablesUrl(): string {
  return `${API_V1}/prompt-context-variables`;
}

export async function fetchPromptContextVariables(): Promise<PromptContextVariableGroup[]> {
  return fetcher<PromptContextVariableGroup[]>(promptContextVariablesUrl());
}

export async function fetchProjects(): Promise<Project[]> {
  const projects = await catalogFetcher<Project[]>(projectsUrl());
  return Promise.all(projects.map(decryptProjectSettings));
}

export async function fetchProject(id: string): Promise<Project> {
  return decryptProjectSettings(await fetcher<Project>(projectUrl(id)));
}

export async function createProject(
  data: CreateProjectRequest,
): Promise<Project> {
  const res = await authFetch(projectsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });

  invalidateProjectCatalogCache();
  return res.json() as Promise<Project>;
}

export async function deleteProject(id: string): Promise<void> {
  await authFetch(projectUrl(id), { method: "DELETE" });
  invalidateProjectCatalogCache();
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "description" | "settings">>,
): Promise<Project> {
  const encryptedSettings = data.settings
    ? await encryptProjectSettingsForWrite(id, data.settings as ProjectSettingsPayload)
    : undefined;
  const payload = {
    ...data,
    settings: encryptedSettings?.settings,
    encrypted_payload: encryptedSettings?.encrypted_payload,
  };
  const res = await authFetch(projectUrl(id), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  invalidateProjectCatalogCache();
  return decryptProjectSettings(await res.json() as Project);
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
  invalidateProjectCatalogCache();
  return res.json() as Promise<{ status: string }>;
}

export async function disconnectRepo(projectId: string): Promise<void> {
  await authFetch(`${API_V1}/projects/${projectId}/disconnect-repo`, {
    method: "POST",
  });
  invalidateProjectCatalogCache();
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

type TaskContentPayload = {
  description?: string | null;
  acceptance_criteria?: string | null;
};

function extractTaskEncryptedPayload(task: Task): EncryptedPayload | null {
  const payload = task.encrypted_payload;
  if (!payload || typeof payload !== "object") return null;
  return payload as EncryptedPayload;
}

async function resolveTask(task: Task): Promise<Task> {
  const encryptedPayload = extractTaskEncryptedPayload(task);
  if (!encryptedPayload) return task;

  try {
    const plaintext = await decryptContentPayload(encryptedPayload);
    if (!plaintext) return task;
    const payload = JSON.parse(plaintext) as TaskContentPayload;
    return {
      ...task,
      description: payload.description ?? null,
      acceptance_criteria: payload.acceptance_criteria ?? null,
    };
  } catch (error) {
    console.warn("Failed to decrypt task content", {
      taskId: task.id,
      objectId: encryptedPayload.object_id,
      error,
    });
    return task;
  }
}

async function encryptTaskContent(params: {
  taskId: string;
  description?: string;
  acceptanceCriteria?: string;
}): Promise<EncryptedPayload | null> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) return null;

  const payload: TaskContentPayload = {
    description: params.description ?? null,
    acceptance_criteria: params.acceptanceCriteria ?? null,
  };

  return encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: params.taskId,
    objectType: "task_content",
    plaintext: JSON.stringify(payload),
  });
}

export async function fetchTasks(
  projectId: string,
  status?: string,
): Promise<Task[]> {
  const tasks = await fetcher<Task[]>(tasksUrl(projectId, { status }));
  return Promise.all(tasks.map(resolveTask));
}

export async function createTask(
  data: {
    project_id: string;
    title: string;
    description?: string;
    acceptance_criteria?: string;
    status?: string;
    priority?: Task["priority"];
    type?: Task["type"];
    complexity?: number | null;
    tags?: string[];
  },
): Promise<Task> {
  const taskId = crypto.randomUUID();
  const needsEncryptedContent =
    Boolean(data.description?.trim()) ||
    Boolean(data.acceptance_criteria?.trim());
  const encryptedPayload = needsEncryptedContent
    ? await encryptTaskContent({
        taskId,
        description: data.description,
        acceptanceCriteria: data.acceptance_criteria,
      })
    : null;
  if (needsEncryptedContent && !encryptedPayload) {
    throw new ApiError("Task encryption is required before creating a task", 400);
  }
  const res = await authFetch(`${API_V1}/tasks`, {
    method: "POST",
    body: JSON.stringify({
      id: taskId,
      project_id: data.project_id,
      title: data.title,
      status: data.status,
      priority: data.priority,
      type: data.type,
      complexity: data.complexity,
      tags: data.tags,
      encrypted_payload: encryptedPayload,
    }),
  });
  return resolveTask((await res.json()) as Task);
}

export async function updateTask(
  id: string,
  data: UpdateTaskRequest,
  currentTask?: Task,
): Promise<Task> {
  const needsEncryptedContent =
    data.description !== undefined || data.acceptance_criteria !== undefined;
  if (needsEncryptedContent && !currentTask) {
    throw new ApiError(
      "Encrypted task updates require the current task content",
      400,
    );
  }
  const encryptedPayload = needsEncryptedContent
    ? await encryptTaskContent({
        taskId: id,
        description: data.description ?? currentTask?.description ?? undefined,
        acceptanceCriteria:
          data.acceptance_criteria ??
          currentTask?.acceptance_criteria ??
          undefined,
      })
    : undefined;
  if (needsEncryptedContent && !encryptedPayload) {
    throw new ApiError("Task encryption is required before updating a task", 400);
  }
  const res = await authFetch(taskUrl(id), {
    method: "PATCH",
    body: JSON.stringify({
      title: data.title,
      status: data.status,
      priority: data.priority,
      type: data.type,
      complexity: data.complexity,
      routine_id: data.routine_id,
      assigned_agent_id: data.assigned_agent_id,
      encrypted_payload: encryptedPayload,
    }),
  });
  return resolveTask((await res.json()) as Task);
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
  agent_id?: string;
  routine_id?: string;
  status?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  if (params?.project_id) search.set("project_id", params.project_id);
  if (params?.agent_id) search.set("agent_id", params.agent_id);
  if (params?.routine_id) search.set("routine_id", params.routine_id);
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

export function tokenUsageUrl(params?: {
  source?: TokenUsageSource;
  project_id?: string;
  agent_id?: string;
  from?: string;
  to?: string;
  group_by?: "source" | "day" | "agent" | "project";
}): string {
  const search = new URLSearchParams();
  if (params?.source) search.set("source", params.source);
  if (params?.project_id) search.set("project_id", params.project_id);
  if (params?.agent_id) search.set("agent_id", params.agent_id);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.group_by) search.set("group_by", params.group_by);
  const qs = search.toString();
  return `${API_V1}/usage/tokens${qs ? `?${qs}` : ""}`;
}

export async function fetchExecutions(
  projectId?: string,
  limit?: number,
  status?: string,
  routineId?: string,
  agentId?: string,
): Promise<ExecutionDetails[]> {
  return fetcher<ExecutionDetails[]>(
    executionsUrl({ project_id: projectId, agent_id: agentId, routine_id: routineId, status, limit }),
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
  return catalogFetcher<Model[]>(modelsUrl({ project_id: projectId }));
}

export async function fetchModel(id: string): Promise<Model> {
  return fetcher<Model>(modelUrl(id));
}

export async function createModel(data: CreateModelRequest): Promise<Model> {
  const res = await authFetch(modelsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });

  invalidateModelsCatalogCache();
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

  invalidateModelsCatalogCache();
  return res.json() as Promise<Model>;
}

export async function deleteModel(id: string): Promise<void> {
  await authFetch(modelUrl(id), { method: "DELETE" });
  invalidateModelsCatalogCache();
}

export async function fetchAllTags(projectId?: string): Promise<string[]> {
  return fetcher<string[]>(
    `${API_V1}/models/tags${projectId ? `?project_id=${projectId}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// Knowledge (Garage object storage)
// ---------------------------------------------------------------------------

export function knowledgePacksUrl(): string {
  return `${API_V1}/knowledge`;
}

export function knowledgePackInstallUrl(): string {
  return `${knowledgePacksUrl()}/install`;
}

export function knowledgePackUrl(packId: string): string {
  return `${API_V1}/knowledge/${packId}`;
}

export function knowledgeItemsUrl(packId: string): string {
  return `${knowledgePackUrl(packId)}/items`;
}

export function knowledgeItemUrl(packId: string, itemId: string): string {
  return `${knowledgeItemsUrl(packId)}/${itemId}`;
}

export async function fetchKnowledgePacks(): Promise<import("./types").KnowledgePack[]> {
  return catalogFetcher(knowledgePacksUrl());
}

export async function createKnowledgePack(
  data: Pick<import("./types").KnowledgePack, "name"> & Partial<Pick<import("./types").KnowledgePack, "slug" | "description">>,
): Promise<import("./types").KnowledgePack> {
  const res = await authFetch(knowledgePacksUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const pack = await res.json() as import("./types").KnowledgePack;
  invalidateKnowledgeCatalogCache();
  return pack;
}

export async function installKnowledgePack(
  data: import("./types").InstallKnowledgePackRequest,
): Promise<import("./types").KnowledgePack> {
  const res = await authFetch(knowledgePackInstallUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const pack = await res.json() as import("./types").KnowledgePack;
  invalidateKnowledgeCatalogCache();
  return pack;
}

// ---------------------------------------------------------------------------
// Marketplaces
// ---------------------------------------------------------------------------

export function marketplaceSourcesUrl(): string {
  return `${API_V1}/marketplaces`;
}

export function marketplaceSourceUrl(sourceId: string): string {
  return `${marketplaceSourcesUrl()}/${sourceId}`;
}

export function marketplaceClaudePluginInstallUrl(sourceId: string): string {
  return `${marketplaceSourcesUrl()}/${sourceId}/install/claude-plugin`;
}

export async function fetchMarketplaceSources(): Promise<import("./types").MarketplaceSource[]> {
  return catalogFetcher(marketplaceSourcesUrl());
}

export async function createMarketplaceSource(
  data: import("./types").CreateMarketplaceSourceRequest,
): Promise<import("./types").MarketplaceSource> {
  const res = await authFetch(marketplaceSourcesUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const source = await res.json() as import("./types").MarketplaceSource;
  invalidateMarketplacesCatalogCache();
  return source;
}

export async function updateMarketplaceSource(
  sourceId: string,
  data: import("./types").UpdateMarketplaceSourceRequest,
): Promise<import("./types").MarketplaceSource> {
  const res = await authFetch(marketplaceSourceUrl(sourceId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const source = await res.json() as import("./types").MarketplaceSource;
  invalidateMarketplacesCatalogCache(sourceId);
  return source;
}

export async function deleteMarketplaceSource(sourceId: string): Promise<void> {
  await authFetch(marketplaceSourceUrl(sourceId), { method: "DELETE" });
  invalidateMarketplacesCatalogCache(sourceId);
}

export function marketplacePluginInstallUrl(mcpServerId: string): string {
  return `${marketplaceSourcesUrl()}/plugin-installs/${mcpServerId}`;
}

export async function uninstallPluginInstall(mcpServerId: string): Promise<void> {
  await authFetch(marketplacePluginInstallUrl(mcpServerId), { method: "DELETE" });
  invalidateAbilitiesCatalogCache();
  invalidateMcpServersCatalogCache();
}

export async function installClaudePlugin(
  sourceId: string,
  data: import("./types").InstallClaudePluginRequest,
): Promise<import("./types").InstallClaudePluginResponse> {
  const res = await authFetch(marketplaceClaudePluginInstallUrl(sourceId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const install = await res.json() as import("./types").InstallClaudePluginResponse;
  invalidateAbilitiesCatalogCache();
  invalidateMcpServersCatalogCache();
  return install;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export function packageSourcesUrl(): string {
  return `${API_V1}/packages/sources`;
}

export function packageSourceUrl(sourceId: string): string {
  return `${packageSourcesUrl()}/${sourceId}`;
}

export function packageCatalogUrl(sourceId: string): string {
  return `${API_V1}/packages/catalog?source_id=${encodeURIComponent(sourceId)}`;
}

export function packageInstallsUrl(): string {
  return `${API_V1}/packages/installs`;
}

export function packageInstallUrl(installId: string): string {
  return `${packageInstallsUrl()}/${installId}`;
}

export async function fetchPackageSources(): Promise<import("./types").PackageSource[]> {
  return catalogFetcher(packageSourcesUrl());
}

export async function createPackageSource(
  data: import("./types").CreatePackageSourceRequest,
): Promise<import("./types").PackageSource> {
  const res = await authFetch(packageSourcesUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const source = await res.json() as import("./types").PackageSource;
  invalidatePackageCatalogCache();
  return source;
}

const OFFICIAL_NENJO_PACKAGE_SOURCE = {
  name: "Nenjo Official Packages",
  source_type: "registry" as const,
  adapter: "nenjo_packages" as const,
  metadata: {
    source: {
      kind: "git",
      url: "https://github.com/nenjo-ai/packages.git",
      reference: "feature/platform-knowledge",
      manifest_path: "packages.yaml",
    },
  },
};

function isOfficialNenjoPackageSource(source: import("./types").PackageSource): boolean {
  const metadata = source.metadata ?? {};
  const packageSource = metadata.source as Record<string, unknown> | undefined;
  return (
    source.source_type === "registry" &&
    source.adapter === "nenjo_packages" &&
    packageSource?.kind === OFFICIAL_NENJO_PACKAGE_SOURCE.metadata.source.kind &&
    packageSource?.url === OFFICIAL_NENJO_PACKAGE_SOURCE.metadata.source.url &&
    (packageSource?.manifest_path ?? "packages.yaml") === OFFICIAL_NENJO_PACKAGE_SOURCE.metadata.source.manifest_path
  );
}

export async function ensureOfficialNenjoPackageSource(): Promise<import("./types").PackageSource> {
  const existing = (await fetchPackageSources()).find(isOfficialNenjoPackageSource);
  if (existing) {
    if (existing.status !== "active") {
      return updatePackageSource(existing.id, {
        status: "active",
        metadata: {
          ...existing.metadata,
          ...OFFICIAL_NENJO_PACKAGE_SOURCE.metadata,
        },
      });
    }
    return existing;
  }

  try {
    return await createPackageSource(OFFICIAL_NENJO_PACKAGE_SOURCE);
  } catch (error) {
    invalidatePackageCatalogCache();
    const retry = (await fetchPackageSources()).find(isOfficialNenjoPackageSource);
    if (retry) return retry;
    throw error;
  }
}

export async function updatePackageSource(
  sourceId: string,
  data: import("./types").UpdatePackageSourceRequest,
): Promise<import("./types").PackageSource> {
  const res = await authFetch(packageSourceUrl(sourceId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const source = await res.json() as import("./types").PackageSource;
  invalidatePackageCatalogCache(sourceId);
  return source;
}

export async function deletePackageSource(sourceId: string): Promise<void> {
  await authFetch(packageSourceUrl(sourceId), { method: "DELETE" });
  invalidatePackageCatalogCache(sourceId);
}

export async function installPackage(
  data: import("./types").InstallPackageRequest,
): Promise<import("./types").PackageInstallDetail> {
  const res = await authFetch(`${API_V1}/packages/install`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  const install = await res.json() as import("./types").PackageInstallDetail;
  invalidatePackageCatalogCache(data.source_id);
  invalidateKnowledgeCatalogCache();
  invalidateAbilitiesCatalogCache();
  invalidateAgentsCatalogCache();
  return install;
}

export async function installOfficialNenjoPackages(): Promise<void> {
  const source = await ensureOfficialNenjoPackageSource();
  await installPackage({
    source_id: source.id,
    path: "nenjo/core.package.yaml",
  });
  await installPackage({
    source_id: source.id,
    path: "nenjo/nenji.package.yaml",
  });
}

export async function updateKnowledgePack(
  packId: string,
  data: Partial<Pick<import("./types").KnowledgePack, "name" | "slug" | "description" | "status">>,
): Promise<import("./types").KnowledgePack> {
  const res = await authFetch(knowledgePackUrl(packId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  const pack = await res.json() as import("./types").KnowledgePack;
  invalidateKnowledgeCatalogCache(packId);
  return pack;
}

export async function deleteKnowledgePack(packId: string): Promise<void> {
  await authFetch(knowledgePackUrl(packId), { method: "DELETE" });
  invalidateKnowledgeCatalogCache(packId);
}

export async function fetchKnowledgeItems(
  packId: string,
): Promise<import("./types").KnowledgeItem[]> {
  return catalogFetcher(knowledgeItemsUrl(packId));
}

export async function uploadKnowledgeItem(
  packId: string,
  file: File,
  metadata?: Partial<Pick<import("./types").KnowledgeItem, "slug" | "path" | "title" | "kind" | "authority" | "summary" | "status" | "tags" | "aliases" | "keywords">>,
): Promise<import("./types").KnowledgeItem> {
  if (file.size > 20 * 1024 * 1024) {
    throw new ApiError("Knowledge items are limited to 20 MB.", 400);
  }
  if (!isTextDocumentFile(file)) {
    throw new ApiError(
      "Browser knowledge uploads must be text documents so they can be encrypted before upload.",
      400,
    );
  }
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) {
    throw new ApiError("An active org is required before uploading knowledge items", 400);
  }
  const encryptedPayload = await encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: crypto.randomUUID(),
    objectType: "manifest.document.content",
    plaintext: JSON.stringify(await file.text()),
  });
  if (!encryptedPayload) {
    throw new ApiError(
      "Shared document encryption is not available on this device for the current org",
      409,
    );
  }
  const uploadFile = new File([JSON.stringify(encryptedPayload)], file.name, {
    type: file.type || "text/plain",
  });

  const form = new FormData();
  form.append("file", uploadFile, file.name);
  form.append("encrypted_payload", JSON.stringify(encryptedPayload));

  const appendOptional = (key: string, value: string | undefined | null) => {
    const trimmed = value?.trim();
    if (trimmed) {
      form.append(key, trimmed);
    }
  };
  appendOptional("slug", metadata?.slug);
  appendOptional("path", metadata?.path);
  appendOptional("title", metadata?.title);
  appendOptional("kind", metadata?.kind);
  appendOptional("authority", metadata?.authority);
  appendOptional("summary", metadata?.summary);
  appendOptional("status", metadata?.status);
  if (metadata?.tags?.length) {
    form.append("tags", JSON.stringify(metadata.tags));
  }
  if (metadata?.aliases?.length) {
    form.append("aliases", JSON.stringify(metadata.aliases));
  }
  if (metadata?.keywords?.length) {
    form.append("keywords", JSON.stringify(metadata.keywords));
  }

  const res = await authFetch(knowledgeItemsUrl(packId), {
    method: "POST",
    body: form,
  });
  const item = await res.json() as import("./types").KnowledgeItem;
  invalidateKnowledgeCatalogCache(packId);
  return item;
}

export async function createKnowledgeItem(
  packId: string,
): Promise<import("./types").KnowledgeItem> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = "Untitled knowledge";
  const slug = `untitled-${timestamp}-${suffix}`.toLowerCase();
  const filename = `${slug}.md`;
  const file = new File([`# ${title}\n\n`], filename, {
    type: "text/markdown",
  });

  return uploadKnowledgeItem(packId, file, {
    slug,
    title,
    kind: "guide",
    authority: "draft",
    status: "draft",
  });
}

export async function deleteKnowledgeItem(
  packId: string,
  itemId: string,
): Promise<void> {
  await authFetch(knowledgeItemUrl(packId, itemId), {
    method: "DELETE",
  });
  invalidateKnowledgeItemCache(packId, itemId);
}

export function downloadKnowledgeItemUrl(
  packId: string,
  itemId: string,
): string {
  return knowledgeItemUrl(packId, itemId);
}

export function knowledgeItemContentUrl(
  packId: string,
  itemId: string,
): string {
  return `${knowledgeItemUrl(packId, itemId)}/content`;
}

export async function fetchKnowledgeItemContent(
  packId: string,
  itemId: string,
): Promise<DocumentContentResult> {
  const url = knowledgeItemContentUrl(packId, itemId);
  const cached = readDocumentContentCache(url);
  if (cached) return cached;

  const response = await fetcher<{
    content?: string | null;
    filename: string;
    content_type: string;
    size_bytes: number;
    encrypted_payload?: EncryptedPayload | null;
  }>(url);

  if (response.encrypted_payload) {
    const plaintext = await decryptContentPayload(response.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Shared document content could not be decrypted on this device", 409);
    }

    try {
      const result = {
        content: JSON.parse(plaintext) as string,
        filename: response.filename,
        content_type: response.content_type,
        size_bytes: response.size_bytes,
      };
      writeDocumentContentCache(url, result);
      return result;
    } catch (error) {
      console.warn("Failed to parse decrypted knowledge content payload", {
        itemId,
        objectId: response.encrypted_payload.object_id,
        error,
      });
      throw new ApiError("Shared knowledge content was not encoded correctly", 500);
    }
  }

  const result = {
    content: response.content ?? "",
    filename: response.filename,
    content_type: response.content_type,
    size_bytes: response.size_bytes,
  };
  writeDocumentContentCache(url, result);
  return result;
}

export async function updateKnowledgeItemContent(
  packId: string,
  itemId: string,
  content: string,
): Promise<import("./types").KnowledgeItem> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) {
    throw new ApiError("An active org is required before updating shared knowledge", 400);
  }
  const encryptedPayload = await encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: itemId,
    objectType: "manifest.document.content",
    plaintext: JSON.stringify(content),
  });
  if (!encryptedPayload) {
    throw new ApiError(
      "Shared document encryption is not available on this device for the current org",
      409,
    );
  }
  const res = await authFetch(knowledgeItemContentUrl(packId, itemId), {
    method: "PUT",
    body: JSON.stringify({ encrypted_payload: encryptedPayload }),
  });

  const item = await res.json() as import("./types").KnowledgeItem;
  invalidateKnowledgeItemCache(packId, itemId);
  return item;
}

function isTextDocumentFile(file: File): boolean {
  const contentType = file.type.toLowerCase();
  if (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml"
  ) {
    return true;
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "xml",
    "yaml",
    "yml",
    "toml",
    "csv",
    "log",
    "rst",
    "adoc",
  ].includes(ext);
}

export async function updateKnowledgeItemMetadata(
  packId: string,
  itemId: string,
  data: Partial<Pick<import("./types").KnowledgeItem, "filename" | "path" | "title" | "kind" | "authority" | "summary" | "status" | "tags" | "aliases" | "keywords">>,
): Promise<import("./types").KnowledgeItem> {
  const res = await authFetch(knowledgeItemUrl(packId, itemId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  const item = await res.json() as import("./types").KnowledgeItem;
  invalidateKnowledgeItemCache(packId, itemId);
  return item;
}

export function knowledgeItemEdgesUrl(packId: string, itemId: string): string {
  return `${knowledgeItemUrl(packId, itemId)}/edges`;
}

export async function fetchKnowledgeItemEdges(
  packId: string,
  itemId: string,
): Promise<import("./types").KnowledgeItemEdge[]> {
  return catalogFetcher(knowledgeItemEdgesUrl(packId, itemId));
}

export async function createKnowledgeItemEdge(
  packId: string,
  itemId: string,
  data: Pick<import("./types").KnowledgeItemEdge, "edge_type"> & { target_item_id: string; note?: string | null },
): Promise<import("./types").KnowledgeItemEdge> {
  const res = await authFetch(knowledgeItemEdgesUrl(packId, itemId), {
    method: "POST",
    body: JSON.stringify(data),
  });

  const edge = await res.json() as import("./types").KnowledgeItemEdge;
  invalidateKnowledgeCatalogCache(packId);
  clearCatalogCache(knowledgeItemEdgesUrl(packId, itemId));
  clearCatalogCache(knowledgeItemEdgesUrl(packId, edge.target_item_id));
  return edge;
}

export async function deleteKnowledgeItemEdge(
  packId: string,
  itemId: string,
  edgeId: string,
): Promise<void> {
  await authFetch(`${knowledgeItemEdgesUrl(packId, itemId)}/${edgeId}`, {
    method: "DELETE",
  });
  invalidateKnowledgeCatalogCache(packId);
  clearCatalogCache(knowledgeItemEdgesUrl(packId, itemId));
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
  org_name?: string | null;
  org_role?: string | null;
  org_scopes?: string[] | null;
  onboarded?: boolean;
}> {
  return fetcher(authMeUrl());
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export function orgsUrl(): string {
  return `${API_V1}/orgs`;
}

export function currentOrgUrl(): string {
  return `${API_V1}/orgs/current`;
}

export function bootstrapStatusUrl(): string {
  return `${API_V1}/auth/bootstrap-status`;
}

export function orgMembersUrl(orgId: string): string {
  return `${API_V1}/orgs/${orgId}/members`;
}

export function orgMemberUrl(orgId: string, userId: string): string {
  return `${API_V1}/orgs/${orgId}/members/${userId}`;
}

export function orgInvitationsUrl(orgId: string): string {
  return `${API_V1}/orgs/${orgId}/invitations`;
}

export function orgInvitationUrl(orgId: string, invitationId: string): string {
  return `${API_V1}/orgs/${orgId}/invitations/${invitationId}`;
}

export function orgInvitationPreviewUrl(token: string): string {
  return `${API_V1}/orgs/invitations/${token}`;
}

export function orgInvitationAcceptUrl(token: string): string {
  return `${API_V1}/orgs/invitations/${token}/accept`;
}

export function orgInvitationResendUrl(orgId: string, invitationId: string): string {
  return `${orgInvitationUrl(orgId, invitationId)}/resend`;
}

export function orgContentKeyRequestsUrl(orgId: string): string {
  return `${API_V1}/orgs/${orgId}/org-content-key-requests`;
}

export function orgContentKeyRequestApproveUrl(orgId: string, requestId: string): string {
  return `${orgContentKeyRequestsUrl(orgId)}/${requestId}/approve`;
}

export async function updateOrgMember(
  orgId: string,
  userId: string,
  data: { role: string; scopes?: string[] },
): Promise<import("./types").OrgMember> {
  const res = await authFetch(orgMemberUrl(orgId, userId), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").OrgMember>;
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  await authFetch(orgMemberUrl(orgId, userId), { method: "DELETE" });
}

export async function createOrgInvitation(
  orgId: string,
  data: { email: string; role: string; scopes?: string[]; expires_in_days?: number },
): Promise<import("./types").OrgInvitation & { invite_token: string }> {
  const res = await authFetch(orgInvitationsUrl(orgId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").OrgInvitation & { invite_token: string }>;
}

export async function revokeOrgInvitation(orgId: string, invitationId: string): Promise<void> {
  await authFetch(orgInvitationUrl(orgId, invitationId), { method: "DELETE" });
}

export async function resendOrgInvitation(
  orgId: string,
  invitationId: string,
): Promise<import("./types").OrgInvitation & { invite_token: string }> {
  const res = await authFetch(orgInvitationResendUrl(orgId, invitationId), {
    method: "POST",
  });
  return res.json() as Promise<import("./types").OrgInvitation & { invite_token: string }>;
}

export async function updateCurrentOrg(
  data: { name: string },
): Promise<import("./types").CurrentOrg> {
  const res = await authFetch(currentOrgUrl(), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").CurrentOrg>;
}

export async function createOrganization(
  data: { name: string },
): Promise<import("./types").CurrentOrg> {
  const res = await authFetch(orgsUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json() as Promise<import("./types").CurrentOrg>;
}

export async function fetchOrgInvitationPreview(
  token: string,
): Promise<import("./types").OrgInvitationPreview> {
  return fetcher(orgInvitationPreviewUrl(token));
}

export async function acceptOrgInvitation(
  token: string,
): Promise<import("./types").CurrentOrg> {
  const res = await authFetch(orgInvitationAcceptUrl(token), { method: "POST" });
  return res.json() as Promise<import("./types").CurrentOrg>;
}

export async function fetchOrgContentKeyRequests(
  orgId: string,
): Promise<import("./types").OrgContentKeyAccessRequest[]> {
  return fetcher<import("./types").OrgContentKeyAccessRequest[]>(orgContentKeyRequestsUrl(orgId));
}

export async function approveOrgContentKeyRequest(
  orgId: string,
  requestId: string,
  wrappedOck: import("./types").WrappedOrgContentKey,
): Promise<import("./types").OrgContentKeyAccessRequest> {
  const res = await authFetch(orgContentKeyRequestApproveUrl(orgId, requestId), {
    method: "POST",
    body: JSON.stringify({ wrapped_ock: wrappedOck }),
  });
  return res.json() as Promise<import("./types").OrgContentKeyAccessRequest>;
}

export async function fetchBootstrapStatus(): Promise<import("./types").BootstrapStatus> {
  return fetcher<import("./types").BootstrapStatus>(bootstrapStatusUrl());
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

export function workerEnrollmentUrl(): string {
  return `${API_V1}/workers/enrollment`;
}

export function workerApprovalKeyUrl(): string {
  return `${API_V1}/workers/approval-key`;
}

export function recoveryBundleUrl(): string {
  return `${API_V1}/content-encryption/recovery-bundle`;
}

export function trustedDevicesUrl(): string {
  return `${API_V1}/content-encryption/devices`;
}

export function trustedDeviceUrl(deviceId: string): string {
  return `${API_V1}/content-encryption/devices/${deviceId}`;
}

export function deviceEnrollmentsUrl(): string {
  return `${API_V1}/content-encryption/device-enrollments`;
}

export function deviceEnrollmentUrl(deviceId: string): string {
  return `${API_V1}/content-encryption/device-enrollments/${deviceId}`;
}

export function deviceEnrollmentApproveUrl(deviceId: string): string {
  return `${API_V1}/content-encryption/device-enrollments/${deviceId}/approve`;
}

export function currentOrgContentKeyUrl(): string {
  return `${API_V1}/content-encryption/org-content-key`;
}

export function currentOrgContentKeyRecoveryUrl(): string {
  return `${API_V1}/content-encryption/org-content-key/recovery`;
}

export function currentOrgContentKeyRequestUrl(deviceId: string): string {
  return `${API_V1}/content-encryption/org-content-key/request/${deviceId}`;
}

export function workerEnrollmentDetailUrl(apiKeyId: string): string {
  return `${API_V1}/workers/enrollment/${apiKeyId}`;
}

export function workerEnrollmentApproveUrl(apiKeyId: string): string {
  return `${API_V1}/workers/enrollment/${apiKeyId}/approve`;
}

export async function fetchWorkerStatus(): Promise<import("./types").WorkerStatus> {
  return fetcher<import("./types").WorkerStatus>(workerStatusUrl());
}

export async function pingWorker(): Promise<import("./types").WorkerStatus> {
  const res = await authFetch(workerPingUrl(), { method: "POST" });
  return res.json() as Promise<import("./types").WorkerStatus>;
}

export async function fetchWorkerApprovalKey(): Promise<import("./types").WorkerApprovalKeyResponse> {
  return fetcher<import("./types").WorkerApprovalKeyResponse>(workerApprovalKeyUrl());
}

export async function putWorkerApprovalKey(publicKey: string): Promise<import("./types").WorkerApprovalKeyResponse> {
  const res = await authFetch(workerApprovalKeyUrl(), {
    method: "PUT",
    body: JSON.stringify({ public_key: publicKey }),
  });
  return res.json() as Promise<import("./types").WorkerApprovalKeyResponse>;
}

export async function deleteWorkerApprovalKey(): Promise<void> {
  await authFetch(workerApprovalKeyUrl(), { method: "DELETE" });
}

export async function fetchRecoveryBundle(): Promise<import("./types").RecoveryBundleResponse> {
  return fetcher<import("./types").RecoveryBundleResponse>(recoveryBundleUrl());
}

export async function putRecoveryBundle(
  bundle: import("./types").RecoveryBundlePayload,
): Promise<import("./types").RecoveryBundleResponse> {
  const res = await authFetch(recoveryBundleUrl(), {
    method: "PUT",
    body: JSON.stringify(bundle),
  });
  return res.json() as Promise<import("./types").RecoveryBundleResponse>;
}

export async function deleteRecoveryBundle(): Promise<void> {
  await authFetch(recoveryBundleUrl(), { method: "DELETE" });
}

export async function listTrustedDevices(): Promise<import("./types").TrustedDevicePayload[]> {
  return fetcher<import("./types").TrustedDevicePayload[]>(trustedDevicesUrl());
}

export async function upsertTrustedDevice(
  device: import("./types").TrustedDevicePayload,
): Promise<import("./types").TrustedDevicePayload> {
  const res = await authFetch(trustedDevicesUrl(), {
    method: "POST",
    body: JSON.stringify(device),
  });
  return res.json() as Promise<import("./types").TrustedDevicePayload>;
}

export async function deleteTrustedDevice(deviceId: string): Promise<void> {
  await authFetch(trustedDeviceUrl(deviceId), { method: "DELETE" });
}

export async function listDeviceEnrollments(): Promise<import("./types").DeviceEnrollmentPayload[]> {
  return fetcher<import("./types").DeviceEnrollmentPayload[]>(deviceEnrollmentsUrl());
}

export async function registerDeviceEnrollment(
  device: import("./types").DeviceEnrollmentPayload,
): Promise<import("./types").DeviceEnrollmentPayload> {
  const res = await authFetch(deviceEnrollmentsUrl(), {
    method: "POST",
    body: JSON.stringify(device),
  });
  return res.json() as Promise<import("./types").DeviceEnrollmentPayload>;
}

export async function fetchDeviceEnrollment(
  deviceId: string,
): Promise<import("./types").DeviceEnrollmentPayload> {
  return fetcher<import("./types").DeviceEnrollmentPayload>(deviceEnrollmentUrl(deviceId));
}

export async function approveDeviceEnrollment(
  deviceId: string,
  body: import("./types").ApproveDeviceEnrollmentRequest,
): Promise<import("./types").DeviceEnrollmentPayload> {
  const res = await authFetch(deviceEnrollmentApproveUrl(deviceId), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<import("./types").DeviceEnrollmentPayload>;
}

export async function deleteDeviceEnrollment(deviceId: string): Promise<void> {
  await authFetch(deviceEnrollmentUrl(deviceId), { method: "DELETE" });
}

export async function fetchCurrentOrgContentKeyStatus(): Promise<import("./types").CurrentOrgContentKeyStatus> {
  return fetcher<import("./types").CurrentOrgContentKeyStatus>(currentOrgContentKeyUrl());
}

export async function bootstrapCurrentOrgContentKey(
  body: import("./types").BootstrapCurrentOrgContentKeyRequest,
): Promise<import("./types").CurrentOrgContentKeyStatus> {
  const res = await authFetch(currentOrgContentKeyUrl(), {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<import("./types").CurrentOrgContentKeyStatus>;
}

export async function fetchCurrentOrgContentKeyRecovery(): Promise<import("./types").CurrentOrgContentKeyRecovery> {
  return fetcher<import("./types").CurrentOrgContentKeyRecovery>(currentOrgContentKeyRecoveryUrl());
}

export async function requestCurrentOrgContentKeyAccess(
  deviceId: string,
): Promise<import("./types").OrgContentKeyAccessRequestStatus> {
  const res = await authFetch(`${API_V1}/content-encryption/org-content-key/request`, {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json() as Promise<import("./types").OrgContentKeyAccessRequestStatus>;
}

export async function fetchCurrentOrgContentKeyAccessRequest(
  deviceId: string,
): Promise<import("./types").OrgContentKeyAccessRequestStatus> {
  return fetcher<import("./types").OrgContentKeyAccessRequestStatus>(currentOrgContentKeyRequestUrl(deviceId));
}

export async function createWorkerEnrollment(
  body: import("./types").WorkerEnrollmentRequest,
): Promise<import("./types").WorkerEnrollmentStatusResponse> {
  const res = await authFetch(workerEnrollmentUrl(), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<import("./types").WorkerEnrollmentStatusResponse>;
}

export async function listWorkerEnrollments(): Promise<import("./types").WorkerEnrollmentStatusResponse[]> {
  return fetcher<import("./types").WorkerEnrollmentStatusResponse[]>(
    workerEnrollmentUrl(),
  );
}

export async function fetchWorkerEnrollment(
  apiKeyId: string,
): Promise<import("./types").WorkerEnrollmentStatusResponse> {
  return fetcher<import("./types").WorkerEnrollmentStatusResponse>(
    workerEnrollmentDetailUrl(apiKeyId),
  );
}

export async function approveWorkerEnrollment(
  apiKeyId: string,
  body: import("./types").ApproveWorkerEnrollmentRequest,
): Promise<import("./types").WorkerEnrollmentStatusResponse> {
  const res = await authFetch(workerEnrollmentApproveUrl(apiKeyId), {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<import("./types").WorkerEnrollmentStatusResponse>;
}

export async function deleteWorkerEnrollment(apiKeyId: string): Promise<void> {
  await authFetch(workerEnrollmentDetailUrl(apiKeyId), { method: "DELETE" });
}

export async function listWorkerAccountKeyTargets(): Promise<import("./types").WorkerAccountKeyTarget[]> {
  return fetcher<import("./types").WorkerAccountKeyTarget[]>(
    `${workerEnrollmentUrl().replace(/\/enrollment$/, "")}/account-key-targets`,
  );
}

export async function syncWorkerAccountKeys(
  body: { workers: Array<{ api_key_id: string; wrapped_ack: import("./types").WrappedAccountContentKey }> },
): Promise<void> {
  await authFetch(`${workerEnrollmentUrl().replace(/\/enrollment$/, "")}/account-key/sync`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function syncWorkerAccountKey(
  apiKeyId: string,
  body: { wrapped_ack: import("./types").WrappedAccountContentKey },
): Promise<void> {
  await authFetch(`${workerEnrollmentDetailUrl(apiKeyId)}/account-key`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  return catalogFetcher(routinesUrl());
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
  invalidateRoutinesCatalogCache();
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
  invalidateRoutinesCatalogCache();
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
  invalidateRoutinesCatalogCache();
  return res.json();
}

export async function deleteRoutine(
  routineId: string,
): Promise<void> {
  await authFetch(routineUrl(routineId), { method: "DELETE" });
  invalidateRoutinesCatalogCache();
}

export async function createRoutineStep(
  routineId: string,
  data: import("./types").CreateStepRequest,
): Promise<import("./types").RoutineStep> {
  const res = await authFetch(routineStepsUrl(routineId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidateRoutinesCatalogCache();
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
  invalidateRoutinesCatalogCache();
  return res.json();
}

export async function deleteRoutineStep(
  routineId: string,
  stepId: string,
): Promise<void> {
  await authFetch(routineStepUrl(routineId, stepId), {
    method: "DELETE",
  });
  invalidateRoutinesCatalogCache();
}

export async function createRoutineEdge(
  routineId: string,
  data: import("./types").CreateEdgeRequest,
): Promise<import("./types").RoutineEdge> {
  const res = await authFetch(routineEdgesUrl(routineId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidateRoutinesCatalogCache();
  return res.json();
}

export async function deleteRoutineEdge(
  routineId: string,
  edgeId: string,
): Promise<void> {
  await authFetch(routineEdgeUrl(routineId, edgeId), {
    method: "DELETE",
  });
  invalidateRoutinesCatalogCache();
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
  return catalogFetcher<CouncilDetail[]>(councilsUrl());
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
  invalidateCouncilsCatalogCache();
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
  invalidateCouncilsCatalogCache();
  return res.json() as Promise<CouncilDetail>;
}

export async function deleteCouncil(councilId: string): Promise<void> {
  await authFetch(councilUrl(councilId), { method: "DELETE" });
  invalidateCouncilsCatalogCache();
}

export async function addCouncilMember(
  councilId: string,
  data: AddCouncilMemberRequest,
): Promise<CouncilMember> {
  const res = await authFetch(councilMembersUrl(councilId), {
    method: "POST",
    body: JSON.stringify(data),
  });
  invalidateCouncilsCatalogCache();
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
  invalidateCouncilsCatalogCache();
  return res.json() as Promise<CouncilMember>;
}

export async function removeCouncilMember(
  councilId: string,
  memberId: string,
): Promise<void> {
  await authFetch(councilMemberUrl(councilId, memberId), {
    method: "DELETE",
  });
  invalidateCouncilsCatalogCache();
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

async function encryptAgentPromptConfig(
  agentId: string,
  promptConfig: PromptConfig,
): Promise<EncryptedPayload | null> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) return null;

  return encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: agentId,
    objectType: "manifest.agent.prompt",
    plaintext: JSON.stringify(promptConfig),
  });
}

async function encryptAbilityPromptConfig(
  abilityId: string,
  prompt: string,
): Promise<EncryptedPayload | null> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) return null;

  return encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: abilityId,
    objectType: "manifest.ability.prompt",
    plaintext: JSON.stringify({ developer_prompt: prompt }),
  });
}

async function encryptDomainPromptConfig(
  domainId: string,
  promptConfig: DomainManifest["prompt"],
): Promise<EncryptedPayload | null> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) return null;

  return encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: domainId,
    objectType: "manifest.domain.prompt",
    plaintext: JSON.stringify(promptConfig),
  });
}

function requireEncryptedPayload(
  payload: EncryptedPayload | null,
  label: string,
): EncryptedPayload {
  if (!payload) {
    throw new ApiError(`${label} could not be encrypted`, 409);
  }
  return payload;
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.account_id === "string" &&
    typeof record.object_id === "string" &&
    typeof record.object_type === "string" &&
    typeof record.algorithm === "string" &&
    typeof record.nonce === "string" &&
    typeof record.ciphertext === "string"
  );
}

async function encryptOrgJsonPayload(params: {
  objectId: string;
  objectType: string;
  value: unknown;
  label: string;
}): Promise<EncryptedPayload> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) {
    throw new ApiError(`${params.label} requires an active org`, 400);
  }

  return requireEncryptedPayload(
    await encryptOrgContentPayload({
      orgId: currentUser.org_id,
      objectId: params.objectId,
      objectType: params.objectType,
      plaintext: JSON.stringify(params.value),
    }),
    params.label,
  );
}

async function decryptJsonPayload<T>(
  payload: unknown,
  fallback: T,
  label: string,
): Promise<T> {
  if (!isEncryptedPayload(payload)) return fallback;
  try {
    const plaintext = await decryptContentPayload(payload);
    if (!plaintext) return fallback;
    return JSON.parse(plaintext) as T;
  } catch (error) {
    console.warn(`Failed to decrypt ${label}`, {
      objectId: payload.object_id,
      error,
    });
    return fallback;
  }
}

async function encryptContextBlockTemplate(
  contextBlockId: string,
  template: string,
): Promise<EncryptedPayload | null> {
  const currentUser = await fetchCurrentUser();
  if (!currentUser.org_id) return null;

  return encryptOrgContentPayload({
    orgId: currentUser.org_id,
    objectId: contextBlockId,
    objectType: "manifest.context_block.content",
    plaintext: JSON.stringify(template),
  });
}

export async function fetchAgents(): Promise<AgentDefinition[]> {
  return catalogFetcher<AgentDefinition[]>(agentsUrl());
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
  invalidateAgentsCatalogCache();
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
  invalidateAgentsCatalogCache();
  return res.json() as Promise<AgentDefinition>;
}

export async function deleteAgent(agentId: string): Promise<void> {
  await authFetch(agentUrl(agentId), { method: "DELETE" });
  invalidateAgentsCatalogCache();
}

export async function fetchAgentHeartbeat(agentId: string): Promise<AgentHeartbeat | null> {
  return fetcher<AgentHeartbeat | null>(`${agentUrl(agentId)}/heartbeat`);
}

export async function updateAgentHeartbeat(
  agentId: string,
  data: { interval: string; metadata?: Record<string, unknown> },
): Promise<AgentDefinition> {
  const res = await authFetch(`${agentUrl(agentId)}/heartbeat`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  invalidateAgentsCatalogCache();
  return res.json() as Promise<AgentDefinition>;
}

export async function startAgentHeartbeat(agentId: string): Promise<void> {
  await authFetch(`${agentUrl(agentId)}/heartbeat/start`, { method: "POST" });
}

export async function stopAgentHeartbeat(agentId: string): Promise<void> {
  await authFetch(`${agentUrl(agentId)}/heartbeat/stop`, { method: "POST" });
}

export async function triggerAgentHeartbeat(agentId: string): Promise<void> {
  await authFetch(`${agentUrl(agentId)}/heartbeat/trigger`, { method: "POST" });
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
  invalidateAgentsCatalogCache();
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
  const response = await fetcher<PromptConfigResponse>(agentPromptUrl(agentId));
  if (response.encrypted_payload) {
    try {
      const plaintext = await decryptContentPayload(response.encrypted_payload);
      if (!plaintext) {
        throw new Error("Encrypted prompt payload could not be decrypted");
      }
      return JSON.parse(plaintext) as import("./types").PromptConfig;
    } catch (error) {
      console.warn("Failed to decrypt agent prompt config", {
        agentId,
        objectId: response.encrypted_payload.object_id,
        error,
      });
      throw error instanceof Error
        ? error
        : new Error("Failed to decrypt agent prompt config");
    }
  }

  if (response.prompt_config) {
    return response.prompt_config;
  }

  throw new ApiError("Agent prompt is not available in encrypted form yet", 409);
}

export async function updateAgentPrompt(
  agentId: string,
  promptConfig: import("./types").PromptConfig,
): Promise<import("./types").PromptConfig> {
  const encryptedPayload = requireEncryptedPayload(
    await encryptAgentPromptConfig(agentId, promptConfig),
    "Agent prompt",
  );
  const res = await authFetch(agentPromptUrl(agentId), {
    method: "PATCH",
    body: JSON.stringify({
      encrypted_payload: encryptedPayload,
    }),
  });
  invalidateAgentsCatalogCache();
  const response = (await res.json()) as PromptConfigResponse;
  if (response.encrypted_payload) {
    const plaintext = await decryptContentPayload(response.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Updated agent prompt could not be decrypted", 500);
    }
    return JSON.parse(plaintext) as import("./types").PromptConfig;
  }
  if (response.prompt_config) {
    return response.prompt_config;
  }
  throw new ApiError("Updated agent prompt was not returned", 500);
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
  invalidateAgentsCatalogCache();
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
  const projectId = normalizeOptionalProjectId(params?.project_id);
  if (projectId) qs.set("project_id", projectId);
  if (params?.agent_id) qs.set("agent_id", params.agent_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.before) qs.set("before", params.before);
  if (params?.session_id) qs.set("session_id", params.session_id);
  const q = qs.toString();
  return `${API_V1}/chat-messages${q ? `?${q}` : ""}`;
}

export async function fetchChatMessages(
  projectId: string | null | undefined,
  agentId: string,
  opts?: { limit?: number; before?: string; session_id: string },
): Promise<ChatMessagePage> {
  const normalizedProjectId = normalizeOptionalProjectId(projectId);
  return fetcher<ChatMessagePage>(
    chatMessagesUrl({
      ...(normalizedProjectId ? { project_id: normalizedProjectId } : {}),
      agent_id: agentId,
      limit: opts?.limit,
      before: opts?.before,
      session_id: opts?.session_id,
    }),
  );
}

export async function createChatMessage(body: {
  project_id?: string | null;
  agent_id: string;
  sender: string;
  content: string;
  session_id: string;
  idempotency_key?: string;
}): Promise<PersistedChatMessage> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  const res = await authFetch(chatMessagesUrl(), {
    method: "POST",
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
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
  projectId: string | null | undefined,
  agentId: string,
): Promise<ChatSession[]> {
  const qs = new URLSearchParams();
  const normalizedProjectId = normalizeOptionalProjectId(projectId);
  if (normalizedProjectId) qs.set("project_id", normalizedProjectId);
  qs.set("agent_id", agentId);
  return fetcher<ChatSession[]>(`${API_V1}/chat-sessions?${qs.toString()}`);
}

export async function createChatSession(body: {
  project_id?: string | null;
  agent_id: string;
  title?: string;
}): Promise<ChatSession> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  const res = await authFetch(`${API_V1}/chat-sessions`, {
    method: "POST",
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
  });
  return res.json() as Promise<ChatSession>;
}

export async function createChatStream(
  body: ChatStreamRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  const headers = await authHeaders({
    Accept: "text/event-stream",
  });
  const res = await fetch(`${API_V1}/chat-streams`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res;
}

export function chatStreamsUrl(): string {
  return `${API_V1}/chat-streams`;
}

export async function createExecutionEventStream(
  signal?: AbortSignal,
): Promise<Response> {
  const headers = await authHeaders({
    Accept: "text/event-stream",
  });
  const res = await fetch(`${API_V1}/execution-streams`, {
    method: "GET",
    headers,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(text, res.status);
  }
  return res;
}

export async function cancelChat(body: ChatCancelRequest): Promise<void> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  await authFetch(`${API_V1}/chat-commands/cancel`, {
    method: "POST",
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
  });
}

export async function exitChatDomain(body: ChatDomainExitRequest): Promise<void> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  await authFetch(`${API_V1}/chat-commands/domain-exit`, {
    method: "POST",
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
  });
}

export async function notifyChatSessionDelete(
  body: ChatSessionDeleteRequest,
): Promise<void> {
  const projectId = normalizeOptionalProjectId(body.project_id);
  await authFetch(`${API_V1}/chat-commands/session-delete`, {
    method: "POST",
    body: JSON.stringify({
      ...body,
      project_id: projectId,
    }),
  });
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

export const pushConfigUrl = () => `${API_V1}/push-notifications/config`;
export const pushSubscriptionsUrl = () => `${API_V1}/push-notifications/subscriptions`;

export async function fetchPushConfig(): Promise<PushConfigResponse> {
  return fetcher<PushConfigResponse>(pushConfigUrl());
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return fetcher<PushSubscriptionRecord[]>(pushSubscriptionsUrl());
}

export async function upsertPushSubscription(
  subscription: PushSubscriptionJSON,
  deviceLabel?: string,
): Promise<PushSubscriptionRecord> {
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new ApiError("Push subscription is missing encryption keys", 400);
  }
  const res = await authFetch(pushSubscriptionsUrl(), {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      device_label: deviceLabel ?? null,
    }),
  });
  return res.json() as Promise<PushSubscriptionRecord>;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const encoded = btoa(endpoint)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  await authFetch(`${pushSubscriptionsUrl()}/${encoded}`, { method: "DELETE" });
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

export function domainPromptUrl(id: string): string {
  return `${domainUrl(id)}/prompt`;
}

export async function fetchDomains(): Promise<Domain[]> {
  return catalogFetcher<Domain[]>(domainsUrl());
}

export async function fetchDomain(id: string): Promise<Domain> {
  const res = await authFetch(domainUrl(id));
  return res.json() as Promise<Domain>;
}

export async function fetchDomainManifest(id: string): Promise<DomainManifest> {
  const [domainRes, promptRes] = await Promise.all([
    authFetch(domainUrl(id)),
    authFetch(domainPromptUrl(id)),
  ]);
  const domain = await domainRes.json() as {
    platform_scopes?: string[];
    ability_ids?: string[];
    mcp_server_ids?: string[];
  };
  const promptData = await promptRes.json() as {
    prompt_config?: DomainManifest["prompt"];
    encrypted_payload?: EncryptedPayload | null;
  };
  let prompt = promptData.prompt_config ?? {};
  if (promptData.encrypted_payload) {
    const plaintext = await decryptContentPayload(promptData.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Domain prompt payload could not be decrypted", 409);
    }
    prompt = JSON.parse(plaintext) as DomainManifest["prompt"];
  }
  return {
    prompt,
    platform_scopes: domain.platform_scopes ?? [],
    ability_ids: domain.ability_ids ?? [],
    mcp_server_ids: domain.mcp_server_ids ?? [],
  };
}

export async function createDomain(data: CreateDomainRequest): Promise<Domain> {
  const manifest = data.manifest;
  const res = await authFetch(domainsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      path: data.path ?? "",
      display_name: data.display_name,
      description: data.description,
      command: data.command,
      platform_scopes: manifest?.platform_scopes,
      ability_ids: manifest?.ability_ids,
      mcp_server_ids: manifest?.mcp_server_ids,
    }),
  });
  const domain = await res.json() as Domain;
  if (manifest?.prompt) {
    const promptEncryptedPayload = requireEncryptedPayload(
      await encryptDomainPromptConfig(domain.id, manifest.prompt),
      "Domain prompt",
    );
    await authFetch(domainPromptUrl(domain.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypted_payload: promptEncryptedPayload,
      }),
    });
  }
  invalidateDomainsCatalogCache();
  return domain;
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
  invalidateDomainsCatalogCache();
  return res.json() as Promise<Domain>;
}

export async function updateDomainManifest(
  id: string,
  manifest: DomainManifest,
): Promise<DomainManifest> {
  const encryptedPayload = requireEncryptedPayload(
    await encryptDomainPromptConfig(id, manifest.prompt),
    "Domain prompt",
  );
  const res = await authFetch(domainPromptUrl(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      encrypted_payload: encryptedPayload,
    }),
  });
  const data = await res.json() as {
    prompt_config?: DomainManifest["prompt"];
    encrypted_payload?: EncryptedPayload | null;
  };
  let prompt = data.prompt_config ?? manifest.prompt;
  if (data.encrypted_payload) {
    const plaintext = await decryptContentPayload(data.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Updated domain prompt could not be decrypted", 500);
    }
    prompt = JSON.parse(plaintext) as DomainManifest["prompt"];
  }
  invalidateDomainsCatalogCache();
  return {
    ...manifest,
    prompt,
  };
}

export async function deleteDomain(id: string): Promise<void> {
  await authFetch(domainUrl(id), { method: "DELETE" });
  invalidateDomainsCatalogCache();
}

export async function moveDomain(id: string, path: string): Promise<Domain> {
  const res = await authFetch(`${domainUrl(id)}/move`, { method: "PATCH", body: JSON.stringify({ path }) });
  invalidateDomainsCatalogCache();
  return res.json() as Promise<Domain>;
}

export async function deleteDomainFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/domains/folders/delete`, { method: "DELETE", body: JSON.stringify({ path }) });
  invalidateDomainsCatalogCache();
}

export async function renameDomainFolder(oldPath: string, newPath: string): Promise<void> {
  await authFetch(`${API_V1}/domains/folders/rename`, { method: "PATCH", body: JSON.stringify({ old_path: oldPath, new_path: newPath }) });
  invalidateDomainsCatalogCache();
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
  projectId: string | null | undefined,
  agentId: string,
): Promise<DomainSession> {
  const normalizedProjectId = normalizeOptionalProjectId(projectId);
  const res = await authFetch(`${domainUrl(domainId)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: normalizedProjectId, agent_id: agentId }),
  });
  return res.json() as Promise<DomainSession>;
}

export async function fetchDomainSession(
  sessionId: string,
): Promise<DomainSession> {
  const res = await authFetch(`${API_V1}/domains/sessions/${sessionId}`);
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
  projectId: string | null | undefined,
  agentId: string,
): Promise<DomainSession | null> {
  const qs = new URLSearchParams({ agent_id: agentId });
  const normalizedProjectId = normalizeOptionalProjectId(projectId);
  if (normalizedProjectId) qs.set("project_id", normalizedProjectId);
  const res = await authFetch(
    `${API_V1}/domains/sessions/active?${qs.toString()}`,
  );
  if (res.status === 204) return null;
  return res.json() as Promise<DomainSession>;
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
  return catalogFetcher(mcpServersUrl());
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
  invalidateMcpServersCatalogCache();
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
  invalidateMcpServersCatalogCache();
  return res.json() as Promise<import("./types").McpServer>;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await authFetch(mcpServerUrl(id), { method: "DELETE" });
  invalidateMcpServersCatalogCache();
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

export function contextBlockContentUrl(id: string): string {
  return `${API_V1}/context-blocks/${id}/content`;
}

export async function fetchContextBlocks(): Promise<import("./types").ContextBlock[]> {
  return catalogFetcher(contextBlocksUrl());
}

export async function createContextBlock(
  data: import("./types").CreateContextBlockRequest,
): Promise<import("./types").ContextBlock> {
  const { template, ...createData } = data;
  const res = await authFetch(contextBlocksUrl(), {
    method: "POST",
    body: JSON.stringify({
      ...createData,
      template: "",
    }),
  });
  const block = await res.json() as import("./types").ContextBlock;
  if (template) {
    const encryptedPayload = requireEncryptedPayload(
      await encryptContextBlockTemplate(block.id, template),
      "Context block content",
    );
    await authFetch(contextBlockContentUrl(block.id), {
      method: "PATCH",
      body: JSON.stringify({
        encrypted_payload: encryptedPayload,
      }),
    });
  }
  invalidateContextBlocksCatalogCache();
  return block;
}

export async function updateContextBlock(
  id: string,
  data: import("./types").UpdateContextBlockRequest,
): Promise<import("./types").ContextBlock> {
  const res = await authFetch(contextBlockUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidateContextBlocksCatalogCache();
  return res.json() as Promise<import("./types").ContextBlock>;
}

export async function fetchContextBlockContent(
  id: string,
): Promise<{ template?: string }> {
  const response = await fetcher<{
    template?: string;
    encrypted_payload?: EncryptedPayload | null;
  }>(contextBlockContentUrl(id));
  if (response.encrypted_payload) {
    const plaintext = await decryptContentPayload(response.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Context block payload could not be decrypted", 409);
    }
    return { template: JSON.parse(plaintext) as string };
  }
  return { template: response.template };
}

export async function updateContextBlockContent(
  id: string,
  template: string,
): Promise<{ template?: string }> {
  const encryptedPayload = requireEncryptedPayload(
    await encryptContextBlockTemplate(id, template),
    "Context block content",
  );
  const res = await authFetch(contextBlockContentUrl(id), {
    method: "PATCH",
    body: JSON.stringify({ encrypted_payload: encryptedPayload }),
  });
  const response = await res.json() as {
    template?: string;
    encrypted_payload?: EncryptedPayload | null;
  };
  if (response.encrypted_payload) {
    const plaintext = await decryptContentPayload(response.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Updated context block payload could not be decrypted", 500);
    }
    invalidateContextBlocksCatalogCache();
    return { template: JSON.parse(plaintext) as string };
  }
  invalidateContextBlocksCatalogCache();
  return { template: response.template };
}

export async function deleteContextBlock(id: string): Promise<void> {
  await authFetch(contextBlockUrl(id), { method: "DELETE" });
  invalidateContextBlocksCatalogCache();
}

export async function moveContextBlock(
  id: string,
  path: string,
): Promise<import("./types").ContextBlock> {
  const res = await authFetch(`${contextBlockUrl(id)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ path }),
  });
  invalidateContextBlocksCatalogCache();
  return res.json() as Promise<import("./types").ContextBlock>;
}

export async function deleteFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/context-blocks/folders/delete`, {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
  invalidateContextBlocksCatalogCache();
}

export async function renameFolder(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await authFetch(`${API_V1}/context-blocks/folders/rename`, {
    method: "PATCH",
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
  invalidateContextBlocksCatalogCache();
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export function abilitiesUrl(): string {
  return `${API_V1}/abilities`;
}

export function skillsInstallUrl(): string {
  return `${abilitiesUrl()}/install`;
}

export function abilityUrl(id: string): string {
  return `${API_V1}/abilities/${id}`;
}

export function abilityPromptUrl(id: string): string {
  return `${API_V1}/abilities/${id}/prompt`;
}

export function agentAbilitiesUrl(agentId: string): string {
  return `${API_V1}/agents/${agentId}/abilities`;
}

export async function fetchAbilities(): Promise<import("./types").Ability[]> {
  return catalogFetcher(abilitiesUrl());
}

export async function fetchAbility(id: string): Promise<import("./types").Ability> {
  return fetcher(abilityUrl(id));
}

export async function createAbility(
  data: import("./types").CreateAbilityRequest,
): Promise<import("./types").Ability> {
  const { prompt, ...createData } = data;
  const res = await authFetch(abilitiesUrl(), {
    method: "POST",
    body: JSON.stringify(createData),
  });
  const ability = await res.json() as import("./types").Ability;
  if (prompt) {
    const encryptedPayload = requireEncryptedPayload(
      await encryptAbilityPromptConfig(ability.id, prompt),
      "Ability prompt",
    );
    await authFetch(abilityPromptUrl(ability.id), {
      method: "PATCH",
      body: JSON.stringify({
        encrypted_payload: encryptedPayload,
      }),
    });
  }
  invalidateAbilitiesCatalogCache();
  return ability;
}

export async function installSkill(
  data: import("./types").InstallSkillRequest,
): Promise<import("./types").Ability> {
  const res = await authFetch(skillsInstallUrl(), {
    method: "POST",
    body: JSON.stringify(data),
  });
  const ability = await res.json() as import("./types").Ability;
  invalidateAbilitiesCatalogCache();
  return ability;
}

export async function updateAbility(
  id: string,
  data: import("./types").UpdateAbilityRequest,
): Promise<import("./types").Ability> {
  const res = await authFetch(abilityUrl(id), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  invalidateAbilitiesCatalogCache();
  return res.json() as Promise<import("./types").Ability>;
}

export async function updateSkillRuntimeEnvNames(
  id: string,
  envNames: string[],
): Promise<import("./types").Ability> {
  const res = await authFetch(`${abilityUrl(id)}/skill-runtime`, {
    method: "PATCH",
    body: JSON.stringify({ env_names: envNames }),
  });
  invalidateAbilitiesCatalogCache();
  return res.json() as Promise<import("./types").Ability>;
}

export async function fetchAbilityPrompt(id: string): Promise<string> {
  const response = await fetcher<{
    prompt_config?: { developer_prompt?: string };
    encrypted_payload?: EncryptedPayload | null;
  }>(abilityPromptUrl(id));
  if (response.encrypted_payload) {
    const plaintext = await decryptContentPayload(response.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Ability prompt payload could not be decrypted", 409);
    }
    const promptConfig = JSON.parse(plaintext) as { developer_prompt?: string };
    return promptConfig.developer_prompt ?? "";
  }
  return response.prompt_config?.developer_prompt ?? "";
}

export async function updateAbilityPrompt(
  id: string,
  prompt: string,
): Promise<string> {
  const encryptedPayload = requireEncryptedPayload(
    await encryptAbilityPromptConfig(id, prompt),
    "Ability prompt",
  );
  const res = await authFetch(abilityPromptUrl(id), {
    method: "PATCH",
    body: JSON.stringify({
      encrypted_payload: encryptedPayload,
    }),
  });
  const data = await res.json() as {
    prompt_config?: { developer_prompt?: string };
    encrypted_payload?: EncryptedPayload | null;
  };
  if (data.encrypted_payload) {
    const plaintext = await decryptContentPayload(data.encrypted_payload);
    if (!plaintext) {
      throw new ApiError("Updated ability prompt could not be decrypted", 500);
    }
    const promptConfig = JSON.parse(plaintext) as { developer_prompt?: string };
    invalidateAbilitiesCatalogCache();
    return promptConfig.developer_prompt ?? "";
  }
  invalidateAbilitiesCatalogCache();
  return data.prompt_config?.developer_prompt ?? "";
}

export async function deleteAbility(id: string): Promise<void> {
  await authFetch(abilityUrl(id), { method: "DELETE" });
  invalidateAbilitiesCatalogCache();
}

export async function uninstallSkillAbility(id: string): Promise<void> {
  await authFetch(`${abilityUrl(id)}/uninstall`, { method: "DELETE" });
  invalidateAbilitiesCatalogCache();
}

export async function moveAbility(
  id: string,
  path: string,
): Promise<import("./types").Ability> {
  const res = await authFetch(`${abilityUrl(id)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ path }),
  });
  invalidateAbilitiesCatalogCache();
  return res.json() as Promise<import("./types").Ability>;
}

export async function deleteAbilityFolder(path: string): Promise<void> {
  await authFetch(`${API_V1}/abilities/folders/delete`, {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
  invalidateAbilitiesCatalogCache();
}

export async function renameAbilityFolder(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await authFetch(`${API_V1}/abilities/folders/rename`, {
    method: "PATCH",
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
  invalidateAbilitiesCatalogCache();
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
