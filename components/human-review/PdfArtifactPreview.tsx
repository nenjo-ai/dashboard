"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_VIEWPORT_DIMENSION = 2_400;
const MIN_SCALE = 0.75;
const MAX_SCALE = 2;
const SCALE_STEP = 0.25;

type PdfArtifactPreviewProps = {
  data: Uint8Array;
  name: string;
};

export function PdfArtifactPreview({ data, name }: PdfArtifactPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null;

    setDocument(null);
    setPageNumber(1);
    setScale(1);
    setError(null);
    setLoading(true);

    if (data.byteLength > MAX_PDF_BYTES) {
      setError("This PDF is too large to preview safely. Download it to view the complete file.");
      setLoading(false);
      return;
    }

    void import("pdfjs-dist").then(async (pdfjs) => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      // PDF.js may transfer its input buffer to the worker, so give it a private copy.
      loadingTask = pdfjs.getDocument({
        data: data.slice(),
        maxImageSize: MAX_CANVAS_PIXELS,
        canvasMaxAreaInBytes: MAX_CANVAS_PIXELS * 4,
        enableXfa: false,
      });
      const loadedDocument = await loadingTask.promise;
      if (!cancelled) setDocument(loadedDocument);
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "PDF preview could not be loaded");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      const task = loadingTask;
      loadingTask = null;
      if (task) void task.destroy();
    };
  }, [data]);

  useEffect(() => {
    if (!document) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let renderedPage: PDFPageProxy | null = null;
    setRendering(true);
    setError(null);

    void document.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      renderedPage = page;

      const requestedViewport = page.getViewport({ scale });
      if (!Number.isFinite(requestedViewport.width)
        || !Number.isFinite(requestedViewport.height)
        || requestedViewport.width <= 0
        || requestedViewport.height <= 0) {
        throw new Error("This PDF page has invalid dimensions");
      }
      const viewportLimit = Math.min(
        1,
        MAX_VIEWPORT_DIMENSION / requestedViewport.width,
        MAX_VIEWPORT_DIMENSION / requestedViewport.height,
      );
      const viewport = viewportLimit < 1
        ? page.getViewport({ scale: scale * viewportLimit })
        : requestedViewport;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const pixelLimit = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
      const outputScale = Math.min(pixelRatio, pixelLimit);
      if (!canvas.getContext("2d", { alpha: false })) {
        throw new Error("Canvas rendering is unavailable in this browser");
      }

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await renderTask.promise;
    }).catch((cause: unknown) => {
      if (!cancelled && !(cause instanceof Error && cause.name === "RenderingCancelledException")) {
        setError(cause instanceof Error ? cause.message : "PDF page could not be rendered");
      }
    }).finally(() => {
      if (!cancelled) setRendering(false);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      renderedPage?.cleanup();
    };
  }, [document, pageNumber, scale]);

  if (loading) {
    return <div className="theme-surface-muted theme-text-muted mt-3 flex h-64 items-center justify-center gap-2 rounded-lg text-sm" role="status">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      Loading PDF preview…
    </div>;
  }

  if (!document || error) {
    return <p className="theme-surface-muted mt-3 rounded-lg p-3 text-sm text-amber-600" role="alert">
      {error ?? "PDF preview could not be loaded"} You can still download the original file.
    </p>;
  }

  return <section className="theme-border mt-3 overflow-hidden rounded-lg border" aria-label={`Preview ${name}`}>
    <div className="theme-surface-muted theme-border flex flex-wrap items-center justify-between gap-2 border-b p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          disabled={pageNumber <= 1 || rendering}
          aria-label="Previous PDF page"
          className="theme-border theme-text rounded-md border p-1.5 disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="theme-text min-w-24 text-center text-xs">
          Page {pageNumber} of {document.numPages}
        </span>
        <button
          type="button"
          onClick={() => setPageNumber((current) => Math.min(document.numPages, current + 1))}
          disabled={pageNumber >= document.numPages || rendering}
          aria-label="Next PDF page"
          className="theme-border theme-text rounded-md border p-1.5 disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setScale((current) => Math.max(MIN_SCALE, current - SCALE_STEP))}
          disabled={scale <= MIN_SCALE || rendering}
          aria-label="Zoom PDF out"
          className="theme-border theme-text rounded-md border p-1.5 disabled:opacity-40"
        >
          <ZoomOut aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="theme-text min-w-12 text-center text-xs">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => setScale((current) => Math.min(MAX_SCALE, current + SCALE_STEP))}
          disabled={scale >= MAX_SCALE || rendering}
          aria-label="Zoom PDF in"
          className="theme-border theme-text rounded-md border p-1.5 disabled:opacity-40"
        >
          <ZoomIn aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
    <div className="theme-surface-muted relative max-h-[32rem] overflow-auto p-3">
      {rendering ? <span className="theme-surface theme-text-muted absolute right-4 top-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs shadow" role="status">
        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Rendering…
      </span> : null}
      <canvas ref={canvasRef} className="mx-auto block max-w-none shadow" aria-label={`Page ${pageNumber} of ${name}`} />
    </div>
  </section>;
}
