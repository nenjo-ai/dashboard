"use client";

import { useState } from "react";
import { Braces, GitBranch, PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { PackageImportMode } from "@/lib/packageHub";
import type { PackageSourceAdapter } from "@/lib/types";

type AddPackageMethod = "source" | "direct";

export interface AddPackageDialogProps {
  open: boolean;
  onClose: () => void;
  sourceAdapter: PackageSourceAdapter;
  sourceName: string;
  sourceRepoUrl: string;
  sourceRef: string;
  sourceManifestPath: string;
  onSourceAdapterChange: (value: PackageSourceAdapter) => void;
  onSourceNameChange: (value: string) => void;
  onSourceRepoUrlChange: (value: string) => void;
  onSourceRefChange: (value: string) => void;
  onSourceManifestPathChange: (value: string) => void;
  onCreateSource: () => void;
  importMode: PackageImportMode;
  importOwner: string;
  importRepo: string;
  importPath: string;
  importRef: string;
  importName: string;
  onImportModeChange: (value: PackageImportMode) => void;
  onImportOwnerChange: (value: string) => void;
  onImportRepoChange: (value: string) => void;
  onImportPathChange: (value: string) => void;
  onImportRefChange: (value: string) => void;
  onImportNameChange: (value: string) => void;
  onDirectImport: () => void;
  busyKey: string | null;
}

export function AddPackageDialog(props: AddPackageDialogProps) {
  const [method, setMethod] = useState<AddPackageMethod>("source");

  return (
    <Modal open={props.open} onClose={props.onClose} title="Add package" className="max-w-2xl">
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Package source method">
          <MethodButton
            active={method === "source"}
            icon={<GitBranch className="h-4 w-4" />}
            title="Add a source"
            description="Connect a registry or public plugin repository."
            onClick={() => setMethod("source")}
          />
          <MethodButton
            active={method === "direct"}
            icon={<Braces className="h-4 w-4" />}
            title="Direct import"
            description="Import one knowledge graph or skill from GitHub."
            onClick={() => setMethod("direct")}
          />
        </div>

        {method === "source" ? <SourceForm {...props} /> : <DirectImportForm {...props} />}
      </div>
    </Modal>
  );
}

function MethodButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "theme-border rounded-xl border p-3 text-left transition-colors",
        active
          ? "theme-selection-accent-soft border-[var(--app-accent)]"
          : "theme-surface hover:[background:var(--app-hover)]",
      )}
    >
      <span className="theme-text flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span className="theme-text-muted mt-1 block text-xs leading-5">{description}</span>
    </button>
  );
}

function SourceForm(props: AddPackageDialogProps) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onCreateSource();
      }}
    >
      <div>
        <h3 className="theme-text text-sm font-semibold">Package source</h3>
        <p className="theme-text-muted mt-1 text-xs leading-5">
          Nenjo reads the source manifest and makes its packages available in Discover.
        </p>
      </div>
      <Field label="Source format">
        <Select value={props.sourceAdapter} onChange={(event) => props.onSourceAdapterChange(event.target.value as PackageSourceAdapter)}>
          <option value="nenjo_packages">Nenjo packages</option>
          <option value="claude_marketplace">Claude plugins</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <Input value={props.sourceName} onChange={(event) => props.onSourceNameChange(event.target.value)} placeholder="Team packages" />
        </Field>
        <Field label="GitHub repository">
          <Input value={props.sourceRepoUrl} onChange={(event) => props.onSourceRepoUrlChange(event.target.value)} placeholder="https://github.com/owner/repo" type="url" />
        </Field>
      </div>
      <details className="theme-border rounded-xl border px-4 py-3">
        <summary className="theme-text cursor-pointer text-sm font-medium">Advanced source settings</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Branch, tag, or SHA">
            <Input value={props.sourceRef} onChange={(event) => props.onSourceRefChange(event.target.value)} placeholder="main" />
          </Field>
          <Field label="Manifest path">
            <Input value={props.sourceManifestPath} onChange={(event) => props.onSourceManifestPathChange(event.target.value)} placeholder={props.sourceAdapter === "claude_marketplace" ? ".claude-plugin/marketplace.json" : "packages.yaml"} />
          </Field>
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={props.onClose}>Cancel</Button>
        <Button type="submit" isLoading={props.busyKey === "create-source"}>
          <PackagePlus className="h-4 w-4" />
          Add source
        </Button>
      </div>
    </form>
  );
}

function DirectImportForm(props: AddPackageDialogProps) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onDirectImport();
      }}
    >
      <div>
        <h3 className="theme-text text-sm font-semibold">Direct GitHub import</h3>
        <p className="theme-text-muted mt-1 text-xs leading-5">
          Advanced: import one compatible resource without adding its repository as a source.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Resource type">
          <Select value={props.importMode} onChange={(event) => props.onImportModeChange(event.target.value as PackageImportMode)}>
            <option value="knowledge_pack">Knowledge graph</option>
            <option value="skill">Skill</option>
          </Select>
        </Field>
        <Field label="Package name">
          <Input value={props.importName} onChange={(event) => props.onImportNameChange(event.target.value)} placeholder="Research graph" />
        </Field>
        <Field label="GitHub owner">
          <Input value={props.importOwner} onChange={(event) => props.onImportOwnerChange(event.target.value)} placeholder="nenjo-ai" />
        </Field>
        <Field label="Repository">
          <Input value={props.importRepo} onChange={(event) => props.onImportRepoChange(event.target.value)} placeholder="packages" />
        </Field>
        <Field label="Path in repository">
          <Input value={props.importPath} onChange={(event) => props.onImportPathChange(event.target.value)} placeholder="knowledge/research" />
        </Field>
        <Field label="Branch, tag, or SHA">
          <Input value={props.importRef} onChange={(event) => props.onImportRefChange(event.target.value)} placeholder="main" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={props.onClose}>Cancel</Button>
        <Button type="submit" isLoading={props.busyKey === "direct-import"}>
          <PackagePlus className="h-4 w-4" />
          Import package
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="theme-text block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}
