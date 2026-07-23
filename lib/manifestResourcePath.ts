import { metadataText } from "./sourceManaged";

interface ManifestPathResource {
  path?: string | null;
  source_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function manifestResourceDisplayPath(resource: ManifestPathResource): string {
  return packageResourceDisplayPath(resource) ?? cleanPath(resource.path) ?? "";
}

export function packageResourceDisplayPath(resource: ManifestPathResource): string | null {
  if (!isPackageResource(resource)) return null;

  // The persisted package path is the canonical runtime selector. Unlike a
  // repository source path, it includes the package source and version, e.g.
  // `pkg/nenjo_ai/packages/nenji/v1_1_0/capabilities/build`.
  const canonicalPath = cleanPath(resource.path);
  if (canonicalPath?.startsWith("pkg/")) return canonicalPath;

  const metadata = resource.metadata ?? {};
  const sourcePath =
    metadataText(metadata, ["package", "module_path"]) ??
    metadataText(metadata, ["distribution", "package_path"]) ??
    metadataText(metadata, ["install", "source_path"]) ??
    metadataText(metadata, ["source", "path"]) ??
    metadataText(metadata, ["package", "source_path"]);

  const sourceDir = dirnameFromPackageSourcePath(sourcePath);
  if (sourceDir) return sourceDir;

  const packageName =
    metadataText(metadata, ["package", "name"]) ??
    metadataText(metadata, ["source", "package"]);

  return packageName ? packageNameToPath(packageName) : null;
}

function isPackageResource(resource: ManifestPathResource): boolean {
  const metadata = resource.metadata ?? {};
  return Boolean(
    resource.source_type === "package" ||
      metadataText(metadata, ["install", "source_path"]) ||
      metadataText(metadata, ["package", "module_path"]) ||
      metadataText(metadata, ["distribution", "package_path"]),
  );
}

function dirnameFromPackageSourcePath(path: string | null): string | null {
  const clean = cleanPath(path?.split("#", 1)[0]);
  if (!clean) return null;
  const withoutTrailingSlash = clean.replace(/\/+$/g, "");
  if (!withoutTrailingSlash) return null;

  const parts = withoutTrailingSlash.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  return parts.join("/") || null;
}

function cleanPath(path: string | null | undefined): string | null {
  const clean = path?.trim().replace(/^\/+|\/+$/g, "");
  return clean || null;
}

function packageNameToPath(packageName: string): string | null {
  const clean = packageName.trim().replace(/^@/, "");
  if (!clean) return null;
  return clean.replace(/\//g, ".").replace(/-/g, "_");
}
