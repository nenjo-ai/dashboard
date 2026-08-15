import type {
  ConfigureRoutineMetadataRequest,
  ConfigureRoutineRequest,
  CreateRoutineRequest,
  SaveRoutineGraphRequest,
  SaveRoutineGraphStepRequest,
  UpdateRoutineRequest,
} from "./types";
import { withRoutineCreationSlug } from "./routineSlug.ts";

type RoutineMutationRequest = CreateRoutineRequest | UpdateRoutineRequest;

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function routineConfigureMetadata(
  data: RoutineMutationRequest,
): ConfigureRoutineMetadataRequest {
  const metadata: ConfigureRoutineMetadataRequest = {};
  if (hasOwn(data, "slug")) metadata.slug = data.slug;
  if (hasOwn(data, "name")) metadata.name = data.name;
  if (hasOwn(data, "description")) metadata.description = data.description;
  if (hasOwn(data, "project_id")) metadata.project_id = data.project_id;
  if (hasOwn(data, "is_active")) metadata.is_active = data.is_active;
  if (hasOwn(data, "max_retries")) metadata.max_retries = data.max_retries;
  return metadata;
}

function routineConfigureBase(
  data: RoutineMutationRequest,
): Pick<
  ConfigureRoutineRequest,
  "metadata" | "runtime_metadata" | "encrypted_payload"
> {
  const body: Pick<
    ConfigureRoutineRequest,
    "metadata" | "runtime_metadata" | "encrypted_payload"
  > = {
    metadata: routineConfigureMetadata(data),
  };
  if (hasOwn(data, "metadata")) body.runtime_metadata = data.metadata;
  if (hasOwn(data, "encrypted_payload")) {
    body.encrypted_payload = data.encrypted_payload;
  }
  return body;
}

/** Build the platform configure payload for a new dashboard routine. */
export function buildCreateRoutineConfigureRequest(
  data: CreateRoutineRequest,
): ConfigureRoutineRequest {
  const creation = withRoutineCreationSlug(data);
  return {
    ...routineConfigureBase(creation),
    id: data.id,
  };
}

/** Build the platform configure payload for an existing dashboard routine. */
export function buildUpdateRoutineConfigureRequest(
  routine: string,
  data: UpdateRoutineRequest,
): ConfigureRoutineRequest {
  return {
    ...routineConfigureBase(data),
    routine,
  };
}

/** Build the platform configure payload for an encrypted routine graph save. */
export function buildRoutineGraphConfigureRequest(
  routine: string,
  data: SaveRoutineGraphRequest,
  steps: SaveRoutineGraphStepRequest[],
): ConfigureRoutineRequest {
  return {
    ...routineConfigureBase(data),
    routine,
    graph: {
      entry_steps: data.entry_steps,
      steps,
      edges: data.edges,
    },
  };
}
