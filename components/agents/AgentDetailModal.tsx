"use client";

import type { Model, AgentDefinition } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { agentColorBg, agentColorText } from "@/lib/agent-colors";

interface AgentDetailModalProps {
  agent: Model | null;
  roles: AgentDefinition[];
  onClose: () => void;
  onEdit: (agent: Model) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </div>
  );
}

function providerLabel(model: string): string {
  if (model.startsWith("gpt") || model.startsWith("o1")) return "OpenAI";
  if (model.startsWith("claude")) return "Anthropic";
  if (model.includes("/")) return "OpenRouter";
  return "Custom";
}

/** Get the agents associated with this model from its tags. */
function getModelAgents(
  model: Model,
  agents: AgentDefinition[],
): AgentDefinition[] {
  return agents.filter((r) => model.tags.includes(r.name));
}

export function AgentDetailModal({
  agent,
  roles,
  onClose,
  onEdit,
}: AgentDetailModalProps) {
  if (!agent) return null;

  const modelAgents = getModelAgents(agent, roles);

  return (
    <Modal
      open={!!agent}
      onClose={onClose}
      title={agent.name}
      className="max-w-2xl"
    >
      <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 pb-3">
          {modelAgents.map((agentDef) => (
            <span
              key={agentDef.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border"
              style={{
                backgroundColor: agentColorBg(agentDef.color),
                color: agentColorText(agentDef.color),
                borderColor: agentColorBg(agentDef.color),
              }}
            >
              <RoleIdenticon roleId={agentDef.id} color={agentDef.color} size={16} roleName={agentDef.name} />
              {agentDef.name}
            </span>
          ))}
        </div>

        {/* Description */}
        {agent.description && (
          <div className="py-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">{agent.description}</p>
          </div>
        )}

        {/* Configuration */}
        <div className="py-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
            Configuration
          </h4>
          <DetailRow label="Provider">{providerLabel(agent.model)}</DetailRow>
          <DetailRow label="Model">{agent.model}</DetailRow>
          <DetailRow label="Temperature">{agent.temperature.toFixed(2)}</DetailRow>
          <DetailRow label="ID">
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-sm dark:bg-gray-700">
              {agent.id}
            </code>
          </DetailRow>
          <DetailRow label="Created">{formatDate(agent.created_at)}</DetailRow>
          <DetailRow label="Updated">{formatDate(agent.updated_at)}</DetailRow>
          {agent.last_assigned_at && (
            <DetailRow label="Last Assigned">
              {formatDate(agent.last_assigned_at)}
            </DetailRow>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => onEdit(agent)}>
            Edit Model
          </Button>
        </div>
      </div>
    </Modal>
  );
}
