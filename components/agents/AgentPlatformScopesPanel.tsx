"use client";

import { useState } from "react";
import { updateAgentPlatformScopes } from "@/lib/api";
import type { AgentDefinition } from "@/lib/types";
import { Button } from "@/components/ui/Button";

/** Group scopes by resource for a cleaner layout. */
const SCOPE_GROUPS = [
  { label: "Agents", scopes: ["agents:read", "agents:write"] },
  { label: "Projects", scopes: ["projects:read", "projects:write"] },
  { label: "Routines", scopes: ["routines:read", "routines:write"] },
  { label: "MCP Servers", scopes: ["mcp_servers:read", "mcp_servers:write"] },
  { label: "Chat", scopes: ["chat:read", "chat:write"] },
  { label: "Models", scopes: ["models:read", "models:write"] },
] as const;

interface AgentPlatformScopesPanelProps {
  agent: AgentDefinition;
  onSaved: () => void;
}

export function AgentPlatformScopesPanel({ agent, onSaved }: AgentPlatformScopesPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(agent.platform_scopes),
  );
  const [saving, setSaving] = useState(false);

  const isDirty =
    selected.size !== agent.platform_scopes.length ||
    agent.platform_scopes.some((s) => !selected.has(s));

  const toggle = (scope: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
        // If removing read, also remove write for same resource
        if (scope.endsWith(":read")) {
          next.delete(scope.replace(":read", ":write"));
        }
      } else {
        next.add(scope);
        // If adding write, also add read for same resource
        if (scope.endsWith(":write")) {
          next.add(scope.replace(":write", ":read"));
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgentPlatformScopes(agent.id, Array.from(selected));
      onSaved();
    } catch {
      // TODO: toast
    } finally {
      setSaving(false);
    }
  };

  const readCount = Array.from(selected).filter((s) => s.endsWith(":read")).length;
  const writeCount = Array.from(selected).filter((s) => s.endsWith(":write")).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{readCount} read</span>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span>{writeCount} write</span>
      </div>

      <div className="space-y-3">
        {SCOPE_GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-3">
              {group.scopes.map((scope) => {
                const isChecked = selected.has(scope);
                const accessType = scope.split(":")[1];
                return (
                  <label
                    key={scope}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(scope)}
                      className="h-3.5 w-3.5 rounded-sm border-gray-300 text-deep-space-blue-600 focus:ring-deep-space-blue-500 dark:border-gray-600"
                    />
                    <span className={`text-xs font-medium ${
                      accessType === "write"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-700 dark:text-gray-300"
                    }`}>
                      {accessType}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isDirty && (
        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Scopes"}
          </Button>
        </div>
      )}
    </div>
  );
}
