"use client";

import { useState } from "react";
import { useAbilities, useAgentAbilities } from "@/lib/hooks";
import { setAgentAbilities } from "@/lib/api";
import type { Ability } from "@/lib/types";

interface AgentAbilitiesPanelProps {
  agentId: string;
}

export function AgentAbilitiesPanel({ agentId }: AgentAbilitiesPanelProps) {
  const { abilities: allAbilities, isLoading: abilitiesLoading } =
    useAbilities();
  const {
    abilities: agentAbilities,
    isLoading: assignmentsLoading,
    mutate,
  } = useAgentAbilities(agentId);
  const [toggling, setToggling] = useState<string | null>(null);

  const isLoading = abilitiesLoading || assignmentsLoading;

  // Build set of assigned ability IDs
  const assignedNames = new Set((agentAbilities ?? []).map((a) => a.name));

  const handleToggle = async (ability: Ability) => {
    if (toggling) return;
    setToggling(ability.id);
    try {
      const currentNames = Array.from(assignedNames);
      let next: string[];
      if (assignedNames.has(ability.name)) {
        next = currentNames.filter((name) => name !== ability.name);
      } else {
        next = [...currentNames, ability.name];
      }
      await setAgentAbilities(agentId, next);
      mutate();
    } catch {
      // Silently fail
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
          />
        ))}
      </div>
    );
  }

  if (!allAbilities || allAbilities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No abilities configured. Create abilities in the Abilities tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allAbilities.map((ability) => {
        const isAssigned = assignedNames.has(ability.name);
        const isProcessing = toggling === ability.id;

        return (
          <div
            key={ability.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
              isAssigned
                ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() => handleToggle(ability)}
                disabled={isProcessing}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  isAssigned ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
                } ${isProcessing ? "opacity-50" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                    isAssigned ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>

              {/* Ability info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {ability.name}
                  </span>
                  {ability.platform_scopes.length > 0 && (
                    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      {ability.platform_scopes.length} scope
                      {ability.platform_scopes.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {ability.activation_condition && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                    {ability.activation_condition}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
