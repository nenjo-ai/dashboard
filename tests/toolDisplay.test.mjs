import assert from "node:assert/strict";
import test from "node:test";

import { toolDisplaySignature, toolDisplayStrategies } from "../lib/agentRunTrace/toolDisplay.ts";

test("tool display strategies cover the worker shell and file tools", () => {
  const names = new Set(toolDisplayStrategies.flatMap((strategy) => strategy.toolNames));
  for (const name of ["shell", "read", "write", "edit", "remove", "search", "repo_status"]) {
    assert.equal(names.has(name), true, `missing display strategy for ${name}`);
  }
});

test("shell displays a bounded command argument", () => {
  assert.equal(
    toolDisplaySignature("shell", JSON.stringify({ command: "find backend -name '*.rs'" })),
    `shell("find backend -name '*.rs'")`,
  );
  const signature = toolDisplaySignature("shell", { command: `printf ${"x".repeat(180)}` });
  assert.match(signature, /^shell\("printf x+/);
  assert.match(signature, /…"\)$/);
  assert.equal(signature.includes("x".repeat(150)), false);
});

test("file tools display paths without write or edit contents", () => {
  assert.equal(toolDisplaySignature("read", { path: "backend/src/main.rs" }), 'read("backend/src/main.rs")');
  assert.equal(toolDisplaySignature("write", { path: "notes.txt", content: "sensitive body" }), 'write("notes.txt")');
  assert.equal(toolDisplaySignature("edit", { path: "src/lib.rs", old_string: "secret old", new_string: "secret new" }), 'edit("src/lib.rs")');
  assert.equal(toolDisplaySignature("remove", { path: "tmp/cache", recursive: true }), 'remove("tmp/cache")');
});

test("search and argument-free tools have concise signatures", () => {
  assert.equal(toolDisplaySignature("search", { mode: "content", pattern: "TaskSpan", path: "lib" }), 'search("TaskSpan", "lib")');
  assert.equal(toolDisplaySignature("search", { mode: "files", pattern: "**/*.rs" }), 'search("**/*.rs")');
  assert.equal(toolDisplaySignature("repo_status", {}), "repo_status()");
  assert.equal(toolDisplaySignature("unknown_tool", { value: 1 }), "unknown_tool");
});
