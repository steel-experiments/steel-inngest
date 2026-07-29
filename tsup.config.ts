// ABOUTME: tsup build configuration producing the dual ESM/CJS bundles and type
// ABOUTME: declarations in dist/.
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Keep the CJS output usable from require(); ESM is the primary format.
  platform: "neutral",
  target: "es2022",
});
