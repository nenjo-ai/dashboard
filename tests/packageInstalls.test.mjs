import assert from "node:assert/strict";
import test from "node:test";

import {
  packageInstallJobRunning,
  packageInstallVisibleInInstalledList,
} from "../lib/packageInstalls.ts";

function install(overrides = {}) {
  return {
    id: "install-1",
    org_id: "org-1",
    package_source_id: "source-1",
    root_path: "nenjo/nenji/package.yaml",
    root_type: "package",
    root_resource_id: "agent-1",
    requested_ref: "main",
    resolved_commit_sha: "abc123",
    status: "installed",
    current_lock_id: "lock-1",
    metadata: {},
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("package install jobs are active while queued or running", () => {
  assert.equal(packageInstallJobRunning({ status: "queued" }), true);
  assert.equal(packageInstallJobRunning({ status: "running" }), true);
  assert.equal(packageInstallJobRunning({ status: "succeeded" }), false);
  assert.equal(packageInstallJobRunning({ status: "failed" }), false);
  assert.equal(packageInstallJobRunning(null), false);
});

test("installed package list keeps previously locked installs visible during update states", () => {
  assert.equal(packageInstallVisibleInInstalledList(install()), true);
  assert.equal(
    packageInstallVisibleInInstalledList(install({ status: "installing" })),
    true,
  );
  assert.equal(
    packageInstallVisibleInInstalledList(install({ status: "failed" })),
    true,
  );
  assert.equal(
    packageInstallVisibleInInstalledList(
      install({ status: "installing", current_lock_id: null }),
    ),
    false,
  );
});
