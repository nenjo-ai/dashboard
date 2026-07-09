import nextConfig from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-playwright/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextConfig,
  ...nextCoreWebVitals,
];

export default eslintConfig;
