"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { createAbility, updateAbility } from "@/lib/api";
import type { Ability } from "@/lib/types";

function abilitySlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface AbilityFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  ability: Ability | null;
}

export function AbilityFormModal({ open, onClose, onSaved, ability }: AbilityFormModalProps) {
  const isEditing = !!ability;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activationCondition, setActivationCondition] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (ability) {
        setName(ability.name);
        setDescription(ability.description ?? "");
        setActivationCondition(ability.activation_condition);
      } else {
        setName("");
        setDescription("");
        setActivationCondition("");
      }
    }
  }, [open, ability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = abilitySlug(name);
    if (!slug) return;
    setSaving(true);
    try {
      if (isEditing) {
        await updateAbility(ability.id, {
          name: slug,
          description: description || undefined,
          activation_condition: activationCondition,
        });
      } else {
        await createAbility({
          name: slug,
          description: description || undefined,
          activation_condition: activationCondition,
        });
      }
      onSaved();
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? "Edit Ability" : "Create Ability"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="ability-name">Name</Label>
          <Input
            id="ability-name"
            value={name}
            onChange={(e) => setName(abilitySlug(e.target.value))}
            placeholder="code_review"
            required
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Stable ability slug.</p>
        </div>

        <div>
          <Label htmlFor="ability-description">Description</Label>
          <Textarea
            id="ability-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this ability does..."
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="ability-activation">Activation Condition</Label>
          <Textarea
            id="ability-activation"
            value={activationCondition}
            onChange={(e) => setActivationCondition(e.target.value)}
            placeholder="When the user asks to review code, a PR, or a diff"
            rows={2}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This becomes the tool description the LLM sees. It decides when to activate the ability based on this text.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !abilitySlug(name)}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Ability"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
