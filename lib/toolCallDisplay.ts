function toPascalCase(value: string): string {
  const rawName = value.split("/").pop() || value;
  const words = rawName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean);

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

const ARG_VALUE_MAX_LENGTH = 80;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(truncate(value, ARG_VALUE_MAX_LENGTH));
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    return truncate(JSON.stringify(value), ARG_VALUE_MAX_LENGTH);
  }
  return JSON.stringify(String(value));
}

export function normalizeToolCallArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function parseArgs(args: unknown): unknown {
  const normalized = normalizeToolCallArgs(args);
  const trimmed = normalized.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function formatToolCallSignature(name: string, args: unknown): string {
  const displayName = toPascalCase(name) || "Tool";
  const parsedArgs = parseArgs(args);

  if (parsedArgs === undefined) {
    return `${displayName}()`;
  }

  if (typeof parsedArgs === "string") {
    return `${displayName}(${truncate(parsedArgs, ARG_VALUE_MAX_LENGTH)})`;
  }

  if (!parsedArgs || Array.isArray(parsedArgs) || typeof parsedArgs !== "object") {
    return `${displayName}(${formatValue(parsedArgs)})`;
  }

  const entries = Object.entries(parsedArgs);
  if (entries.length === 0) {
    return `${displayName}()`;
  }

  const inlineArgs = entries
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(", ");
  return `${displayName}(${inlineArgs})`;
}
