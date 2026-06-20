"use client";

import { useState } from "react";
import { updateAgentPlatformScopes } from "@/lib/api";
import { agentColorAlpha } from "@/lib/agent-colors";
import type { AgentDefinition } from "@/lib/types";
import { Button } from "@/components/ui/Button";

/** Group scopes by resource for a cleaner layout. */
const SCOPE_GROUPS = [
  { label: "Agents", scopes: ["agents:read", "agents:write"] },
  { label: "Abilities", scopes: ["abilities:read", "abilities:write"] },
  { label: "Domains", scopes: ["domains:read", "domains:write"] },
  { label: "Projects", scopes: ["projects:read", "projects:write"] },
  { label: "Library", scopes: ["library:write"] },
  { label: "Routines", scopes: ["routines:read", "routines:write"] },
  { label: "Councils", scopes: ["councils:read", "councils:write"] },
  { label: "Context Blocks", scopes: ["context_blocks:read", "context_blocks:write"] },
  { label: "Commands", scopes: ["commands:read", "commands:write"] },
  { label: "MCP Servers", scopes: ["mcp_servers:read", "mcp_servers:write"] },
  { label: "Notifications", scopes: ["notify:read", "notify:write"] },
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
      <div className="theme-text-muted flex items-center gap-2 text-xs">
        <span>{readCount} read</span>
        <span className="opacity-50">/</span>
        <span>{writeCount} write</span>
      </div>

      <div className="space-y-3">
        {SCOPE_GROUPS.map((group) => (
          <div key={group.label} className="theme-surface-muted theme-border rounded-lg border p-3">
            <div className="theme-text-muted mb-2 text-xs font-medium uppercase tracking-wider">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-3">
              {group.scopes.map((scope) => {
                const isChecked = selected.has(scope);
                const accessType = scope.split(":")[1];
                return (
                  <label
                    key={scope}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
                      isChecked
                        ? ""
                        : "theme-border-strong [background:var(--app-surface-muted-strong)] hover:[background:var(--app-hover-strong)]"
                    }`}
                    style={isChecked ? {
                      backgroundColor: agentColorAlpha(agent.color, 0.12),
                      borderColor: agentColorAlpha(agent.color, 0.36),
                    } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(scope)}
                      className="theme-border h-3.5 w-3.5 rounded-sm"
                      style={{ accentColor: agent.color }}
                    />
                    <span className={`text-xs font-medium ${
                      accessType === "write"
                          ? isChecked
                            ? ""
                            : "theme-text"
                          : isChecked
                            ? ""
                            : "theme-text-muted"
                    }`}
                    style={isChecked ? { color: agent.color } : undefined}>
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
