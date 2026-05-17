export interface SourceManagedMetadata {
  isSourceManaged: boolean;
  owner: string | null;
  repo: string | null;
  ref: string | null;
  commit: string | null;
  sourcePath: string | null;
  entrypoint: string | null;
  selector: string | null;
  kind: string | null;
}

export interface SourceManagedResource {
  read_only?: boolean;
  source_type?: string;
  metadata?: Record<string, unknown> | null;
}

export function metadataText(metadata: Record<string, unknown> | null | undefined, path: string[]): string | null {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

export function sourceManagedMetadata(resource: SourceManagedResource): SourceManagedMetadata {
  const metadata = resource.metadata ?? {};
  const owner = metadataText(metadata, ["source", "owner"]) ?? metadataText(metadata, ["install", "owner"]);
  const repo = metadataText(metadata, ["source", "repo"]) ?? metadataText(metadata, ["install", "repo"]);
  const ref =
    metadataText(metadata, ["version", "requested_ref"]) ??
    metadataText(metadata, ["version", "ref"]) ??
    metadataText(metadata, ["source", "ref"]);
  const commit = metadataText(metadata, ["version", "resolved_commit_sha"]);
  const sourcePath = metadataText(metadata, ["source", "path"]) ?? metadataText(metadata, ["install", "source_path"]);
  const entrypoint = metadataText(metadata, ["distribution", "entrypoint"]);
  const selector = metadataText(metadata, ["install", "selector"]) ?? metadataText(metadata, ["selector"]);
  const kind = metadataText(metadata, ["install", "kind"]);
  return {
    isSourceManaged: Boolean(resource.read_only || sourcePath || selector || resource.source_type === "skill" || resource.source_type === "plugin"),
    owner,
    repo,
    ref,
    commit,
    sourcePath,
    entrypoint,
    selector,
    kind,
  };
}

export function sourceManagedRawUrl(info: SourceManagedMetadata): string | null {
  if (!info.owner || !info.repo || !info.sourcePath) return null;
  const ref = info.commit ?? info.ref ?? "main";
  const basePath = info.sourcePath.replace(/^\/+/, "").replace(/\/+$/, "");
  const path = info.entrypoint && !basePath.endsWith(info.entrypoint.replace(/^\/+/, ""))
    ? `${basePath}/${info.entrypoint.replace(/^\/+/, "")}`
    : basePath;
  return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${ref}/${path}`;
}
