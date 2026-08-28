import type { RoutineSummary } from "@/lib/types";

export type RoutineSort = "updated" | "name" | "steps";

export interface RoutineWorkspaceSummary {
  routines: number;
  steps: number;
  previouslyRun: number;
}

/** Keep list filtering and ordering deterministic and separate from rendering state. */
export function filterAndSortRoutines(
  routines: RoutineSummary[],
  query: string,
  sort: RoutineSort,
): RoutineSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? routines.filter((routine) =>
        [routine.name, routine.description ?? "", routine.slug].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
    : [...routines];

  return filtered.sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "steps") {
      return right.step_count - left.step_count || left.name.localeCompare(right.name);
    }
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

export function summarizeRoutineWorkspace(routines: RoutineSummary[]): RoutineWorkspaceSummary {
  return routines.reduce<RoutineWorkspaceSummary>(
    (summary, routine) => ({
      routines: summary.routines + 1,
      steps: summary.steps + routine.step_count,
      previouslyRun: summary.previouslyRun + (routine.last_run_at ? 1 : 0),
    }),
    { routines: 0, steps: 0, previouslyRun: 0 },
  );
}
