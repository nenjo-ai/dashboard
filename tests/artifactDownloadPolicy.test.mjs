import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactDownloadConfigurationError,
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
  ), ArtifactDownloadConfigurationError);
  assert.equal(MAX_DASHBOARD_ARTIFACT_ENVELOPE_BYTES, 67_108_864);
});

test("artifact download policy distinguishes bad configuration from rejected URLs", () => {
  for (const origins of ["not a URL", "https://objects.example.com/bucket", "https://objects.example.com,"]) {
    assert.throws(() => validateArtifactDownloadUrl(
      "https://objects.example.com/bucket/item",
      origins,
    ), ArtifactDownloadConfigurationError);
  }
  for (const url of ["not a URL", "https://other.example.com/bucket/item"]) {
    assert.throws(() => validateArtifactDownloadUrl(url, "https://objects.example.com"),
      (error) => !(error instanceof ArtifactDownloadConfigurationError));
  }
});

test("Spaces path-style grants use the regional endpoint origin", () => {
  const signedUrl = "https://nyc3.digitaloceanspaces.com/artifacts/item?X-Amz-Signature=test";
  assert.equal(validateArtifactDownloadUrl(signedUrl, "https://nyc3.digitaloceanspaces.com").href, signedUrl);
  assert.throws(() => validateArtifactDownloadUrl(signedUrl, "https://artifacts.nyc3.digitaloceanspaces.com"));
});
