"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { fetchArtifactContent } from "@/lib/api";
import {
  readStoredActiveOrgId,
  subscribeStoredActiveOrgId,
} from "@/lib/activeOrg";
import { decryptContentPayload } from "@/lib/cryptoContent";
import {
  artifactPreviewKind,
  normalizeArtifactMediaType,
  type ArtifactPreviewKind,
} from "@/lib/humanReview";

export type LoadedArtifact = {
  content: Uint8Array;
  mediaType: string;
  name: string;
  previewKind: ArtifactPreviewKind;
  previewText?: string;
  previewTruncated: boolean;
};

const MAX_TEXT_PREVIEW_CHARS = 200_000;
const MAX_BROWSER_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_ARTIFACTS = 8;
const loadedArtifactCache = new Map<string, LoadedArtifact>();

export function evictLoadedArtifacts(
  artifactIds: readonly string[],
  orgId: string | null,
) {
  for (const artifactId of artifactIds) {
    const key = `${orgId ?? "no-org"}:${artifactId}`;
    const artifact = loadedArtifactCache.get(key);
    artifact?.content.fill(0);
    loadedArtifactCache.delete(key);
  }
}

const PdfArtifactPreview = dynamic(
  () => import("@/components/human-review/PdfArtifactPreview").then((module) => module.PdfArtifactPreview),
  {
    ssr: false,
    loading: () => <PreviewLoading label="Loading PDF preview…" />,
  },
);

function PreviewLoading({ label }: { label: string }) {
  return <div className="theme-surface-muted theme-text-muted mt-3 flex h-64 items-center justify-center gap-2 rounded-lg text-sm" role="status">
    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
    {label}
  </div>;
}

function decodeBase64Bytes(contentBase64: string, expectedSize: number): Uint8Array {
  const maximumEncodedLength = Math.ceil(MAX_BROWSER_ARTIFACT_BYTES / 3) * 4 + 4;
  if (contentBase64.length > maximumEncodedLength) {
    throw new Error("Artifact is too large to open in the dashboard");
  }
  let binary: string;
  try {
    binary = atob(contentBase64);
  } catch {
    throw new Error("Artifact content is not valid base64");
  }
  if (binary.length !== expectedSize || binary.length > MAX_BROWSER_ARTIFACT_BYTES) {
    throw new Error("Artifact content size does not match its immutable metadata");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Digest(content: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content.slice().buffer);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function formattedJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export async function loadArtifact(
  artifactId: string,
  signal?: AbortSignal,
): Promise<LoadedArtifact> {
  const artifact = await fetchArtifactContent(artifactId, signal);
  const plaintext = await decryptContentPayload(artifact.encrypted);
  if (!plaintext) throw new Error("Artifact could not be decrypted");
  let payload: unknown;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    throw new Error("Artifact content envelope is invalid");
  }
  if (
    payload === null
    || typeof payload !== "object"
    || Array.isArray(payload)
    || Object.keys(payload).length !== 1
    || typeof (payload as { content_base64?: unknown }).content_base64 !== "string"
  ) {
    throw new Error("Artifact content envelope is invalid");
  }

  const mediaType = normalizeArtifactMediaType(artifact.mediaType);
  const previewKind = artifactPreviewKind(mediaType);
  const isText = previewKind === "json" || previewKind === "markdown" || previewKind === "text";
  const content = decodeBase64Bytes(
    (payload as { content_base64: string }).content_base64,
    artifact.plaintextSize,
  );
  if (await sha256Digest(content) !== artifact.plaintextDigest) {
    throw new Error("Artifact content digest does not match its immutable metadata");
  }
  const decodedText = isText ? new TextDecoder().decode(content) : undefined;
  return {
    content,
    mediaType,
    name: artifact.name,
    previewKind,
    previewText: decodedText?.slice(0, MAX_TEXT_PREVIEW_CHARS),
    previewTruncated: decodedText !== undefined && decodedText.length > MAX_TEXT_PREVIEW_CHARS,
  };
}

type ArtifactLoadState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; artifact: LoadedArtifact }
  | { key: string; status: "failed"; error: Error };

function rememberLoadedArtifact(key: string, artifact: LoadedArtifact) {
  loadedArtifactCache.delete(key);
  loadedArtifactCache.set(key, artifact);
  while (loadedArtifactCache.size > MAX_CACHED_ARTIFACTS) {
    const oldest = loadedArtifactCache.keys().next().value as string | undefined;
    if (!oldest) break;
    loadedArtifactCache.delete(oldest);
  }
}

function useLoadedArtifact(
  artifactId: string,
  loader: (artifactId: string, signal?: AbortSignal) => Promise<LoadedArtifact>,
) {
  const orgId = useSyncExternalStore(
    subscribeStoredActiveOrgId,
    readStoredActiveOrgId,
    () => null,
  );
  const key = `${orgId ?? "no-org"}:${artifactId}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ArtifactLoadState>(() => ({
    key,
    status: "loading",
  }));

  useEffect(() => {
    let active = true;
    const cached = loadedArtifactCache.get(key);
    if (cached) {
      loadedArtifactCache.delete(key);
      loadedArtifactCache.set(key, cached);
      queueMicrotask(() => {
        if (active) setState({ key, status: "ready", artifact: cached });
      });
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) setState({ key, status: "loading" });
    });
    void loader(artifactId, controller.signal).then((artifact) => {
      rememberLoadedArtifact(key, artifact);
      if (active) setState({ key, status: "ready", artifact });
    }).catch((cause: unknown) => {
      if (!active || controller.signal.aborted) return;
      setState({
        key,
        status: "failed",
        error: cause instanceof Error ? cause : new Error("Artifact could not be loaded"),
      });
    });
    return () => {
      active = false;
      controller.abort(new DOMException("Artifact selection changed", "AbortError"));
    };
  }, [artifactId, attempt, key, loader]);

  const current = state.key === key ? state : undefined;
  return {
    artifact: current?.status === "ready" ? current.artifact : undefined,
    error: current?.status === "failed" ? current.error : undefined,
    isLoading: current?.status !== "ready" && current?.status !== "failed",
    retry: () => {
      loadedArtifactCache.delete(key);
      setState({ key, status: "loading" });
      setAttempt((value) => value + 1);
    },
  };
}

function useMediaObjectUrl(artifact: LoadedArtifact | undefined): string | undefined {
  const [objectUrl, setObjectUrl] = useState<{ artifact: LoadedArtifact; url: string }>();
  useEffect(() => {
    if (!artifact) return;
    const url = URL.createObjectURL(new Blob(
      [artifact.content.slice().buffer],
      { type: artifact.mediaType },
    ));
    let active = true;
    queueMicrotask(() => {
      if (active) setObjectUrl({ artifact, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [artifact]);
  if (!objectUrl || objectUrl.artifact !== artifact) return undefined;
  return objectUrl.url;
}

function downloadArtifact(artifact: LoadedArtifact) {
  const url = URL.createObjectURL(new Blob(
    [artifact.content.slice().buffer],
    { type: artifact.mediaType },
  ));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function ArtifactContent({ artifact, objectUrl }: { artifact: LoadedArtifact; objectUrl?: string }) {
  if (artifact.previewKind === "image") {
    if (!objectUrl) return <PreviewLoading label="Preparing image preview…" />;
    return <div className="theme-surface-muted mt-3 flex justify-center overflow-hidden rounded-lg p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={objectUrl} alt={artifact.name} className="max-h-[32rem] max-w-full object-contain" />
    </div>;
  }
  if (artifact.previewKind === "audio") {
    return objectUrl ? <audio controls preload="metadata" src={objectUrl} className="mt-3 w-full" /> : <PreviewLoading label="Preparing audio preview…" />;
  }
  if (artifact.previewKind === "video") {
    return objectUrl ? <video controls preload="metadata" src={objectUrl} className="theme-surface-muted mt-3 max-h-[32rem] w-full rounded-lg" /> : <PreviewLoading label="Preparing video preview…" />;
  }
  if (artifact.previewKind === "pdf") {
    return <PdfArtifactPreview data={artifact.content} name={artifact.name} />;
  }
  if (artifact.previewKind === "markdown") {
    return <div className="theme-surface-muted prose prose-sm mt-3 max-h-[32rem] max-w-none overflow-auto rounded-lg p-4 dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
          img: ({ alt }) => <span className="theme-text-muted">[Embedded image omitted{alt ? `: ${alt}` : ""}]</span>,
        }}
      >{artifact.previewText ?? ""}</ReactMarkdown>
      {artifact.previewTruncated ? <p className="theme-text-muted text-xs">Preview truncated. Download the artifact to view the complete file.</p> : null}
    </div>;
  }
  if (artifact.previewKind === "json" || artifact.previewKind === "text") {
    const text = artifact.previewKind === "json"
      ? formattedJson(artifact.previewText ?? "")
      : artifact.previewText ?? "";
    return <div className="theme-surface-muted mt-3 max-h-[32rem] overflow-auto rounded-lg p-4">
      <pre className="theme-text whitespace-pre-wrap break-words font-mono text-xs">{text}</pre>
      {artifact.previewTruncated ? <p className="theme-text-muted mt-2 text-xs">Preview truncated. Download the artifact to view the complete file.</p> : null}
    </div>;
  }
  return <p className="theme-surface-muted theme-text-muted mt-3 rounded-lg p-3 text-xs">
    This file type cannot be previewed in the dashboard. Use the download button to open it locally.
  </p>;
}

export function ArtifactViewer({
  artifactId,
  framed = true,
  loader = loadArtifact,
  actions,
}: {
  artifactId: string;
  framed?: boolean;
  loader?: (artifactId: string, signal?: AbortSignal) => Promise<LoadedArtifact>;
  actions?: ReactNode;
}) {
  const { artifact, error, isLoading, retry } = useLoadedArtifact(artifactId, loader);
  const mediaArtifact = artifact && (
    artifact.previewKind === "image"
    || artifact.previewKind === "audio"
    || artifact.previewKind === "video"
  ) ? artifact : undefined;
  const objectUrl = useMediaObjectUrl(mediaArtifact);

  return <div className={framed ? "theme-border rounded-lg border p-3" : undefined}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="theme-text truncate text-sm font-medium">{artifact?.name ?? "Uploaded artifact"}</p>
        <p className="theme-text-muted truncate font-mono text-xs">{artifactId}</p>
        {artifact ? <p className="theme-text-muted truncate text-xs">{artifact.mediaType}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {artifact ? <button
          type="button"
          onClick={() => downloadArtifact(artifact)}
          aria-label={`Download ${artifact.name}`}
          title={`Download ${artifact.name}`}
          className="theme-border inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-cyan-600 transition-colors hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-cyan-950/30"
        >
          <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
        </button> : isLoading ? <span role="status" aria-label="Loading artifact" className="theme-border theme-text-muted inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        </span> : null}
      </div>
    </div>
    {isLoading ? <PreviewLoading label="Loading preview…" /> : null}
    {artifact ? <ArtifactContent artifact={artifact} objectUrl={objectUrl} /> : null}
    {error ? <div className="mt-2 flex items-center gap-2 text-xs text-red-600" role="alert">
      <span>{error instanceof Error ? error.message : "Artifact could not be loaded"}</span>
      <button type="button" onClick={retry} className="font-medium underline underline-offset-2">Retry</button>
    </div> : null}
  </div>;
}
