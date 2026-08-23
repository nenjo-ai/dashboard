import assert from "node:assert/strict";
import test from "node:test";

import {
  isLoopbackHostname,
  resolveDashboardAuthConfig,
} from "../lib/authMode.ts";

test("Clerk remains the default auth mode", () => {
  assert.deepEqual(resolveDashboardAuthConfig({ NODE_ENV: "development" }), {
    kind: "clerk_unconfigured",
  });
  assert.deepEqual(
    resolveDashboardAuthConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    }),
    { kind: "clerk", publishableKey: "pk_test_example" },
  );
});

test("local auth resolves one stable server-owned identity", () => {
  assert.deepEqual(
    resolveDashboardAuthConfig({
      NODE_ENV: "development",
      NENJO_AUTH_MODE: "local",
    }),
    {
      kind: "local",
      identity: {
        subject: "local_dev",
        name: "Local Developer",
        email: "local@nenjo.dev",
      },
    },
  );

  assert.deepEqual(
    resolveDashboardAuthConfig({
      NODE_ENV: "development",
      NENJO_AUTH_MODE: "local",
      NENJO_LOCAL_AUTH_SUBJECT: "browser_agent",
      NENJO_LOCAL_AUTH_NAME: "Browser Agent",
      NENJO_LOCAL_AUTH_EMAIL: "AGENT@NENJO.DEV",
    }),
    {
      kind: "local",
      identity: {
        subject: "browser_agent",
        name: "Browser Agent",
        email: "agent@nenjo.dev",
      },
    },
  );
});

test("local auth cannot be enabled in production", () => {
  assert.throws(
    () =>
      resolveDashboardAuthConfig({
        NODE_ENV: "production",
        NENJO_AUTH_MODE: "local",
      }),
    /not allowed in production/,
  );
});

test("auth mode and local identity values are validated at the boundary", () => {
  assert.throws(
    () =>
      resolveDashboardAuthConfig({
        NODE_ENV: "development",
        NENJO_AUTH_MODE: "disabled",
      }),
    /Unsupported NENJO_AUTH_MODE/,
  );
  assert.throws(
    () =>
      resolveDashboardAuthConfig({
        NODE_ENV: "development",
        NENJO_AUTH_MODE: "local",
        NENJO_LOCAL_AUTH_SUBJECT: "../other-user",
      }),
    /letters, numbers, underscores, and hyphens/,
  );
  assert.throws(
    () =>
      resolveDashboardAuthConfig({
        NODE_ENV: "development",
        NENJO_AUTH_MODE: "local",
        NENJO_LOCAL_AUTH_EMAIL: "not-an-email",
      }),
    /must be an email address/,
  );
});

test("local auth accepts only explicit loopback hostnames", () => {
  for (const hostname of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"]) {
    assert.equal(isLoopbackHostname(hostname), true, hostname);
  }
  for (const hostname of ["0.0.0.0", "localhost.example.com", "127.0.0.2", "nenjo.test"]) {
    assert.equal(isLoopbackHostname(hostname), false, hostname);
  }
});
