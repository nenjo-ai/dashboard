type ToolArgsRecord = Record<string, unknown>;

export interface ShellToolArgs extends ToolArgsRecord {
  command: string;
}
export interface ReadToolArgs extends ToolArgsRecord {
  path: string;
  start_line?: number;
  line_count?: number;
}
export interface WriteToolArgs extends ToolArgsRecord {
  path: string;
  content?: unknown;
}
export interface EditToolArgs extends ToolArgsRecord {
  path: string;
  old_string?: string;
  new_string?: string;
}
export interface RemoveToolArgs extends ToolArgsRecord {
  path: string;
  recursive?: boolean;
}
export interface SearchToolArgs extends ToolArgsRecord {
  mode: "content" | "files";
  pattern: string;
  path?: string;
}

export interface ToolDisplayStrategy {
  readonly toolNames: readonly string[];
  format(toolName: string, rawArgs: unknown): string | undefined;
}

function argsRecord(rawArgs: unknown): ToolArgsRecord | undefined {
  let value = rawArgs;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as ToolArgsRecord;
}

function requiredString(args: ToolArgsRecord, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function quote(value: string, maxChars = 120): string {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  const bounded =
    characters.length > maxChars
      ? `${characters.slice(0, Math.max(0, maxChars - 1)).join("")}…`
      : characters.join("");
  return JSON.stringify(bounded);
}

function defineToolDisplayStrategy<TArgs extends ToolArgsRecord>(
  toolNames: readonly string[],
  parse: (args: ToolArgsRecord) => TArgs | undefined,
  format: (toolName: string, args: TArgs) => string,
): ToolDisplayStrategy {
  return {
    toolNames,
    format(toolName, rawArgs) {
      const record = argsRecord(rawArgs);
      if (!record) return undefined;
      const parsed = parse(record);
      return parsed ? format(toolName, parsed) : undefined;
    },
  };
}

function pathArgs(
  args: ToolArgsRecord,
): (ToolArgsRecord & { path: string }) | undefined {
  const path = requiredString(args, "path");
  return path ? { ...args, path } : undefined;
}

const shellStrategy = defineToolDisplayStrategy<ShellToolArgs>(
  ["shell"],
  (args) => {
    const command = requiredString(args, "command");
    return command ? { ...args, command } : undefined;
  },
  (toolName, args) => `${toolName}(${quote(args.command)})`,
);
const readStrategy = defineToolDisplayStrategy<ReadToolArgs>(
  ["read", "file_read"],
  pathArgs,
  (toolName, args) => `${toolName}(${quote(args.path)})`,
);
const writeStrategy = defineToolDisplayStrategy<WriteToolArgs>(
  ["write", "file_write"],
  pathArgs,
  (toolName, args) => `${toolName}(${quote(args.path)})`,
);
const editStrategy = defineToolDisplayStrategy<EditToolArgs>(
  ["edit", "file_edit"],
  pathArgs,
  (toolName, args) => `${toolName}(${quote(args.path)})`,
);
const removeStrategy = defineToolDisplayStrategy<RemoveToolArgs>(
  ["remove", "file_delete"],
  pathArgs,
  (toolName, args) => `${toolName}(${quote(args.path)})`,
);
const searchStrategy = defineToolDisplayStrategy<SearchToolArgs>(
  ["search"],
  (args) => {
    const mode = args.mode;
    const pattern = requiredString(args, "pattern");
    if ((mode !== "content" && mode !== "files") || !pattern) return undefined;
    return { ...args, mode, pattern, path: requiredString(args, "path") };
  },
  (toolName, args) => {
    const path =
      args.mode === "content" && args.path && args.path !== "."
        ? `, ${quote(args.path, 64)}`
        : "";
    return `${toolName}(${quote(args.pattern, 96)}${path})`;
  },
);
const noArgsStrategy = defineToolDisplayStrategy<ToolArgsRecord>(
  ["repo_status"],
  (args) => args,
  (toolName) => `${toolName}()`,
);

export const toolDisplayStrategies: readonly ToolDisplayStrategy[] = [
  shellStrategy,
  readStrategy,
  writeStrategy,
  editStrategy,
  removeStrategy,
  searchStrategy,
  noArgsStrategy,
];

export function toolDisplaySignature(toolName: string, rawArgs: unknown): string {
  const strategy = toolDisplayStrategies.find((candidate) =>
    candidate.toolNames.includes(toolName),
  );
  return strategy?.format(toolName, rawArgs) ?? toolName;
}
