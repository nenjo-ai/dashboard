"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { AGENT_COLOR_PALETTE } from "@/lib/agent-colors";
import {
  createAgent,
  fetchAgentAbilities,
  fetchAgentMcpServers,
  fetchAgentPrompt,
  updateAgent,
  updateAgentPrompt,
} from "@/lib/api";
import { buildCloneAgentUpdate } from "@/lib/agentClone";
import type { AgentDefinition } from "@/lib/types";

interface MobileAgentCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  agents?: AgentDefinition[];
}

export function MobileAgentCreateDialog({ open, onClose, onCreated, agents = [] }: MobileAgentCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(AGENT_COLOR_PALETTE[0]);
  const [cloneFromId, setCloneFromId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    if (submitting) return;
    setName("");
    setDescription("");
    setColor(AGENT_COLOR_PALETTE[0]);
    setCloneFromId("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const sourceAgent = agents.find((agent) => agent.id === cloneFromId);
      const created = await createAgent({
        name: trimmedName,
        description: description.trim() || undefined,
        color,
        model_id: sourceAgent?.model_id ?? undefined,
      });
      if (sourceAgent) {
        const [sourcePromptConfig, sourceAbilities, sourceMcpServers] = await Promise.all([
          fetchAgentPrompt(sourceAgent.id),
          fetchAgentAbilities(sourceAgent.id),
          fetchAgentMcpServers(sourceAgent.id),
        ]);
        await Promise.all([
          updateAgent(created.id, buildCloneAgentUpdate(sourceAgent, sourceAbilities, sourceMcpServers)),
          updateAgentPrompt(created.id, sourcePromptConfig),
        ]);
      }
      await onCreated();
      setName("");
      setDescription("");
      setColor(AGENT_COLOR_PALETTE[0]);
      setCloneFromId("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={resetAndClose} title="New agent">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300" role="alert">{error}</p> : null}
        {agents.length ? (
          <div>
            <Label>Starting point</Label>
            <Select
              className="mt-1.5"
              onChange={(event) => {
                const sourceId = event.target.value;
                setCloneFromId(sourceId);
                const source = agents.find((agent) => agent.id === sourceId);
                if (!source) return;
                setDescription(source.description ?? "");
                setColor(source.color);
              }}
              value={cloneFromId}
            >
              <option value="">Start from scratch</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>Clone {agent.name}</option>)}
            </Select>
            <p className="theme-text-muted mt-1.5 text-xs">Cloning copies prompts, model, abilities, MCP assignments, and access scopes.</p>
          </div>
        ) : null}
        <div>
          <Label required>Agent name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Research assistant" autoFocus />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should this agent specialize in?" />
        </div>
        <div>
          <Label>Color</Label>
          <div className="mt-2">
            <ColorSwatchPicker value={color} onChange={setColor} />
          </div>
        </div>
        <div className="theme-border flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" isLoading={submitting} disabled={!name.trim()}>
            <Plus className="h-4 w-4" />
            Create agent
          </Button>
        </div>
      </form>
    </Modal>
  );
}
