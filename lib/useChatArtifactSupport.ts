"use client";

import { useMemo } from "react";

import { chatArtifactSupport } from "./chatArtifacts";
import {
  useAgentModelAssignments,
  useModels,
  useOrgCapabilityDefaults,
} from "./hooks";
import type { AgentDefinition } from "./types";

export function useChatArtifactSupport(
  agent: Pick<AgentDefinition, "id" | "model_id"> | undefined,
) {
  const { models, isLoading: modelsLoading } = useModels();
  const { modelAssignments, isLoading: assignmentsLoading } =
    useAgentModelAssignments(agent?.id);
  const { capabilityDefaults, isLoading: defaultsLoading } =
    useOrgCapabilityDefaults();

  const support = useMemo(
    () => chatArtifactSupport(
      agent,
      models,
      modelAssignments?.assignments,
      capabilityDefaults?.defaults,
    ),
    [agent, capabilityDefaults?.defaults, modelAssignments?.assignments, models],
  );

  return {
    ...support,
    isLoading: modelsLoading || assignmentsLoading || defaultsLoading,
  };
}
