"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Folder, Pencil, Plus, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChatCommands } from "@/lib/hooks";
import type { ChatCommand } from "@/lib/types";
import { configureChatCommand, deleteChatCommand } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import {
  SourceManagedResourcePanel,
  type SourceManagedDetailSection,
} from "@/components/resources/SourceManagedResourcePanel";
import { manifestResourceDisplayPath } from "@/lib/manifestResourcePath";
import { resourceSlug } from "@/lib/resourceSlug";
import { TreeResourcePromptEditor } from "./TreeResourcePromptEditor";

interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeEntry[];
}

interface FileNode {
  type: "file";
  command: ChatCommand;
}

type TreeEntry = FolderNode | FileNode;

function cleanPath(path: string | null | undefined): string {
  return path?.trim().replace(/^\/+|\/+$/g, "") ?? "";
}

function metadataString(metadata: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = metadata;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function commandPackageLabel(command: ChatCommand): string | null {
  return (
    metadataString(command.metadata, ["claude", "plugin", "display_name"]) ??
    metadataString(command.metadata, ["claude", "plugin", "name"]) ??
    metadataString(command.metadata, ["source", "package"]) ??
    metadataString(command.metadata, ["package", "name"])
  );
}

function buildTree(commands: ChatCommand[]): TreeEntry[] {
  const folderMap = new Map<string, FolderNode>();
  const rootItems: TreeEntry[] = [];
  const rootFolders = new Set<string>();

  const getOrCreateFolder = (path: string): FolderNode => {
    const existing = folderMap.get(path);
    if (existing) return existing;
    const parts = path.split("/");
    const node: FolderNode = {
      type: "folder",
      name: parts[parts.length - 1],
      path,
      children: [],
    };
    folderMap.set(path, node);
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = getOrCreateFolder(parentPath);
      if (!parent.children.some((child) => child.type === "folder" && child.path === path)) {
        parent.children.push(node);
      }
    }
    return node;
  };

  for (const command of commands) {
    const path = cleanPath(command.path);
    if (!path) {
      rootItems.push({ type: "file", command });
      continue;
    }
    getOrCreateFolder(path).children.push({ type: "file", command });
  }

  folderMap.forEach((node, path) => {
    if (!path.includes("/") && !rootFolders.has(path)) {
      rootFolders.add(path);
      rootItems.push(node);
    }
  });

  const sortEntries = (entries: TreeEntry[]) => {
    entries.sort((left, right) => {
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      const leftName = left.type === "folder" ? left.name : left.command.command;
      const rightName = right.type === "folder" ? right.name : right.command.command;
      return leftName.localeCompare(rightName);
    });
    for (const entry of entries) {
      if (entry.type === "folder") sortEntries(entry.children);
    }
  };

  sortEntries(rootItems);
  return rootItems;
}

function commandFolders(commands: ChatCommand[]): string[] {
  const folders = new Set<string>();
  for (const command of commands) {
    const path = cleanPath(command.path);
    if (!path) continue;
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
  }
  return Array.from(folders).sort((left, right) => left.localeCompare(right));
}

function normalizeSlashCommand(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function TreeNode({
  entry,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  entry: TreeEntry;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (command: ChatCommand) => void;
}) {
  if (entry.type === "folder") {
    const isOpen = expanded.has(entry.path);
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(entry.path)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Folder className="h-4 w-4 text-gray-400" />
          <span className="min-w-0 truncate">{entry.name}</span>
        </button>
        {isOpen &&
          entry.children.map((child) => (
            <TreeNode
              key={child.type === "folder" ? child.path : child.command.id}
              entry={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  const isSelected = selectedId === entry.command.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.command)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        isSelected
          ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-200"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      <TerminalSquare className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="min-w-0 truncate font-mono">{entry.command.command}</span>
    </button>
  );
}

function CommandEditor({
  command,
  folders,
  onSaved,
  onDeleted,
}: {
  command: ChatCommand | null;
  folders: string[];
  onSaved: (command: ChatCommand) => void;
  onDeleted: () => void;
}) {
  const [path, setPath] = useState("");
  const [slashCommand, setSlashCommand] = useState("/");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const contentDecryptError = command?.content_decrypt_error ?? null;
  const isCommandReadOnly = !!command && (command.read_only || command.source_type !== "native");
  const isReadOnly = isCommandReadOnly || !!contentDecryptError;
  const packageLabel = command ? commandPackageLabel(command) : null;

  useEffect(() => {
    setPath(cleanPath(command?.path));
    setSlashCommand(command?.command ?? "/");
    setDescription(command?.description ?? "");
    setContent(command?.content ?? "");
    setError(null);
    setSaved(false);
  }, [
    command?.command,
    command?.content,
    command?.description,
    command?.id,
    command?.path,
  ]);

  const submit = async () => {
    if (isReadOnly || !command) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const saved = await configureChatCommand({
        id: command.id,
        slug: command.slug,
        path,
        command: slashCommand,
        description,
        content,
      });
      onSaved(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save command.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!command || isReadOnly) return;
    setIsSaving(true);
    setError(null);
    try {
      await deleteChatCommand(command.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete command.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!command) {
    return (
      <div className="theme-border theme-surface flex h-full min-h-0 items-center justify-center rounded-lg border px-6 text-center">
        <div>
          <TerminalSquare className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="theme-text mt-3 text-sm font-medium">No command selected</p>
          <p className="theme-text-muted mt-1 text-sm">
            Create a command or select one from the tree.
          </p>
        </div>
      </div>
    );
  }

  if (isCommandReadOnly) {
    const sections: SourceManagedDetailSection[] = [
      {
        title: "Command",
        fields: [
          { label: "Path", value: manifestResourceDisplayPath(command), mono: true },
          { label: "Slash command", value: command.command, mono: true },
          { label: "Source type", value: command.source_type },
        ],
      },
      {
        title: "Runtime",
        fields: [
          { label: "Entry", value: command.entry_path, mono: true },
          { label: "Root", value: command.root_path, mono: true },
          { label: "Plugin root", value: command.plugin_root_path, mono: true },
          {
            label: "Hooks",
            value: command.hooks.length ? command.hooks.join(", ") : "None",
            mono: true,
          },
        ],
      },
    ];
    const fallbackContent = JSON.stringify(
      {
        path: manifestResourceDisplayPath(command),
        command: command.command,
        description: command.description,
        entry_path: command.entry_path,
        root_path: command.root_path,
        plugin_root_path: command.plugin_root_path,
        hooks: command.hooks,
        metadata: command.metadata,
      },
      null,
      2,
    );

    return (
      <div className="theme-border theme-surface h-full min-h-0 overflow-hidden rounded-lg border">
        <SourceManagedResourcePanel
          resource={command}
          title={command.command}
          description={command.description}
          fallbackContent={fallbackContent}
          fallbackLanguage="yaml"
          sections={sections}
          showMetadata={false}
        />
      </div>
    );
  }

  return (
    <>
      <TreeResourcePromptEditor
        title={slashCommand || command.command || "/"}
        badge={
          <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {command.source_type}
          </span>
        }
        subtitle={
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono">{path || "Root commands"}</span>
            {description ? <span className="truncate">{description}</span> : null}
            {packageLabel ? <span className="truncate">Package: {packageLabel}</span> : null}
            {isCommandReadOnly ? <span>Package-managed commands are read-only.</span> : null}
          </div>
        }
        value={content}
        onChange={setContent}
        placeholder="Markdown instructions for this slash command. Use template variables, context blocks, and library references from the side panel."
        promptLabel="Command content"
        readOnly={isReadOnly}
        saving={isSaving}
        saved={saved}
        error={error ?? contentDecryptError}
        onSave={isReadOnly ? undefined : submit}
        onDelete={!isReadOnly ? remove : undefined}
        actions={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Pencil className="h-4 w-4" />
              Details
            </button>
          ) : null
        }
      />
      <CommandMetadataModal
        open={detailsOpen}
        command={command}
        currentContent={content}
        folders={folders}
        onClose={() => setDetailsOpen(false)}
        onSaved={(savedCommand) => {
          setPath(cleanPath(savedCommand.path));
          setSlashCommand(savedCommand.command);
          setDescription(savedCommand.description ?? "");
          setContent(savedCommand.content ?? "");
          setDetailsOpen(false);
          onSaved(savedCommand);
        }}
      />
    </>
  );
}

function CommandMetadataModal({
  open,
  command,
  currentContent,
  folders,
  onClose,
  onSaved,
}: {
  open: boolean;
  command?: ChatCommand | null;
  currentContent?: string;
  folders: string[];
  onClose: () => void;
  onSaved: (command: ChatCommand) => void;
}) {
  const [path, setPath] = useState("");
  const [slashCommand, setSlashCommand] = useState("/");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!command;

  useEffect(() => {
    if (!open) return;
    setPath(cleanPath(command?.path));
    setSlashCommand(command?.command ?? "/");
    setSlug(command?.slug ?? "");
    setSlugEdited(Boolean(command?.id));
    setName(command?.name ?? "");
    setNameEdited(Boolean(command?.id));
    setDescription(command?.description ?? "");
    setError(null);
  }, [
    command?.command,
    command?.description,
    command?.id,
    command?.name,
    command?.path,
    command?.slug,
    open,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCommand = normalizeSlashCommand(slashCommand);
    if (normalizedCommand === "/") {
      setError("Slash command is required.");
      return;
    }
    const normalizedSlug = resourceSlug(slug || normalizedCommand.slice(1));
    if (!normalizedSlug) {
      setError("Stable slug is required.");
      return;
    }
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await configureChatCommand({
        id: command?.id,
        slug: command?.slug ?? normalizedSlug,
        name: normalizedName,
        path: cleanPath(path),
        command: normalizedCommand,
        description: description.trim(),
        content: currentContent ?? command?.content ?? "",
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save command details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? "Command Details" : "New Command"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}
        <div>
          <Label htmlFor="cmd-name" required>
            Name
          </Label>
          <Input
            id="cmd-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
            }}
            placeholder="Summarize"
            required
          />
        </div>
        <div>
          <Label htmlFor="cmd-slug" required>
            Stable slug
          </Label>
          <Input
            id="cmd-slug"
            value={slug}
            onChange={(event) => {
              setSlug(resourceSlug(event.target.value));
              setSlugEdited(true);
            }}
            placeholder="summarize"
            required
            disabled={isEditing}
            className="font-mono"
          />
          <p className="theme-text-muted mt-1 text-xs">
            Permanent resource reference; it does not change when the command label changes.
          </p>
        </div>
        <div>
          <Label htmlFor="cmd-path">Path</Label>
          <Input
            id="cmd-path"
            value={path}
            onChange={(event) => setPath(cleanPath(event.target.value))}
            placeholder="workflows/research"
            list="command-folder-options"
            className="font-mono"
          />
          <datalist id="command-folder-options">
            {folders.map((folder) => (
              <option key={folder} value={folder} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="cmd-slash" required>
            Slash command
          </Label>
          <Input
            id="cmd-slash"
            value={slashCommand}
            onChange={(event) => {
              const next = event.target.value;
              setSlashCommand(next);
              if (!slugEdited && !isEditing) setSlug(resourceSlug(next.replace(/^\//, "")));
              if (!nameEdited && !isEditing) setName(next.replace(/^\//, ""));
            }}
            onBlur={() => setSlashCommand((value) => normalizeSlashCommand(value))}
            placeholder="/summarize"
            required
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="cmd-description">Description</Label>
          <Textarea
            id="cmd-description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 280))}
            placeholder="What this command does..."
            rows={3}
            maxLength={280}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || normalizeSlashCommand(slashCommand) === "/"}>
            {saving ? "Saving..." : isEditing ? "Save Details" : "Create Command"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CommandsExplorer() {
  const { commands, isLoading, isError, mutate } = useChatCommands();
  const commandList = useMemo(() => commands ?? [], [commands]);
  const tree = useMemo(() => buildTree(commandList), [commandList]);
  const folders = useMemo(() => commandFolders(commandList), [commandList]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["plugins", "packages"]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedCommand = useMemo(
    () => commandList.find((command) => command.id === selectedId) ?? commandList[0] ?? null,
    [commandList, selectedId],
  );

  const toggleFolder = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (isLoading) {
    return <div className="h-[calc(100vh-12rem)] min-h-[640px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        Failed to load commands.
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-12rem)] min-h-[640px] grid-rows-[220px_minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-1">
      <div className="theme-border theme-surface flex min-h-0 flex-col rounded-lg border p-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          New command
        </button>
        <div className="min-h-0 flex-1 overflow-auto">
          {tree.length ? (
            tree.map((entry) => (
              <TreeNode
                key={entry.type === "folder" ? entry.path : entry.command.id}
                entry={entry}
                depth={0}
                selectedId={selectedCommand?.id ?? null}
                expanded={expanded}
                onToggle={toggleFolder}
                onSelect={(command) => {
                  setSelectedId(command.id);
                }}
              />
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No commands.
            </div>
          )}
        </div>
      </div>
      <CommandEditor
        command={selectedCommand}
        folders={folders}
        onSaved={(command) => {
          setSelectedId(command.id);
          void mutate();
        }}
        onDeleted={() => {
          setSelectedId(null);
          void mutate();
        }}
      />
      <CommandMetadataModal
        open={createOpen}
        folders={folders}
        onClose={() => setCreateOpen(false)}
        onSaved={(command) => {
          setSelectedId(command.id);
          setCreateOpen(false);
          void mutate();
        }}
      />
    </div>
  );
}
