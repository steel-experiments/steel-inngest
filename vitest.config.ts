// ABOUTME: Vitest configuration: node environment, test/ suites (including hermetic
// ABOUTME: E2E in test/e2e), excluding the live examples/.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Hermetic E2E lives in test/e2e. examples/ are live demos that hit real
    // Steel — runnable manually, never part of the suite.
    exclude: ["node_modules", "dist", "examples/**"],
    reporters: "default",
  },
});
