export const MAX_ARTIFACT_IMPORTS = 16;

export interface ArtifactImportFileLike {
  name: string;
  webkitRelativePath?: string;
}

function artifactPathSegmentError(segment: string): string | null {
  if (!segment) return "Folder names cannot be empty.";
  if (segment === "." || segment === "..") return "Folder names cannot be . or ...";
  if (segment.length > 255) return "Folder names must be 255 characters or fewer.";
  if (segment.includes("/") || segment.includes("\\")) return "Folder names cannot contain slashes.";
  if (segment.trim() !== segment) return "Folder names cannot start or end with spaces.";
  if (segment.split("").some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return "Folder names cannot contain control characters.";
  }
  return null;
}

export function artifactCatalogPathError(
  value: string,
  kind: "folder" | "file",
): string | null {
  if (!value) return kind === "folder" ? "Enter a folder path." : "Enter a file path.";
  if (value.length > 2_048) return "Paths must be 2,048 characters or fewer.";
  if (value.startsWith("/") || value.endsWith("/")) return "Use a relative path without leading or trailing slashes.";
  const segments = value.split("/");
  const maximumSegments = kind === "folder" ? 32 : 33;
  if (segments.length > maximumSegments) return "This path is nested too deeply.";
  const invalid = segments.find((segment) => artifactPathSegmentError(segment));
  return invalid === undefined ? null : artifactPathSegmentError(invalid);
}

export function artifactFolderNameError(value: string): string | null {
  if (!value.trim()) return null;
  return artifactPathSegmentError(value);
}

export function joinArtifactCatalogPath(...parts: Array<string | null | undefined>): string {
  return parts
    .flatMap((part) => part?.split("/") ?? [])
    .filter(Boolean)
    .join("/");
}

export function artifactImportRelativePath(
  file: ArtifactImportFileLike,
  preserveFolderStructure: boolean,
): string {
  const candidate = preserveFolderStructure && file.webkitRelativePath
    ? file.webkitRelativePath
    : file.name;
  const segments = candidate.split("/");
  const invalidSegment = segments.find((segment) => artifactPathSegmentError(segment));
  if (invalidSegment !== undefined) {
    throw new Error(`“${candidate}” cannot be imported because its folder path is not valid.`);
  }
  return segments.join("/");
}

export function artifactImportPublishPath(
  file: ArtifactImportFileLike,
  options: {
    currentPath: string;
    newSubfolder?: string;
    preserveFolderStructure?: boolean;
  },
): string {
  const folderError = artifactFolderNameError(options.newSubfolder ?? "");
  if (folderError) throw new Error(folderError);
  return joinArtifactCatalogPath(
    options.currentPath,
    options.newSubfolder,
    artifactImportRelativePath(file, options.preserveFolderStructure ?? false),
  );
}
