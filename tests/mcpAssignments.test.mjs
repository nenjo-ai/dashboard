import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const server = { id: "server-id", slug: "github_tools", name: "GitHub Tools", is_system: false };

// Execute each panel's real toggle handler with controlled hooks and API responses.
async function panel(kind, assigned = [], failure = null) {
  const source = await readFile(new URL(`../components/agents/${kind}EditorInline.tsx`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(`${source}\nexport { McpTab };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const states = [];
  let cursor = 0;
  const calls = [];
  let saved = 0;
  const update = async (id, data) => {
    calls.push({ id, data });
    if (failure) throw failure;
    return {};
  };
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = value; }];
      },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/lib/hooks": { useMcpServers: () => ({ mcpServers: [server], isLoading: false }) },
    "@/lib/api": { updateAbility: update, updateDomain: update },
  };
  const exports = {};
  new Function("require", "exports", outputText)((id) => mocks[id] ?? {}, exports);
  const props = kind === "Ability"
    ? { ability: { id: "ability-id", mcp_servers: assigned }, onSaved: () => { saved++; } }
    : {
      domainId: "domain-id",
      manifest: { mcp_servers: assigned },
      onManifestChange: (manifest) => { props.manifest = manifest; },
      onSaved: () => { saved++; },
    };
  const render = () => {
    cursor = 0;
    const tree = exports.McpTab(props);
    const children = tree.props.children.flat().filter(Boolean);
    return {
      row: children.find((child) => child.props.onToggle)?.props,
      alert: children.find((child) => child.props.role === "alert")?.props.children,
    };
  };
  return { render, calls, saved: () => saved };
}

for (const kind of ["Ability", "Domain"]) {
  test(`${kind} MCP panel assigns and removes by slug while displaying the name`, async () => {
    const view = await panel(kind, ["other_server"]);
    assert.equal(view.render().row.label, "GitHub Tools");
    assert.equal(view.render().row.isOn, false);
    await view.render().row.onToggle();
    assert.deepEqual(view.calls[0].data, { mcp_servers: ["other_server", "github_tools"] });
    assert.equal(view.render().row.isOn, true);
    await view.render().row.onToggle();
    assert.deepEqual(view.calls[1].data, { mcp_servers: ["other_server"] });
    assert.equal(view.render().row.isOn, false);
    assert.equal(view.saved(), 2);
  });

  test(`${kind} MCP panel preserves assignments and displays a failed save`, async () => {
    const view = await panel(kind, ["github_tools"], new Error("Not found"));
    await view.render().row.onToggle();
    assert.equal(view.render().row.isOn, true);
    assert.equal(view.render().row.isProcessing, false);
    assert.equal(view.render().alert, "Not found");
    assert.equal(view.saved(), 0);
  });
}
