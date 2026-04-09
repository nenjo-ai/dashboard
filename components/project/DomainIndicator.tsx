"use client";

import type { DomainSession } from "@/lib/types";
import { agentColorBg, agentColorText } from "@/lib/agent-colors";

interface DomainIndicatorProps {
  session: DomainSession;
  domainName: string;
  domainCommand: string;
  onExit: () => void;
  onCancel: () => void;
  agentColor?: string;
}

export function DomainIndicator({
  session,
  domainName,
  domainCommand,
  onExit,
  onCancel,
  agentColor,
}: DomainIndicatorProps) {
  const bgColor = agentColor ? agentColorBg(agentColor) : undefined;
  const textColor = agentColor ? agentColorText(agentColor) : undefined;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        agentColor ? "" : "border-purple-200 bg-purple-50"
      }`}
      style={
        agentColor
          ? {
              borderColor: `${agentColor}33`,
              backgroundColor: bgColor,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white ${
            agentColor ? "" : "bg-purple-600"
          }`}
          style={agentColor ? { backgroundColor: agentColor } : undefined}
        >
          /
        </span>
        <span
          className={agentColor ? "text-sm font-medium" : "text-sm font-medium text-purple-800"}
          style={agentColor ? { color: textColor } : undefined}
        >
          {domainName}
        </span>
        <span
          className={agentColor ? "text-xs" : "text-xs text-purple-500"}
          style={agentColor ? { color: textColor, opacity: 0.7 } : undefined}
        >
          {domainCommand}
        </span>
      </div>

      <div
        className={agentColor ? "mx-2 h-4 w-px" : "mx-2 h-4 w-px bg-purple-200"}
        style={agentColor ? { backgroundColor: `${agentColor}33` } : undefined}
      />

      <span
        className={agentColor ? "text-xs" : "text-xs text-purple-600"}
        style={agentColor ? { color: textColor } : undefined}
      >
        Turn {session.turn_count}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onExit}
          className={
            agentColor
              ? "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              : "rounded-sm px-2 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          }
          style={agentColor ? { color: textColor } : undefined}
        >
          #done
        </button>
        <button
          onClick={onCancel}
          className="rounded-sm px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
