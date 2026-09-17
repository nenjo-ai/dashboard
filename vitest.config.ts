import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/rtl/setup.ts"],
    include: ["tests/rtl/**/*.test.tsx", "tests/rtl/**/*.test.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
