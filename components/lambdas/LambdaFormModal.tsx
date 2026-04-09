"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CodeTextarea } from "@/components/agents/CodeTextarea";
import { createLambda, updateLambda } from "@/lib/api";
import type { Lambda, LambdaInterpreter } from "@/lib/types";
import { LAMBDA_INTERPRETERS } from "@/lib/types";

interface LambdaFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lambda?: Lambda | null;
}

export function LambdaFormModal({ open, onClose, onSaved, lambda }: LambdaFormModalProps) {
  const isEditing = !!lambda;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [path, setPath] = useState("");
  const [body, setBody] = useState("");
  const [interpreter, setInterpreter] = useState<LambdaInterpreter>("auto");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens or lambda changes
  useEffect(() => {
    if (open) {
      if (lambda) {
        setName(lambda.name);
        setDescription(lambda.description ?? "");
        setPath(lambda.path);
        setBody(lambda.body);
        setInterpreter(lambda.interpreter);
      } else {
        setName("");
        setDescription("");
        setPath("");
        setBody("#!/bin/bash\nset -euo pipefail\n\n");
        setInterpreter("auto");
      }
      setError(null);
    }
  }, [open, lambda]);

  // Auto-generate path from name when creating
  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!isEditing) {
        const slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        setPath(slug ? `${slug}.sh` : "");
      }
    },
    [isEditing],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!path.trim()) {
      setError("Path is required.");
      return;
    }
    if (!body.trim()) {
      setError("Script body is required.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateLambda(lambda.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          path: path.trim(),
          body,
          interpreter,
        });
      } else {
        await createLambda({
          name: name.trim(),
          description: description.trim() || undefined,
          path: path.trim(),
          body,
          interpreter,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lambda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Lambda" : "Create Lambda"}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. setup-git"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this lambda do?"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed transition-colors focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Path + Interpreter */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Path <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. setup-git.sh"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono transition-colors focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              File path within the lambdas directory.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Interpreter
            </label>
            <select
              value={interpreter}
              onChange={(e) => setInterpreter(e.target.value as LambdaInterpreter)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-400/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              {LAMBDA_INTERPRETERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Script body */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Script Body <span className="text-red-500">*</span>
          </label>
          <div className="h-64">
            <CodeTextarea
              value={body}
              onChange={setBody}
              placeholder="#!/bin/bash"
            />
          </div>
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
            {isEditing ? "Save Changes" : "Create Lambda"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
