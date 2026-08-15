"use client";

import { useCallback, useState } from "react";

import {
  ArtifactViewer,
  type LoadedArtifact,
} from "@/components/artifacts/ArtifactViewer";

const TEXT_BYTES = new TextEncoder().encode("Stable artifact preview");
const SLOW_BYTES = new TextEncoder().encode("Stale slow artifact");
const RECOVERED_BYTES = new TextEncoder().encode("Recovered after retry");
const IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let failureAttempts = 0;

function textArtifact(name: string, content: Uint8Array): LoadedArtifact {
  return {
    content,
    mediaType: "text/plain",
    name,
    previewKind: "text",
    previewText: new TextDecoder().decode(content),
    previewTruncated: false,
  };
}

function imageArtifact(): LoadedArtifact {
  const binary = atob(IMAGE_BASE64);
  return {
    content: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    mediaType: "image/png",
    name: "pixel.png",
    previewKind: "image",
    previewTruncated: false,
  };
}

function delayedArtifact(signal?: AbortSignal): Promise<LoadedArtifact> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(textArtifact("slow.txt", SLOW_BYTES));
    }, 400);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function ArtifactViewerHarnessClient() {
  const [artifactId, setArtifactId] = useState("fixture-text");
  const loader = useCallback(async (id: string, signal?: AbortSignal) => {
    if (id === "fixture-image") return imageArtifact();
    if (id === "fixture-slow") return delayedArtifact(signal);
    if (id === "fixture-failure" && failureAttempts++ === 0) {
      throw new Error("Synthetic artifact failure");
    }
    if (id === "fixture-failure") {
      return textArtifact("recovered.txt", RECOVERED_BYTES);
    }
    return textArtifact("stable.txt", TEXT_BYTES);
  }, []);

  return <main className="mx-auto max-w-3xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Artifact viewer browser harness</h1>
    <nav className="flex flex-wrap gap-2" aria-label="Artifact fixtures">
      <button type="button" onClick={() => setArtifactId("fixture-text")}>Text fixture</button>
      <button type="button" onClick={() => setArtifactId("fixture-image")}>Image fixture</button>
      <button type="button" onClick={() => setArtifactId("fixture-slow")}>Slow fixture</button>
      <button type="button" onClick={() => setArtifactId("fixture-failure")}>Failure fixture</button>
    </nav>
    <ArtifactViewer artifactId={artifactId} loader={loader} />
  </main>;
}
