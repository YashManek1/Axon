import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      all: true,
      include: ["**/*.js"],
      exclude: ["node_modules/**"],
      reporter: ["text", "json", "html"],
    },
  },
});
