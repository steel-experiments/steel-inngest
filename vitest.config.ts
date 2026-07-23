import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // E2E lives in examples/ and hits real Steel; keep it out of the default suite.
    exclude: ["node_modules", "dist", "examples/**"],
    reporters: "default",
    // Enforce the compile-time type assertions (expectTypeOf) as part of the test
    // gate. Those calls are runtime no-ops — the chainable assertions never throw,
    // so only a type-checker can fail them. This runs `tsc` over the test files so
    // a wrong type export fails `npm test`. Source type errors remain the job of
    // the separate `npm run typecheck` gate (ignoreSourceErrors).
    typecheck: {
      enabled: true,
      checker: "tsc",
      include: ["test/**/*.test.ts"],
      ignoreSourceErrors: true,
    },
  },
});
