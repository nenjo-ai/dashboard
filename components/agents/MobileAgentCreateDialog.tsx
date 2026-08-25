"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { AGENT_COLOR_PALETTE } from "@/lib/agent-colors";
import { createAgent } from "@/lib/api";

interface MobileAgentCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

export function MobileAgentCreateDialog({ open, onClose, onCreated }: MobileAgentCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(AGENT_COLOR_PALETTE[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    if (submitting) return;
    setName("");
    setDescription("");
    setColor(AGENT_COLOR_PALETTE[0]);
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
      await createAgent({
        name: trimmedName,
        description: description.trim() || undefined,
        color,
      });
      await onCreated();
      setName("");
      setDescription("");
      setColor(AGENT_COLOR_PALETTE[0]);
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
        <div>
          <Label required>Agent name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Research assistant" autoFocus />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should this agent specialize in?" />
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
