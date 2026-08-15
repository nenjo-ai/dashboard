import type {
  AgentDefinition,
  ChatMessage,
  Model,
  ModelAssignment,
  OrgCapabilityDefault,
  ArtifactDetail,
} from "./types";

const DOCUMENT_CAPABILITY = "analyze_document";
const IMAGE_CAPABILITY = "analyze_image";
const CHAT_ARTIFACT_DETAILS_CACHE_PREFIX = "chat-artifact-details";

export type ChatArtifactSupport = {
  canAttach: boolean;
  canAnalyzeDocument: boolean;
  canAnalyzeImage: boolean;
};

/** Resolve the artifact inputs that the selected agent can actually consume. */
export function chatArtifactSupport(
  agent: Pick<AgentDefinition, "id" | "model_id"> | undefined,
  models: Model[] | undefined,
  assignments: ModelAssignment[] | undefined,
  defaults: OrgCapabilityDefault[] | undefined,
): ChatArtifactSupport {
  if (!agent) {
    return {
      canAttach: false,
      canAnalyzeDocument: false,
      canAnalyzeImage: false,
    };
  }

  const assignedCapabilities = new Set(
    assignments?.map((assignment) => assignment.capability) ?? [],
  );
  const defaultCapabilities = new Set(
    defaults?.map((assignment) => assignment.capability) ?? [],
  );
  const primaryModel = models?.find((model) => model.id === agent.model_id);
  const primaryModalities = new Set(primaryModel?.input_modalities ?? []);

  const canAnalyzeDocument =
    assignedCapabilities.has(DOCUMENT_CAPABILITY)
    || defaultCapabilities.has(DOCUMENT_CAPABILITY)
    || primaryModalities.has("file");
  const canAnalyzeImage =
    assignedCapabilities.has(IMAGE_CAPABILITY)
    || defaultCapabilities.has(IMAGE_CAPABILITY)
    || primaryModalities.has("image");

  return {
    canAttach: canAnalyzeDocument || canAnalyzeImage,
    canAnalyzeDocument,
    canAnalyzeImage,
  };
}

/** Return each durable artifact reference in session order exactly once. */
export function sessionArtifactIds(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  const artifactIds: string[] = [];
  for (const message of messages) {
    for (const artifactId of message.artifactIds ?? []) {
      if (seen.has(artifactId)) continue;
      seen.add(artifactId);
      artifactIds.push(artifactId);
    }
  }
  return artifactIds;
}

/** Tenant-scoped SWR key for the artifact metadata displayed in one chat session. */
export function chatArtifactDetailsCacheKey(
  orgId: string,
  artifactIds: readonly string[],
): readonly string[] {
  return [CHAT_ARTIFACT_DETAILS_CACHE_PREFIX, orgId, ...artifactIds];
}

/** Match chat metadata caches that contain any artifact in a deleted lineage. */
export function chatArtifactCacheContainsAny(
  key: unknown,
  artifactIds: readonly string[],
): boolean {
  if (!Array.isArray(key) || key[0] !== CHAT_ARTIFACT_DETAILS_CACHE_PREFIX) {
    return false;
  }
  const deleted = new Set(artifactIds);
  return key.slice(2).some((value) => typeof value === "string" && deleted.has(value));
}

/** Remove deleted lineage members from an already-loaded chat metadata batch. */
export function withoutDeletedArtifactDetails(
  details: ArtifactDetail[] | undefined,
  artifactIds: readonly string[],
): ArtifactDetail[] | undefined {
  if (!details) return details;
  const deleted = new Set(artifactIds);
  return details.filter((detail) => !deleted.has(detail.artifact.id));
}
