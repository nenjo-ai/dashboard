"use client";

import { useEffect, useRef, useState, useId } from "react";

interface MermaidDiagramProps {
  chart: string;
}

function normalizeMermaidChart(source: string): string {
  const fencedBlockMatch = source.match(/```mermaid\s*([\s\S]*?)```/i);
  const mermaidSource = fencedBlockMatch ? fencedBlockMatch[1] : source;

  const withoutFences = mermaidSource
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return withoutFences.replace(/^mermaid\s*\n/i, "").trim();
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const uniqueId = useId().replace(/:/g, "-");

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains("dark"));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const normalizedChart = normalizeMermaidChart(chart);

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDarkMode ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "Inter, system-ui, sans-serif",
          themeVariables: {
            background: isDarkMode ? "#020617" : "#f8fafc",
            mainBkg: isDarkMode ? "#0f172a" : "#ffffff",
            secondBkg: isDarkMode ? "#1e293b" : "#e2e8f0",
            tertiaryBkg: isDarkMode ? "#334155" : "#f1f5f9",
            primaryColor: isDarkMode ? "#0f172a" : "#ffffff",
            secondaryColor: isDarkMode ? "#1e293b" : "#e2e8f0",
            tertiaryColor: isDarkMode ? "#334155" : "#f1f5f9",
            primaryTextColor: isDarkMode ? "#f8fafc" : "#0f172a",
            secondaryTextColor: isDarkMode ? "#f8fafc" : "#0f172a",
            tertiaryTextColor: isDarkMode ? "#f8fafc" : "#0f172a",
            textColor: isDarkMode ? "#f8fafc" : "#0f172a",
            lineColor: isDarkMode ? "#cbd5e1" : "#334155",
            primaryBorderColor: isDarkMode ? "#94a3b8" : "#334155",
            secondaryBorderColor: isDarkMode ? "#cbd5e1" : "#475569",
            tertiaryBorderColor: isDarkMode ? "#e2e8f0" : "#64748b",
            clusterBkg: isDarkMode ? "#020617" : "#ffffff",
            clusterBorder: isDarkMode ? "#64748b" : "#94a3b8",
            edgeLabelBackground: isDarkMode ? "#020617" : "#ffffff",
            nodeBorder: isDarkMode ? "#cbd5e1" : "#334155",
            actorBorder: isDarkMode ? "#cbd5e1" : "#334155",
            actorBkg: isDarkMode ? "#0f172a" : "#f8fafc",
            actorTextColor: isDarkMode ? "#f8fafc" : "#0f172a",
            labelTextColor: isDarkMode ? "#f8fafc" : "#0f172a",
          },
        });

        await mermaid.parse(normalizedChart, { suppressErrors: false });
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${uniqueId}`,
          normalizedChart,
        );

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
          setSvg("");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, isDarkMode, uniqueId]);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="h-4 w-4 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Mermaid diagram error
          </span>
        </div>
        <pre className="text-xs text-amber-600 dark:text-amber-400 whitespace-pre-wrap overflow-x-auto">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="text-xs text-amber-500 cursor-pointer hover:text-amber-600 dark:hover:text-amber-300">
            Show source
          </summary>
          <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto bg-white dark:bg-gray-900 rounded-sm p-2">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg
            className="h-4 w-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Rendering diagram…
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="not-prose flex justify-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
