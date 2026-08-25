"use client";

import { useRef, useState } from "react";
import { FileUp, FolderInput, FolderPlus, Upload } from "lucide-react";

import { artifactFolderNameError, MAX_ARTIFACT_IMPORTS } from "@/lib/artifactCatalog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export type ArtifactImportMode = "files" | "folder";

export interface ArtifactImportOptions {
  newSubfolder?: string;
  preserveFolderStructure: boolean;
}

interface ArtifactImportDialogProps {
  currentPath: string;
  initialMode: ArtifactImportMode;
  onClose: () => void;
  onImport: (files: File[], options: ArtifactImportOptions) => void;
}

export function ArtifactImportDialog({
  currentPath,
  initialMode,
  onClose,
  onImport,
}: ArtifactImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ArtifactImportMode>(initialMode);
  const [files, setFiles] = useState<File[]>([]);
  const [newSubfolder, setNewSubfolder] = useState("");

  const folderError = mode === "files" ? artifactFolderNameError(newSubfolder) : null;
  const localFolder = files[0]?.webkitRelativePath.split("/")[0];
  const targetPath = [currentPath, mode === "files" ? newSubfolder.trim() : localFolder]
    .filter(Boolean)
    .join("/");

  const chooseMode = (nextMode: ArtifactImportMode) => {
    setMode(nextMode);
    setFiles([]);
    setNewSubfolder("");
  };
  const selectFiles = (selection: FileList | null) => {
    setFiles(selection ? Array.from(selection).slice(0, MAX_ARTIFACT_IMPORTS) : []);
  };
  const submit = () => {
    if (!files.length || folderError) return;
    onImport(files, {
      newSubfolder: mode === "files" ? newSubfolder.trim() || undefined : undefined,
      preserveFolderStructure: mode === "folder",
    });
  };

  return <Modal open onClose={onClose} title="Import artifacts" className="max-w-xl">
    <div className="space-y-5 p-1">
      <div className="theme-surface-muted theme-border grid grid-cols-2 rounded-xl border p-1" aria-label="Import type">
        <button className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${mode === "files" ? "theme-surface-elevated theme-border theme-text border shadow-xs" : "theme-text-muted"}`} onClick={() => chooseMode("files")} type="button"><FileUp className="h-4 w-4" />Files</button>
        <button className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${mode === "folder" ? "theme-surface-elevated theme-border theme-text border shadow-xs" : "theme-text-muted"}`} onClick={() => chooseMode("folder")} type="button"><FolderInput className="h-4 w-4" />Folder</button>
      </div>

      <section className="rounded-xl bg-cyan-500/[0.06] p-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"><FolderPlus className="h-4 w-4" /></span>
          <div className="min-w-0"><p className="theme-text text-sm font-medium">Destination</p><p className="theme-text-muted mt-0.5 truncate text-xs leading-5">{targetPath ? `Artifacts / ${targetPath}` : "Artifacts / All artifacts"}</p></div>
        </div>
      </section>

      {mode === "files" ? <label className="theme-text block text-sm font-medium">New subfolder <span className="theme-text-muted font-normal">(optional)</span><Input autoFocus className="mt-1.5" value={newSubfolder} onChange={(event) => setNewSubfolder(event.target.value)} placeholder="Research, reports, design…" />{folderError ? <span className="mt-1.5 block text-xs text-red-500" role="alert">{folderError}</span> : <span className="theme-text-muted mt-1.5 block text-xs">Leave blank to import directly into the current folder.</span>}</label> : <p className="theme-text-muted text-sm leading-6">Choose a local folder and its nested structure will be preserved in the artifact catalog.</p>}

      <input ref={fileInputRef} className="sr-only" type="file" multiple onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
      <input ref={folderInputRef} className="sr-only" type="file" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />

      <button className="theme-border theme-surface-muted flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-6 text-center transition-colors hover:[border-color:var(--app-border-strong)] hover:[background:var(--app-hover)]" onClick={() => (mode === "folder" ? folderInputRef : fileInputRef).current?.click()} type="button">
        <Upload className="theme-text-muted h-5 w-5" />
        <span className="theme-text mt-2 text-sm font-medium">{files.length ? `${files.length} ${files.length === 1 ? "artifact" : "artifacts"} selected` : mode === "folder" ? "Choose a folder" : "Choose files"}</span>
        <span className="theme-text-muted mt-1 text-xs">Up to {MAX_ARTIFACT_IMPORTS} files, 16 MB each</span>
      </button>

      {files.length ? <div className="theme-surface-muted max-h-32 space-y-1 overflow-y-auto rounded-xl p-3" aria-label="Selected artifacts">{files.slice(0, 8).map((file) => <p className="theme-text-muted truncate text-xs" key={`${file.webkitRelativePath}:${file.name}:${file.size}`}>{file.webkitRelativePath || file.name}</p>)}{files.length > 8 ? <p className="theme-text-muted text-xs">+{files.length - 8} more</p> : null}</div> : null}

      <div className="theme-border flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!files.length || Boolean(folderError)} onClick={submit}><Upload className="h-4 w-4" />Import {files.length || "artifacts"}</Button></div>
    </div>
  </Modal>;
}
