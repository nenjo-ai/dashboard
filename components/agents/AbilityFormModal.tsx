"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { createAbility, updateAbility } from "@/lib/api";
import { resourceSlug } from "@/lib/resourceSlug";
import type { Ability } from "@/lib/types";

interface AbilityFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  ability: Ability | null;
}

export function AbilityFormModal({ open, onClose, onSaved, ability }: AbilityFormModalProps) {
  const isEditing = !!ability;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [activationCondition, setActivationCondition] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (ability) {
        setName(ability.name);
        setSlug(ability.slug);
        setSlugEdited(true);
        setDescription(ability.description ?? "");
        setActivationCondition(ability.activation_condition);
      } else {
        setName("");
        setSlug("");
        setSlugEdited(false);
        setDescription("");
        setActivationCondition("");
      }
    }
  }, [open, ability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setSaving(true);
    try {
      if (isEditing) {
        await updateAbility(ability.id, {
          name: name.trim(),
          description: description || undefined,
          activation_condition: activationCondition,
        });
      } else {
        await createAbility({
          slug,
          name: name.trim(),
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
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              if (!isEditing && !slugEdited) setSlug(resourceSlug(nextName));
            }}
            placeholder="Code Review"
            required
          />
        </div>

        <div>
          <Label htmlFor="ability-slug">Slug</Label>
          <Input
            id="ability-slug"
            value={slug}
            onChange={(e) => {
              setSlug(resourceSlug(e.target.value));
              setSlugEdited(true);
            }}
            placeholder="code-review"
            className="font-mono"
            disabled={isEditing}
            required
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Stable agent-facing reference; it cannot be changed after creation.
          </p>
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
          <Button type="submit" disabled={saving || !name.trim() || !slug}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Ability"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
