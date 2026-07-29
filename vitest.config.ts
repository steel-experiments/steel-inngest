import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // E2E lives in examples/ and hits real Steel; keep it out of the default suite.
    exclude: ["node_modules", "dist", "examples/**"],
    reporters: "default",
  },
});
