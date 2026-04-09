"use client";

import { useState } from "react";
import { useDomains, useAgentDomains } from "@/lib/hooks";
import { assignDomainToAgent, removeDomainFromAgent, toggleAgentDomain } from "@/lib/api";
import type { Domain } from "@/lib/types";

interface AgentDomainsPanelProps {
  agentId: string;
}

export function AgentDomainsPanel({ agentId }: AgentDomainsPanelProps) {
  const { domains, isLoading: domainsLoading } = useDomains();
  const { agentDomains, isLoading: assignmentsLoading, mutate } = useAgentDomains(agentId);
  const [toggling, setToggling] = useState<string | null>(null);

  const isLoading = domainsLoading || assignmentsLoading;

  // Build a map of domain_id -> assignment for quick lookup
  const assignmentMap = new Map(
    (agentDomains ?? []).map((rm) => [rm.domain_id, rm]),
  );

  const handleToggle = async (domain: Domain) => {
    if (toggling) return;
    setToggling(domain.id);

    const existing = assignmentMap.get(domain.id);
    try {
      if (!existing) {
        await assignDomainToAgent(agentId, domain.id);
      } else if (existing.enabled) {
        await toggleAgentDomain(agentId, domain.id, false);
      } else {
        await toggleAgentDomain(agentId, domain.id, true);
      }
      mutate();
    } catch {
      // Silently fail -- in production show a toast
    } finally {
      setToggling(null);
    }
  };

  const handleRemove = async (domainId: string) => {
    if (toggling) return;
    setToggling(domainId);
    try {
      await removeDomainFromAgent(agentId, domainId);
      mutate();
    } catch {
      // Silently fail
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
          />
        ))}
      </div>
    );
  }

  if (!domains || domains.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No domains available. Create domains in the Domains tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {domains.map((domain) => {
        const assignment = assignmentMap.get(domain.id);
        const isAssigned = !!assignment;
        const isEnabled = assignment?.enabled ?? false;
        const isProcessing = toggling === domain.id;

        return (
          <div
            key={domain.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
              isAssigned && isEnabled
                ? "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-900/20"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() => handleToggle(domain)}
                disabled={isProcessing}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  isAssigned && isEnabled
                    ? "bg-purple-500"
                    : "bg-gray-300 dark:bg-gray-600"
                } ${isProcessing ? "opacity-50" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                    isAssigned && isEnabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>

              {/* Domain info */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {domain.display_name}
                  </span>
                  <span className="rounded-sm bg-purple-100 px-1.5 py-0.5 text-xs font-mono text-purple-600 dark:bg-purple-900/40 dark:text-purple-300">
                    {domain.command}
                  </span>
                </div>
                {domain.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {domain.description}
                  </p>
                )}
              </div>
            </div>

            {/* Category badge + remove */}
            <div className="flex items-center gap-2">
              {domain.category && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  {domain.category}
                </span>
              )}
              {isAssigned && (
                <button
                  onClick={() => handleRemove(domain.id)}
                  disabled={isProcessing}
                  className="rounded-md p-1 text-gray-400 transition-colors hover:text-flag-red-500 disabled:opacity-50"
                  title="Remove from agent"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
