"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Node data shape
// ---------------------------------------------------------------------------

export interface TriggerNodeData {
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Entry Node (source-only, represents the routine graph entry)
// ---------------------------------------------------------------------------

function TriggerNodeInner({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  return (
    <div
      className={`
        relative rounded-full border-2 shadow-xs transition-all px-5 py-2.5
        bg-violet-50 border-violet-300 dark:bg-violet-900/30 dark:border-violet-600
        ${selected ? "ring-2 ring-violet-400 ring-offset-2 dark:ring-offset-gray-900" : ""}
        hover:shadow-md
      `}
    >
      {/* Content */}
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
        <span className="text-sm font-semibold text-violet-700 dark:text-violet-300 whitespace-nowrap">
          {nodeData.label}
        </span>
      </div>

      {/* Output handle only */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3! h-3! bg-violet-400! border-2! border-white! dark:border-gray-800! -bottom-1.5!"
      />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeInner);
