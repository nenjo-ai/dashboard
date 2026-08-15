"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RoutineStepType } from "@/lib/types";
import {
  HANDLE_GATE_PASS, HANDLE_GATE_FAIL, HANDLE_HUMAN_APPROVED,
  HANDLE_HUMAN_CHANGES, HANDLE_HUMAN_REJECTED,
} from "./constants";

// ---------------------------------------------------------------------------
// Node data shape
// ---------------------------------------------------------------------------

export interface StepNodeData {
  stepId?: string;
  label: string;
  stepType: RoutineStepType;
  agentId: string | null;
  agentName: string | null;
  agentRole: string | null; // role_id from DB
  councilId: string | null;
  councilName: string | null;
  delegationStrategy: string | null;
  memberCount: number | null;
  config: Record<string, unknown>;
  encryptedPayload?: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Step type styling
// ---------------------------------------------------------------------------

const STEP_STYLES: Record<RoutineStepType, { bg: string; border: string; icon: string; iconBg: string }> = {
  agent: {
    bg: "theme-surface",
    border: "border-deep-space-blue-300 dark:border-deep-space-blue-600",
    icon: "✦",
    iconBg: "bg-deep-space-blue-100 text-deep-space-blue-600 dark:bg-deep-space-blue-900/50 dark:text-deep-space-blue-300",
  },
  gate: {
    bg: "theme-surface",
    border: "border-amber-300 dark:border-amber-600",
    icon: "⬥",
    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300",
  },
  human: {
    bg: "theme-surface",
    border: "border-cyan-300 dark:border-cyan-600",
    icon: "◉",
    iconBg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
  },
  terminal: {
    bg: "theme-surface",
    border: "border-emerald-300 dark:border-emerald-600",
    icon: "●",
    iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  council: {
    bg: "theme-surface",
    border: "border-purple-300 dark:border-purple-600",
    icon: "⚑",
    iconBg: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300",
  },
  terminal_fail: {
    bg: "theme-surface",
    border: "border-red-300 dark:border-red-600",
    icon: "✕",
    iconBg: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300",
  },
};

// ---------------------------------------------------------------------------
// Routine Step Node
// ---------------------------------------------------------------------------

function RoutineStepNodeInner({ data, selected }: NodeProps) {
  const nodeData = data as unknown as StepNodeData;
  const style = STEP_STYLES[nodeData.stepType] ?? STEP_STYLES.agent;

  // Top label: step name (label) for all step types
  const topLabel = nodeData.label || nodeData.stepType.charAt(0).toUpperCase() + nodeData.stepType.slice(1);

  // Bottom label: council info, agent name, or step type
  const bottomLabel =
    nodeData.stepType === "council"
      ? nodeData.councilName
        ? [
            nodeData.councilName,
            nodeData.delegationStrategy
              ? nodeData.delegationStrategy.charAt(0).toUpperCase() + nodeData.delegationStrategy.slice(1).replace("_", " ")
              : null,
            nodeData.memberCount != null ? `${nodeData.memberCount} member${nodeData.memberCount !== 1 ? "s" : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null
      : (nodeData.stepType === "agent" || nodeData.stepType === "gate") && nodeData.agentName
        ? nodeData.agentName
        : null;

  const isTerminal = nodeData.stepType === "terminal" || nodeData.stepType === "terminal_fail";

  return (
    <div
      className={`
        relative rounded-lg border-2 shadow-xs transition-all min-w-[140px] md:min-w-[180px]
        ${style.bg} ${style.border}
        ${selected ? "ring-2 ring-deep-space-blue-400 ring-offset-2 dark:ring-offset-[#05070b]" : ""}
        hover:shadow-md
      `}
    >
      {/* Input handle (top center) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3! h-3! bg-gray-400! border-2! theme-surface! -top-1.5!"
      />

      {/* Content */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-sm text-xs font-bold ${style.iconBg}`}>
            {style.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {topLabel}
            </div>
            {bottomLabel && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {bottomLabel}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Output handles */}
      {nodeData.stepType === "human" ? (
        <>
          {[
            [HANDLE_HUMAN_APPROVED, "approved", "20%", "bg-emerald-400!"],
            [HANDLE_HUMAN_CHANGES, "changes", "50%", "bg-amber-400!"],
            [HANDLE_HUMAN_REJECTED, "rejected", "80%", "bg-red-400!"],
          ].map(([id, label, left, color]) => (
            <div key={id}>
              <Handle type="source" position={Position.Bottom} id={id}
                className={`w-3! h-3! ${color} border-2! theme-surface! -bottom-1.5!`}
                style={{ left }} />
              <span className="absolute bottom-0 -translate-x-1/2 translate-y-full pt-0.5 text-[8px] font-medium uppercase text-gray-500 pointer-events-none"
                style={{ left }}>{label}</span>
            </div>
          ))}
        </>
      ) : nodeData.stepType === "gate" ? (
        <>
          {/* Gate: pass-out (bottom-left, green) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id={HANDLE_GATE_PASS}
            className="w-3! h-3! bg-emerald-400! border-2! theme-surface! -bottom-1.5!"
            style={{ left: "30%" }}
          />
          <span className="absolute bottom-0 left-[18%] translate-y-full pt-0.5 text-[9px] font-medium tracking-wide uppercase text-emerald-500 dark:text-emerald-400 pointer-events-none select-none">
            pass
          </span>

          {/* Gate: fail-out (bottom-right, red) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id={HANDLE_GATE_FAIL}
            className="w-3! h-3! bg-red-400! border-2! theme-surface! -bottom-1.5!"
            style={{ left: "70%" }}
          />
          <span className="absolute bottom-0 right-[18%] translate-y-full pt-0.5 text-[9px] font-medium tracking-wide uppercase text-red-400 dark:text-red-400 pointer-events-none select-none">
            fail
          </span>
        </>
      ) : !isTerminal ? (
        /* Agent/other: single output (bottom center) */
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3! h-3! bg-gray-400! border-2! theme-surface! -bottom-1.5!"
        />
      ) : null}
    </div>
  );
}

export const RoutineStepNode = memo(RoutineStepNodeInner);
