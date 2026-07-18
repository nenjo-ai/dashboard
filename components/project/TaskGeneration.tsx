"use client";

import { useState, useCallback } from "react";
import { generateTasks } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface TaskGenerationProps {
  projectId: string;
  onGenerated: () => void;
}

export function TaskGeneration({
  projectId,
  onGenerated,
}: TaskGenerationProps) {
  const [spec, setSpec] = useState("");
  const [webLinks, setWebLinks] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setResult(null);

      if (!spec.trim()) {
        setError("Specification text is required.");
        return;
      }

      setIsGenerating(true);

      try {
        const links = webLinks
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        const res = await generateTasks(projectId, {
          specification: spec.trim(),
          web_links: links.length > 0 ? links : undefined,
        });

        setResult({ count: res.count });
        onGenerated();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate tasks.",
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, spec, webLinks, onGenerated],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Generate Tasks from PRD
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paste your specification or PRD document. The AI will parse it into
          atomic, actionable tasks with clear priorities.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Success */}
        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <svg
              className="h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Successfully generated {result.count} task
            {result.count !== 1 ? "s" : ""}! View them in the Tasks tab.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Specification */}
        <div>
          <label
            htmlFor="spec-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Specification / PRD <span className="text-flag-red-500">*</span>
          </label>
          <textarea
            id="spec-input"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder={`Paste your PRD or specification here...\n\nExample:\n## User Authentication\n- Users should be able to sign up with email\n- Password must be at least 8 characters\n- Support OAuth with Google and GitHub`}
            rows={12}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs placeholder:text-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 font-mono resize-y dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            disabled={isGenerating}
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {spec.length} characters
          </p>
        </div>

        {/* Web Links */}
        <div>
          <label
            htmlFor="links-input"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Reference Links{" "}
            <span className="text-gray-400 font-normal dark:text-gray-500">(optional)</span>
          </label>
          <textarea
            id="links-input"
            value={webLinks}
            onChange={(e) => setWebLinks(e.target.value)}
            placeholder="One URL per line..."
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs placeholder:text-gray-400 focus:border-deep-space-blue-500 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-500 resize-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            disabled={isGenerating}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="submit" disabled={isGenerating || !spec.trim()}>
            {isGenerating ? (
              <>
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
                Generating tasks...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
                Generate Tasks
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
