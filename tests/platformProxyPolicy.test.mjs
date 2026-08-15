import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlatformApiUrl,
  forwardPlatformResponseHeaders,
} from "../lib/server/platformProxyPolicy.ts";

test("platform proxy URL stays under the API prefix", () => {
  const url = buildPlatformApiUrl(
    "https://platform.example.com",
    ["artifacts", "8b97cbe5-843f-4c99-814f-d92f552e93e6", "download"],
    "?revision=2",
  );

  assert.equal(
    url.toString(),
    "https://platform.example.com/api/v1/artifacts/8b97cbe5-843f-4c99-814f-d92f552e93e6/download?revision=2",
  );
});

test("platform proxy rejects traversal and ambiguous path segments", () => {
  for (const path of [
    ["..", "admin"],
    ["artifacts", "../admin"],
    ["artifacts", "..\\admin"],
    ["artifacts", ""],
    [],
  ]) {
    assert.throws(() => buildPlatformApiUrl("https://platform.example.com", path));
  }
});

test("platform proxy rejects unsafe base URLs", () => {
  assert.throws(() => buildPlatformApiUrl("file:///tmp/platform.sock", ["artifacts"]));
  assert.throws(() => buildPlatformApiUrl(
    "https://user:secret@platform.example.com",
    ["artifacts"],
  ));
});

test("platform proxy does not forward upstream cookies redirects or transport headers", () => {
  const headers = forwardPlatformResponseHeaders(new Headers({
    "content-type": "application/json",
    "location": "https://internal.example.com/admin",
    "set-cookie": "session=platform-secret",
    "transfer-encoding": "chunked",
    "x-request-id": "request-1",
  }));

  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-request-id"), "request-1");
  assert.equal(headers.has("location"), false);
  assert.equal(headers.has("set-cookie"), false);
  assert.equal(headers.has("transfer-encoding"), false);
});
