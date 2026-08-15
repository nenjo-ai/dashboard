import type {
  HumanApprovalOption,
  HumanDecision,
  HumanInputSchema,
  HumanReviewInput,
  ReviewFormField,
} from "./types.ts";

export type ArtifactPreviewKind =
  | "audio"
  | "image"
  | "json"
  | "markdown"
  | "pdf"
  | "text"
  | "unsupported"
  | "video";

const SAFE_MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const MARKDOWN_MEDIA_TYPES = new Set(["application/markdown", "text/markdown", "text/x-markdown"]);
const TEXT_APPLICATION_MEDIA_TYPES = new Set([
  "application/graphql",
  "application/javascript",
  "application/sql",
  "application/x-javascript",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
]);
const SAFE_IMAGE_MEDIA_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Reduce user-supplied content types to a safe, parameter-free MIME type. */
export function normalizeArtifactMediaType(mediaType: string): string {
  const normalized = mediaType.split(";", 1)[0].trim().toLowerCase();
  return SAFE_MEDIA_TYPE.test(normalized) ? normalized : "application/octet-stream";
}

/** Select a safe browser renderer for an artifact MIME type. */
export function artifactPreviewKind(mediaType: string): ArtifactPreviewKind {
  const normalized = normalizeArtifactMediaType(mediaType);
  if (SAFE_IMAGE_MEDIA_TYPES.has(normalized)) return "image";
  // Do not let active or unsupported image formats fall through to the
  // generic XML/text renderer (notably image/svg+xml).
  if (normalized.startsWith("image/")) return "unsupported";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (normalized === "application/pdf") return "pdf";
  if (MARKDOWN_MEDIA_TYPES.has(normalized)) return "markdown";
  if (normalized === "application/json" || normalized.endsWith("+json")) return "json";
  if (
    normalized.startsWith("text/")
    || normalized.endsWith("+xml")
    || TEXT_APPLICATION_MEDIA_TYPES.has(normalized)
  ) return "text";
  return "unsupported";
}

/**
 * Normalize decrypted review content across the edge-input contract and the
 * retired single-subject contract retained in historical request rows.
 */
export function normalizeHumanReviewInputs(
  decrypted: unknown,
  schemas: HumanInputSchema[],
): HumanReviewInput[] {
  if (
    Array.isArray(decrypted)
    && decrypted.every((input) => (
      input !== null
      && typeof input === "object"
      && typeof (input as { input?: unknown }).input === "string"
      && typeof (input as { source_name?: unknown }).source_name === "string"
      && (input as { schema?: unknown }).schema !== null
      && typeof (input as { schema?: unknown }).schema === "object"
      && Object.hasOwn(input, "value")
    ))
  ) {
    return decrypted as HumanReviewInput[];
  }
  return [{
    input: "legacy",
    source_name: "Legacy review input",
    schema: schemas[0] ?? { type: "json" },
    value: decrypted,
  }];
}

/** Resolve immutable server-snapshotted choices, falling back to static package options. */
export function approvalOptions(
  field: ReviewFormField,
): HumanApprovalOption[] {
  return field.options;
}

/** Validate required and cardinality constraints before an approval is submitted. */
export function validateApprovalAnswers(
  fields: ReviewFormField[],
  answers: Record<string, unknown>,
): string | null {
  for (const field of fields) {
    const value = answers[field.id];
    if (
      field.required &&
      (value == null || value === "" || (Array.isArray(value) && value.length === 0))
    ) {
      return `${field.label} is required`;
    }
    if (field.type === "multi_select" && Array.isArray(value)) {
      if (value.length < (field.min_items ?? 0)) {
        return `${field.label} requires at least ${field.min_items} selections`;
      }
      if (field.max_items != null && value.length > field.max_items) {
        return `${field.label} allows at most ${field.max_items} selections`;
      }
    }
  }
  return null;
}

/** Build one of the three closed decisions while normalizing reviewer text. */
export function buildHumanDecision(
  outcome: HumanDecision["outcome"],
  answers: Record<string, unknown>,
  comment: string,
  decisionText: string,
): HumanDecision | string {
  if (outcome === "approved") {
    const normalizedComment = comment.trim();
    return {
      outcome,
      answers,
      ...(normalizedComment ? { comment: normalizedComment } : {}),
    };
  }
  const normalizedText = decisionText.trim();
  if (!normalizedText) {
    return outcome === "rejected"
      ? "A rejection reason is required"
      : "Change instructions are required";
  }
  return outcome === "changes_requested"
    ? { outcome, instructions: normalizedText }
    : { outcome, reason: normalizedText };
}
