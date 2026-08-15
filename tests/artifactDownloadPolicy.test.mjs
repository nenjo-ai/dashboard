import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES,
  validateArtifactDownloadUrl,
} from "../lib/server/artifactDownloadPolicy.ts";

test("artifact download proxy accepts only configured object-store origins", () => {
  const accepted = validateArtifactDownloadUrl(
    "https://objects.example.com/bucket/item?X-Amz-Signature=test",
    "https://objects.example.com,http://localhost:3900",
  );
  assert.equal(accepted.origin, "https://objects.example.com");
  assert.throws(() => validateArtifactDownloadUrl(
    "http://169.254.169.254/latest/meta-data",
    "https://objects.example.com",
  ));
  assert.throws(() => validateArtifactDownloadUrl(
    "https://user:password@objects.example.com/bucket/item",
    "https://objects.example.com",
  ));
  assert.throws(() => validateArtifactDownloadUrl(
    "file:///etc/passwd",
    "https://objects.example.com",
  ));
});

test("artifact download policy fails closed without an allowlist", () => {
  assert.throws(() => validateArtifactDownloadUrl(
    "https://objects.example.com/bucket/item",
    "",
  ));
  assert.equal(MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES, 67_108_864);
});
