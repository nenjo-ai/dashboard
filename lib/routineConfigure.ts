import type {
  ConfigureRoutineRequest,
  SaveRoutineGraphRequest,
  SaveRoutineGraphStepRequest,
} from "./types";

/** Build the canonical complete routine graph upsert payload. */
export function buildRoutineGraphConfigureRequest(
  data: SaveRoutineGraphRequest,
  steps: SaveRoutineGraphStepRequest[],
): ConfigureRoutineRequest {
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    project_id: data.project_id,
    entry_steps: data.entry_steps,
    steps,
    edges: data.edges,
  };
}
