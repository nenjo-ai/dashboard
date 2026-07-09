import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  catalogFetcher,
  catalogSWROptions,
  fetchProject,
  fetchProjects,
  fetchRoutine,
  fetchExecutionTraceEvents,
  fetchCouncil,
  fetchCouncils,
  fetchChatCommands,
  fetcher,
  fetchTasks,
  projectsUrl,
  projectUrl,
  tasksUrl,
  executionsUrl,
  executionTasksUrl,
  executionTraceEventsUrl,
  activityUrl,
  dependencyGraphUrl,
  modelsUrl,
  modelCatalogUrl,
  mediaCapabilitiesUrl,
  mediaConfigUrl,
  agentMediaUrl,
  agentModelAssignmentsUrl,
  knowledgeItemsUrl,
  knowledgePacksUrl,
  packageSourcesUrl,
  packageInstallsUrl,
  chatCommandsUrl,
  apiKeysUrl,
  authMeUrl,
  currentOrgUrl,
  workerStatusUrl,
  routinesUrl,
  routineUrl,
  agentsUrl,
  agentUrl,
  domainsUrl,
  agentDomainsUrl,
  mcpServersUrl,
  agentMcpUrl,
  abilitiesUrl,
  agentAbilitiesUrl,
  contextBlocksUrl,
  promptContextVariablesUrl,
  orgsUrl,
  orgMembersUrl,
  orgInvitationsUrl,
  orgQuotasUrl,
  orgContentKeyRequestsUrl,
  bootstrapStatusUrl,
  currentOrgContentKeyRequestUrl,
  tokenUsageUrl,
} from "./api";
import type {
  Project,
  ContextBlock,
  Task,
  ExecutionDetails,
  AgentHeartbeat,
  ExecutionTask,
  ExecutionTraceEvent,
  DependencyGraph,
  Model,
  ModelCatalogQuery,
  ModelCatalogProvider,
  ModelCatalogResponse,
  KnowledgeItem,
  KnowledgePack,
  PackageInstall,
  ChatCommand,
  PackageSource,
  ApiKey,
  RoutineSummary,
  RoutineDetail,
  CouncilDetail,
  AgentDefinition,
  PromptConfig,
  Domain,
  AgentDomainAssignment,
  McpServer,
  Ability,
  PromptContextVariableGroup,
  OrganizationSummary,
  CurrentOrg,
  OrgMember,
  OrgInvitation,
  QuotaStatus,
  OrgContentKeyAccessRequest,
  OrgContentKeyAccessRequestStatus,
  BootstrapStatus,
  TokenUsageSource,
  TokenUsageSummary,
  MediaCapabilitiesResponse,
  MediaConfig,
  MediaAssignmentsResponse,
  ModelAssignmentsResponse,
} from "./types";
import { useSafeRouter } from "./safeRouter";

// ---------------------------------------------------------------------------
// URL-synced query param state
// ---------------------------------------------------------------------------

/**
 * Persist a single value in the URL query string (e.g. `?agent=abc123`).
 * Setting the value to `undefined` (or the `defaultValue`) removes the param.
 */
export function useQueryParam(
  key: string,
  defaultValue?: string,
): [string | undefined, (val: string | undefined) => void] {
  const searchParams = useSearchParams();
  const router = useSafeRouter();
  const pathname = usePathname();

  const raw = searchParams.get(key);
  const urlValue = raw ?? defaultValue;

  // Optimistic local state — provides immediate UI update while
  // router.replace (async) propagates the change to searchParams.
  const [optimistic, setOptimistic] = useState(urlValue);

  // Sync when the URL catches up or changes externally (back/forward)
  useEffect(() => {
    setOptimistic(urlValue);
  }, [urlValue]);

  const setValue = useCallback(
    (val: string | undefined) => {
      setOptimistic(val ?? defaultValue);
      const params = new URLSearchParams(searchParams.toString());
      if (!val || val === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, key, defaultValue],
  );

  return [optimistic, setValue];
}

// ---------------------------------------------------------------------------
// URL-synced tab state
// ---------------------------------------------------------------------------

/**
 * Persist the active tab in the URL query string (e.g. `?tab=execution`).
 * Falls back to `defaultTab` when the param is missing or invalid.
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[],
): [T, (tab: T) => void] {
  const searchParams = useSearchParams();
  const router = useSafeRouter();
  const pathname = usePathname();

  const raw = searchParams.get("tab") as T | null;
  const urlTab =
    raw && (validTabs as readonly string[]).includes(raw) ? raw : defaultTab;
  const [optimistic, setOptimistic] = useState<T>(urlTab);

  useEffect(() => {
    setOptimistic(urlTab);
  }, [urlTab]);

  const setTab = useCallback(
    (tab: T) => {
      setOptimistic(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, defaultTab],
  );

  return [optimistic, setTab];
}

// ---------------------------------------------------------------------------
// SWR hooks — client components use these for data fetching + caching
// ---------------------------------------------------------------------------

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<Project[]>(
    projectsUrl(),
    fetchProjects,
    catalogSWROptions,
  );

  return {
    projects: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useContextBlocks() {
  const { data, error, isLoading, mutate } = useSWR<ContextBlock[]>(
    contextBlocksUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    contextBlocks: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useTemplateVars() {
  const { data, error, isLoading } = useSWR<PromptContextVariableGroup[]>(
    promptContextVariablesUrl(),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  return {
    varGroups: data,
    isLoading,
    isError: !!error,
  };
}

export function useProject(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<Project>(
    id ? projectUrl(id) : null,
    () => fetchProject(id!),
    {
      revalidateOnFocus: false,
      // Poll every 3s while a repo sync is in progress
      refreshInterval: (latestData: Project | undefined) => {
        const status = (latestData?.settings as Record<string, unknown> | undefined)
          ?.repo_sync_status;
        return status === "syncing" ? 3000 : 0;
      },
    },
  );

  return {
    project: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useTasks(projectId: string | undefined, status?: string) {
  const url = projectId ? tasksUrl(projectId, { status }) : null;

  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    url,
    () => fetchTasks(projectId!, status),
    { revalidateOnFocus: false, dedupingInterval: 3000 },
  );

  return {
    tasks: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useExecutions(projectId: string | undefined, limit = 20) {
  const url = projectId
    ? executionsUrl({ project_id: projectId, limit })
    : null;

  const { data, error, isLoading, mutate } = useSWR<ExecutionDetails[]>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    executions: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useExecutionTasks(executionId: string | undefined) {
  const url = executionId ? executionTasksUrl(executionId) : null;

  const { data, error, isLoading, mutate } = useSWR<ExecutionTask[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3000 },
  );

  return {
    tasks: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useExecutionTraceEvents(executionId: string | undefined) {
  const url = executionId ? executionTraceEventsUrl(executionId) : null;

  const { data, error, isLoading, mutate } = useSWR<ExecutionTraceEvent[]>(
    url,
    () => fetchExecutionTraceEvents(executionId!),
    { revalidateOnFocus: false, dedupingInterval: 3000 },
  );

  return {
    traceEvents: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useRecentExecutions(projectId?: string, limit = 10) {
  // When no projectId, fetch all user-scoped executions (includes cron runs)
  const url = executionsUrl({ project_id: projectId, limit });

  const { data, error, isLoading } = useSWR<ExecutionDetails[]>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    executions: data,
    isLoading,
    isError: !!error,
    error,
  };
}

export interface ActivityEntry {
  id: string;
  project_id: string | null;
  user_id: string | null;
  category: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  execution_run_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useActivity(params?: {
  projectId?: string;
  category?: string;
  resourceType?: string;
  limit?: number;
}) {
  const url = activityUrl({
    project_id: params?.projectId,
    category: params?.category,
    resource_type: params?.resourceType,
    limit: params?.limit ?? 50,
  });

  const { data, error, isLoading, mutate } = useSWR<ActivityEntry[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10000 },
  );

  return {
    activity: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useTokenUsage(params?: {
  source?: TokenUsageSource;
  projectId?: string;
  agentId?: string;
  from?: string;
  to?: string;
  groupBy?: "source" | "day" | "agent" | "project";
}) {
  const url = tokenUsageUrl({
    source: params?.source,
    project_id: params?.projectId,
    agent_id: params?.agentId,
    from: params?.from,
    to: params?.to,
    group_by: params?.groupBy,
  });

  const { data, error, isLoading, mutate } = useSWR<TokenUsageSummary>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );

  return {
    usage: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useModels(projectId?: string) {
  const { data, error, isLoading, mutate } = useSWR<Model[]>(
    modelsUrl({ project_id: projectId }),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    models: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useModelCatalog(
  provider: ModelCatalogProvider,
  params?: ModelCatalogQuery,
  enabled = true,
) {
  const url = enabled ? modelCatalogUrl(provider, params) : null;
  const { data, error, isLoading, mutate } = useSWR<ModelCatalogResponse>(
    url,
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    catalog: data,
    models: data?.models ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOpenRouterModelCatalog(
  params?: ModelCatalogQuery,
  enabled = true,
) {
  return useModelCatalog("openrouter", params, enabled);
}

export function useMediaConfig() {
  const { data, error, isLoading, mutate } = useSWR<MediaConfig>(
    mediaConfigUrl(),
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 0 },
  );

  return {
    mediaConfig: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useMediaCapabilities() {
  const { data, error, isLoading, mutate } = useSWR<MediaCapabilitiesResponse>(
    mediaCapabilitiesUrl(),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  return {
    mediaCapabilities: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentMedia(agentId: string | undefined) {
  const url = agentId ? agentMediaUrl(agentId) : null;
  const { data, error, isLoading, mutate } = useSWR<MediaAssignmentsResponse>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    mediaAssignments: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentModelAssignments(agentId: string | undefined) {
  const url = agentId ? agentModelAssignmentsUrl(agentId) : null;
  const { data, error, isLoading, mutate } = useSWR<ModelAssignmentsResponse>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    modelAssignments: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useDependencyGraph(projectId: string | undefined) {
  const url = projectId ? dependencyGraphUrl(projectId) : null;

  const { data, error, isLoading, mutate } = useSWR<DependencyGraph>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    graph: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export function useKnowledgePacks() {
  const { data, error, isLoading, mutate } = useSWR<KnowledgePack[]>(
    knowledgePacksUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    packs: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useKnowledgeItems(packId: string | undefined) {
  const url = packId ? knowledgeItemsUrl(packId) : null;

  const { data, error, isLoading, mutate } = useSWR<KnowledgeItem[]>(
    url,
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    items: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function usePackageSources() {
  const { data, error, isLoading, mutate } = useSWR<PackageSource[]>(
    packageSourcesUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    sources: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function usePackageInstalls() {
  const { data, error, isLoading, mutate } = useSWR<PackageInstall[]>(
    packageInstallsUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    installs: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useChatCommands() {
  const { data, error, isLoading, mutate } = useSWR<ChatCommand[]>(
    chatCommandsUrl(),
    fetchChatCommands,
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );

  return {
    commands: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Current User (resolved DB user from /auth/me)
// ---------------------------------------------------------------------------

interface CurrentUser {
  user_id: string | null;
  clerk_id?: string;
  session_id?: string | null;
  org_id?: string | null;
  org_name?: string | null;
  org_role?: string | null;
  org_scopes?: string[] | null;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  onboarded?: boolean;
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR<CurrentUser>(
    authMeUrl(),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  return {
    currentUser: data,
    userId: data?.user_id ?? undefined,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOrganizations() {
  const { data, error, isLoading, mutate } = useSWR<OrganizationSummary[]>(
    orgsUrl(),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );

  return {
    organizations: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useCurrentOrg() {
  const { data, error, isLoading, mutate } = useSWR<CurrentOrg>(
    currentOrgUrl(),
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );

  return {
    currentOrg: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOrgMembers(orgId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<OrgMember[]>(
    orgId ? orgMembersUrl(orgId) : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    members: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOrgInvitations(orgId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<OrgInvitation[]>(
    orgId ? orgInvitationsUrl(orgId) : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    invitations: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOrgQuotaStatus(orgId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<QuotaStatus>(
    orgId ? orgQuotasUrl(orgId) : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    quotaStatus: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useOrgContentKeyRequests(orgId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<OrgContentKeyAccessRequest[]>(
    orgId ? orgContentKeyRequestsUrl(orgId) : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    requests: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useCurrentOrgContentKeyAccessRequest(deviceId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<OrgContentKeyAccessRequestStatus>(
    deviceId ? currentOrgContentKeyRequestUrl(deviceId) : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3000, refreshInterval: 3000 },
  );

  return {
    request: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useBootstrapStatus(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<BootstrapStatus>(
    enabled ? bootstrapStatusUrl() : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    status: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export function useApiKeys(userId: string | undefined) {
  void userId;
  const url = apiKeysUrl();

  const { data, error, isLoading, mutate } = useSWR<ApiKey[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    apiKeys: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

export function useMcpServers() {
  const { data, error, isLoading, mutate } = useSWR<McpServer[]>(
    mcpServersUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    mcpServers: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentMcpServers(agentId: string | undefined) {
  const url = agentId ? agentMcpUrl(agentId) : null;
  const { data, error, isLoading, mutate } = useSWR<McpServer[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    mcpServers: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

export function useAbilities() {
  const { data, error, isLoading, mutate } = useSWR<Ability[]>(
    abilitiesUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    abilities: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentAbilities(agentId: string | undefined) {
  const url = agentId ? agentAbilitiesUrl(agentId) : null;
  const { data, error, isLoading, mutate } = useSWR<Ability[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  return {
    abilities: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Worker Status
// ---------------------------------------------------------------------------

/**
 * Poll the backend to check if the user's agent worker
 * is connected via WebSocket. Uses Redis on the backend so it works
 * correctly across horizontally-scaled backend nodes.
 */
export function useWorkerStatus(options?: { refreshInterval?: number }) {
  const { data, error, isLoading, mutate } = useSWR<import("./types").WorkerStatus>(
    workerStatusUrl(),
    fetcher,
    {
      revalidateOnFocus: true,
      refreshInterval: options?.refreshInterval ?? 10000,
      dedupingInterval: Math.min(5000, options?.refreshInterval ?? 10000),
    },
  );

  return {
    isConnected: data?.worker_connected ?? false,
    workers: data?.workers ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Routines (user-scoped, like councils)
// ---------------------------------------------------------------------------

export function useRoutines() {
  const { data, error, isLoading, mutate } = useSWR<RoutineSummary[]>(
    routinesUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    routines: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useRoutine(routineId: string | undefined) {
  const url = routineId ? routineUrl(routineId) : null;

  const { data, error, isLoading, mutate } = useSWR<RoutineDetail>(
    url,
    routineId ? () => fetchRoutine(routineId) : null,
    { revalidateOnFocus: false },
  );

  return {
    routine: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Councils
// ---------------------------------------------------------------------------

export function useCouncils() {
  const { data, error, isLoading, mutate } = useSWR<CouncilDetail[]>(
    "councils",
    fetchCouncils,
    catalogSWROptions,
  );

  return {
    councils: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useCouncil(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<CouncilDetail>(
    id ? ["council", id] : null,
    () => fetchCouncil(id!),
    { revalidateOnFocus: false },
  );

  return {
    council: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Agents (Behavioral Identities — previously "Agent Roles")
// ---------------------------------------------------------------------------

export function useAgents() {
  const { data, error, isLoading, mutate } = useSWR<AgentDefinition[]>(
    agentsUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    agents: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgent(id: string | undefined) {
  const url = id ? agentUrl(id) : null;

  const { data, error, isLoading, mutate } = useSWR<AgentDefinition>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    agent: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentHeartbeat(agentId: string | undefined) {
  const url = agentId ? `${agentUrl(agentId)}/heartbeat` : null;

  const { data, error, isLoading, mutate } = useSWR<AgentHeartbeat | null>(
    url,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10000 },
  );

  return {
    heartbeat: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentExecutions(agentId: string | undefined, limit = 20) {
  const url = agentId ? executionsUrl({ agent_id: agentId, limit }) : null;

  const { data, error, isLoading, mutate } = useSWR<ExecutionDetails[]>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    executions: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentPrompt(agentId: string | undefined) {
  const url = agentId ? agentUrl(agentId) + "/prompt" : null;

  const { data, error, isLoading, mutate } = useSWR<PromptConfig>(
    url,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    promptConfig: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export function useDomains() {
  const { data, error, isLoading, mutate } = useSWR<Domain[]>(
    domainsUrl(),
    catalogFetcher,
    catalogSWROptions,
  );

  return {
    domains: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAgentDomains(agentId: string | undefined) {
  const url = agentId ? agentDomainsUrl(agentId) : null;

  const { data, error, isLoading, mutate } = useSWR<AgentDomainAssignment[]>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3000 },
  );

  return {
    agentDomains: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export function useAllAgentDomains(agentIds: string[]) {
  const sortedKey = useMemo(
    () => (agentIds.length > 0 ? agentIds.slice().sort().join(",") : null),
    [agentIds],
  );

  const { data } = useSWR<AgentDomainAssignment[]>(
    sortedKey ? `all-agent-domains:${sortedKey}` : null,
    async () => {
      const ids = sortedKey!.split(",");
      const results = await Promise.allSettled(
        ids.map((aid) => fetcher<AgentDomainAssignment[]>(agentDomainsUrl(aid))),
      );
      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<AgentDomainAssignment[]> =>
          r.status === "fulfilled",
      );
      if (fulfilled.length === 0 && results.length > 0) {
        throw new Error("All agent-domain fetches failed");
      }
      return fulfilled.flatMap((r) => r.value);
    },
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );

  const domainToAgentMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const assignment of data) {
      if (assignment.enabled && !map.has(assignment.domain_id)) {
        map.set(assignment.domain_id, assignment.agent_id);
      }
    }
    return map;
  }, [data]);

  return { domainToAgentMap };
}
