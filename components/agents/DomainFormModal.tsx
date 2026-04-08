"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { createDomain, updateDomain } from "@/lib/api";
import type { Domain, DomainManifest } from "@/lib/types";

interface DomainFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  domain?: Domain | null;
}

const DEFAULT_MANIFEST: DomainManifest = {
  schema_version: 1,
  domain_type: "authoring",
  prompt: {
    system_addon: "",
    guidelines: [],
    entry_message: "",
    exit_message: "",
  },
  tools: {
    additional_scopes: [],
  },
  artifact: {
    type: "document",
    format: "markdown",
    filename_template: "",
    schema: {},
    output_template: "",
  },
  session: {
    max_turns: 50,
    auto_save_interval: 5,
    exit_commands: ["/done", "/exit", "/finish"],
  },
};

export function DomainFormModal({ open, onClose, onSaved, domain }: DomainFormModalProps) {
  const isEditing = !!domain;

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens or domain changes
  useEffect(() => {
    if (open) {
      if (domain) {
        setName(domain.name);
        setDisplayName(domain.display_name);
        setCommand(domain.command);
        setDescription(domain.description ?? "");
        setCategory(domain.category ?? "");
      } else {
        setName("");
        setDisplayName("");
        setCommand("");
        setDescription("");
        setCategory("");
      }
      setError(null);
    }
  }, [open, domain]);

  // Auto-generate name and command from display_name when creating
  const handleDisplayNameChange = useCallback(
    (value: string) => {
      setDisplayName(value);
      if (!isEditing) {
        const slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
        setName(slug);
        setCommand("/" + slug);
      }
    },
    [isEditing],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim() || !command.trim()) {
      setError("Display name and command are required.");
      return;
    }

    if (!command.startsWith("#")) {
      setError("Command must start with #");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateDomain(domain.id, {
          name: name.trim(),
          display_name: displayName.trim(),
          description: description.trim() || undefined,
          command: command.trim(),
          category: category.trim() || undefined,
        });
      } else {
        await createDomain({
          name: name.trim(),
          display_name: displayName.trim(),
          description: description.trim() || undefined,
          command: command.trim(),
          manifest: DEFAULT_MANIFEST,
          category: category.trim() || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save domain.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Domain" : "Create Domain"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Display Name + Command */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block" required>
              Display Name
            </Label>
            <Input
              type="text"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="e.g. PRD Authoring"
            />
          </div>
          <div>
            <Label className="mb-1.5 block" required>
              Command
            </Label>
            <Input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="#prd"
              className="font-mono"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Command to enter this domain (e.g. #prd).
            </p>
          </div>
        </div>

        {/* Name + Category */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">
              Name (identifier)
            </Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prd_authoring"
              className="font-mono"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">
              Category
            </Label>
            <Input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. planning, analysis"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <Label className="mb-1.5 block">
            Description
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this domain do?"
            rows={2}
            className="leading-relaxed"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isEditing ? "Save Changes" : "Create Domain"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
