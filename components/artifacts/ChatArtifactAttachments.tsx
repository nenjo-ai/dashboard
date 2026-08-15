"use client";

import Link from "next/link";
import { File, Loader2 } from "lucide-react";
import { useMemo } from "react";
import useSWR from "swr";

import { ApiError, fetchArtifactDetail } from "@/lib/api";
import {
  chatArtifactDetailsCacheKey,
  sessionArtifactIds,
} from "@/lib/chatArtifacts";
import { useOrgContext } from "@/lib/org-context";
import type { ArtifactDetail, ChatMessage } from "@/lib/types";

function shortArtifactId(artifactId: string): string {
  return artifactId.slice(0, 8);
}

async function fetchAvailableArtifactDetails(
  artifactIds: readonly string[],
): Promise<ArtifactDetail[]> {
  const details = await Promise.all(
    artifactIds.map(async (artifactId) => {
      try {
        return await fetchArtifactDetail(artifactId);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    }),
  );
  return details.filter((detail): detail is ArtifactDetail => detail !== null);
}

function ArtifactPills({
  artifactIds,
  artifactsById,
  isLoading,
}: {
  artifactIds: readonly string[];
  artifactsById: ReadonlyMap<string, ArtifactDetail["artifact"]>;
  isLoading: boolean;
}) {
  if (artifactIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Session file links">
      {artifactIds.map((artifactId) => {
        const artifact = artifactsById.get(artifactId);
        return (
          <Link
            key={artifactId}
            href={`/dashboard/library/artifacts?artifact=${encodeURIComponent(artifactId)}`}
            title={artifact ? `Open ${artifact.name}` : `Open artifact ${artifactId}`}
            className="theme-border theme-surface-muted theme-text inline-flex min-w-0 max-w-56 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
          >
            {isLoading && !artifact ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <File aria-hidden="true" className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">
              {artifact?.name ?? `Artifact ${shortArtifactId(artifactId)}`}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function SessionArtifactAttachments({ messages }: { messages: ChatMessage[] }) {
  const { activeOrgId } = useOrgContext();
  const artifactIds = useMemo(() => sessionArtifactIds(messages), [messages]);
  const { data, error, isLoading } = useSWR(
    activeOrgId && artifactIds.length > 0
      ? chatArtifactDetailsCacheKey(activeOrgId, artifactIds)
      : null,
    ([, , ...ids]) => fetchAvailableArtifactDetails(ids),
  );
  const visibleArtifactIds = data
    ? data.map((detail) => detail.artifact.id)
    : isLoading || error
      ? artifactIds
      : [];
  const artifactsById = new Map(
    data?.map((detail) => [detail.artifact.id, detail.artifact]) ?? [],
  );

  if (visibleArtifactIds.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5" aria-label="Session files">
      <p className="theme-text-muted text-[11px] font-medium">
        Session files · {visibleArtifactIds.length}
      </p>
      <ArtifactPills
        artifactIds={visibleArtifactIds}
        artifactsById={artifactsById}
        isLoading={isLoading}
      />
    </div>
  );
}
