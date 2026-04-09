"use client";

import { useState } from "react";
import type { DomainSession } from "@/lib/types";

interface DomainArtifactPreviewProps {
  session: DomainSession;
  domainName: string;
  onClose: () => void;
}

export function DomainArtifactPreview({
  session,
  domainName,
  onClose,
}: DomainArtifactPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const draft = session.artifact_draft;
  const hasDraft = draft && Object.keys(draft).length > 0;

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-purple-600 text-xs font-bold text-white">
            /
          </span>
          <span className="text-sm font-semibold text-gray-800">
            {domainName} Draft
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-sm p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!hasDraft ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-2 text-3xl text-gray-300">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              No artifact draft yet.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              The draft will appear here as the conversation progresses.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(draft).map(([key, value]) => (
              <div key={key} className="rounded-sm border border-gray-100 p-3">
                <div className="mb-1 text-xs font-medium uppercase text-gray-400">
                  {key.replace(/_/g, " ")}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Turn {session.turn_count}</span>
          <span>
            {hasDraft
              ? `${Object.keys(draft).length} fields`
              : "Empty"}
          </span>
        </div>
      </div>
    </div>
  );
}
