"use client";

import { useState, useMemo } from "react";
import type { AgentDefinition, Domain } from "@/lib/types";
import { useAgents, useAgentDomains } from "@/lib/hooks";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { MobileTouchButton } from "./MobileTouchButton";

interface MobileEmptyStateProps {
  agentId: string;
  activeAgent?: AgentDefinition;
  /** Navigate to a session for a different agent */
  onSwitchAgent?: (agent: AgentDefinition) => void;
  /** Enter a domain */
  onEnterDomain?: (domain: Domain) => void;
}

export function MobileEmptyState({
  agentId,
  activeAgent,
  onSwitchAgent,
  onEnterDomain,
}: MobileEmptyStateProps) {
  const [sheetOpen, setSheetOpen] = useState<"agent" | "domain" | null>(null);
  const closeSheet = () => setSheetOpen(null);

  const { agents: allAgents } = useAgents();
  const { agentDomains } = useAgentDomains(agentId);

  const availableAgents = useMemo(
    () => allAgents?.filter((a: AgentDefinition) => a.model_id) ?? [],
    [allAgents],
  );

  const availableDomains: Domain[] = useMemo(
    () => (agentDomains ?? []).filter((rm) => rm.enabled && rm.domain).map((rm) => rm.domain!),
    [agentDomains],
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      {/* Centered nenjo logo — muted */}
      <div className="mb-8 flex flex-col items-center">
        <img
          src="/nenjo-logo-dark.png"
          alt="nenjo"
          className="h-16 w-16 opacity-20 dark:hidden"
        />
        <img
          src="/nenjo-logo-white.png"
          alt="nenjo"
          className="hidden h-16 w-16 opacity-20 dark:block"
        />
        {activeAgent && (
          <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
            Chat with @{activeAgent.name}
          </p>
        )}
      </div>

      {/* Action chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
        {/* Switch Agent chip */}
        {onSwitchAgent && availableAgents.length > 1 && (
          <MobileTouchButton
            onPress={() => setSheetOpen("agent")}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 transition-colors active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Switch Agent
          </MobileTouchButton>
        )}

        {/* Enter Domain chip */}
        {onEnterDomain && availableDomains.length > 0 && (
          <MobileTouchButton
            onPress={() => setSheetOpen("domain")}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 transition-colors active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" />
            </svg>
            Enter Domain
          </MobileTouchButton>
        )}
      </div>

      {/* Switch Agent bottom sheet */}
      <MobileBottomSheet
        open={sheetOpen === "agent"}
        onClose={closeSheet}
        title="Switch Agent"
      >
        <div className="space-y-1">
          {availableAgents.map((agent) => (
            <MobileTouchButton
              key={agent.id}
              onPress={() => {
                closeSheet();
                onSwitchAgent?.(agent);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800 ${
                agent.id === agentId
                  ? "bg-gray-100 dark:bg-gray-800"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <RoleIdenticon roleId={agent.id} color={agent.color} size={32} className="shrink-0" roleName={agent.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  @{agent.name}
                </p>
                {agent.display_name && agent.display_name !== agent.name && (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {agent.display_name}
                  </p>
                )}
              </div>
              {agent.id === agentId && (
                <span className="shrink-0 text-[10px] font-medium text-deep-space-blue-500 dark:text-deep-space-blue-400">
                  Active
                </span>
              )}
            </MobileTouchButton>
          ))}
        </div>
      </MobileBottomSheet>

      {/* Enter Domain bottom sheet */}
      <MobileBottomSheet
        open={sheetOpen === "domain"}
        onClose={closeSheet}
        title="Enter Domain"
      >
        <div className="space-y-1">
          {availableDomains.map((domain) => (
            <MobileTouchButton
              key={domain.id}
              onPress={() => {
                closeSheet();
                onEnterDomain?.(domain);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                #
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {domain.command}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {domain.display_name}
                </p>
              </div>
            </MobileTouchButton>
          ))}
        </div>
      </MobileBottomSheet>
    </div>
  );
}
