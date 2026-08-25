"use client";

import { useState } from "react";
import { FilePenLine, FolderPen } from "lucide-react";

import { artifactCatalogPathError, artifactFolderNameError, joinArtifactCatalogPath } from "@/lib/artifactCatalog";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type ArtifactPathDialogProps =
  | {
      mode: "create-folder";
      currentPath: string;
      onClose: () => void;
      onSubmit: (path: string) => Promise<void>;
    }
  | {
      mode: "edit-folder" | "edit-file";
      initialPath: string;
      onClose: () => void;
      onSubmit: (path: string) => Promise<void>;
    };

export function ArtifactPathDialog(props: ArtifactPathDialogProps) {
  const creating = props.mode === "create-folder";
  const editingFile = props.mode === "edit-file";
  const [value, setValue] = useState(creating ? "" : props.initialPath);
  const [submitting, setSubmitting] = useState(false);
  const validationError = creating
    ? artifactFolderNameError(value) ?? (!value ? "Enter a folder name." : null)
    : artifactCatalogPathError(value, editingFile ? "file" : "folder");
  const destination = creating ? joinArtifactCatalogPath(props.currentPath, value) : value;
  const title = creating ? "New folder" : editingFile ? "Organize file" : "Rename or move folder";

  async function submit() {
    if (validationError || submitting) return;
    setSubmitting(true);
    try {
      await props.onSubmit(destination);
    } finally {
      setSubmitting(false);
    }
  }

  return <Modal open onClose={props.onClose} title={title} className="max-w-md">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="theme-surface-muted flex items-center gap-3 rounded-xl p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
          {editingFile ? <FilePenLine aria-hidden="true" className="h-4 w-4 text-cyan-600" /> : <FolderPen aria-hidden="true" className="h-4 w-4 text-amber-500" />}
        </span>
        <div className="min-w-0">
          <p className="theme-text text-sm font-medium">{creating ? "Create in" : "Catalog location"}</p>
          <p className="theme-text-muted truncate text-xs">{creating ? (props.currentPath ? `Artifacts / ${props.currentPath}` : "Artifacts") : "Paths are relative to Artifacts."}</p>
        </div>
      </div>

      <label className="block">
        <span className="theme-text text-sm font-medium">{creating ? "Folder name" : editingFile ? "File path" : "Folder path"}</span>
        <input
          autoFocus
          className="theme-border theme-surface theme-text mt-2 h-10 w-full rounded-lg border px-3 text-sm"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={creating ? "Research" : editingFile ? "Research/report.pdf" : "Research/Reports"}
          aria-invalid={Boolean(validationError)}
          aria-describedby="artifact-path-help"
        />
        <p id="artifact-path-help" className={`mt-1.5 text-xs ${validationError ? "text-red-600" : "theme-text-muted"}`}>
          {validationError ?? (creating ? `Will create Artifacts / ${destination}` : "Change the name, parent folders, or both.")}
        </p>
      </label>

      <div className="theme-border flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
        <Button type="submit" isLoading={submitting} disabled={Boolean(validationError)}>{creating ? "Create folder" : "Save location"}</Button>
      </div>
    </form>
  </Modal>;
}
