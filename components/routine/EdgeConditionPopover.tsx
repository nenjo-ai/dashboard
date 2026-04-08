"use client";

import { useState, useRef, useEffect } from "react";
import { ROUTINE_EDGE_CONDITIONS, type RoutineEdgeCondition } from "@/lib/types";
import { Button } from "@/components/ui/Button";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EdgeConditionPopoverProps {
  edgeId: string;
  condition: RoutineEdgeCondition;
  sourceLabel: string;
  targetLabel: string;
  position: { x: number; y: number };
  onChangeCondition: (edgeId: string, condition: RoutineEdgeCondition) => void;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EdgeConditionPopover({
  edgeId,
  condition,
  sourceLabel,
  targetLabel,
  position,
  onChangeCondition,
  onDelete,
  onClose,
}: EdgeConditionPopoverProps) {
  const [localCondition, setLocalCondition] = useState(condition);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSave = () => {
    if (localCondition !== condition) {
      onChangeCondition(edgeId, localCondition);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
      style={{ left: position.x, top: position.y }}
    >
      <div className="border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
          Edge Condition
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {sourceLabel} → {targetLabel}
        </p>
      </div>

      <div className="p-3 space-y-3">
        <select
          value={localCondition}
          onChange={(e) => setLocalCondition(e.target.value as RoutineEdgeCondition)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {ROUTINE_EDGE_CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <Button onClick={handleSave} size="sm" className="flex-1">
            Save
          </Button>
          <Button
            onClick={() => onDelete(edgeId)}
            variant="danger"
            size="sm"
            className="flex-1"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
