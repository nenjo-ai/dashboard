/** Package registry source reconciled and installed during fresh onboarding. */
export const OFFICIAL_NENJO_PACKAGE_SOURCE = {
  name: "Nenjo Official Packages",
  source_type: "registry" as const,
  adapter: "nenjo_packages" as const,
  metadata: {
    source: {
      kind: "git",
      url: "https://github.com/nenjo-ai/packages.git",
      reference: "main",
      manifest_path: "packages.yaml",
    },
  },
};
