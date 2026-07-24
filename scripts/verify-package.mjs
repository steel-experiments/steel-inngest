import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(projectRoot, "test", "fixtures", "package-consumer");
const temporaryRoot = mkdtempSync(join(tmpdir(), "steel-inngest-package-"));
const consumerRoot = join(temporaryRoot, "consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed:\n${output}`);
  }

  return result.stdout;
}

function linkPeerDependency(name) {
  const source = join(projectRoot, "node_modules", name);
  const destination = join(consumerRoot, "node_modules", name);

  if (!existsSync(source)) {
    throw new Error(`Missing ${name}; run npm ci before npm run check:package.`);
  }

  symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
}

try {
  const packOutput = run(
    npmCommand,
    ["pack", "--json", "--pack-destination", temporaryRoot],
    projectRoot,
  );
  const [packResult] = JSON.parse(packOutput);

  if (!packResult?.filename) {
    throw new Error(`npm pack did not report a tarball:\n${packOutput}`);
  }

  const packedFiles = new Set(packResult.files.map(({ path }) => path));
  for (const requiredFile of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.d.cts",
  ]) {
    if (!packedFiles.has(requiredFile)) {
      throw new Error(`Packed artifact is missing ${requiredFile}.`);
    }
  }

  cpSync(fixtureRoot, consumerRoot, { recursive: true });
  for (const [template, consumer] of [
    ["consumer.bundler.txt", "consumer.ts"],
    ["consumer.node16-esm.txt", "consumer.mts"],
    ["consumer.node16-cjs.txt", "consumer.cts"],
  ]) {
    renameSync(join(consumerRoot, template), join(consumerRoot, consumer));
  }
  const tarballPath = join(temporaryRoot, packResult.filename);
  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      tarballPath,
    ],
    consumerRoot,
  );

  linkPeerDependency("inngest");
  linkPeerDependency("steel-sdk");

  const typescriptBin = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  for (const config of [
    "tsconfig.bundler.json",
    "tsconfig.node16-esm.json",
    "tsconfig.node16-cjs.json",
  ]) {
    run(process.execPath, [typescriptBin, "--project", config], consumerRoot);
  }

  run(process.execPath, ["runtime-import.mjs"], consumerRoot);
  run(process.execPath, ["runtime-require.cjs"], consumerRoot);

  const installedManifest = JSON.parse(
    readFileSync(
      join(consumerRoot, "node_modules", "steel-inngest", "package.json"),
      "utf8",
    ),
  );
  if (installedManifest.version !== packResult.version) {
    throw new Error("Consumer did not install the freshly packed package.");
  }

  console.log(
    "Packed consumer checks passed (Bundler, Node16 ESM/CJS, import, require).",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
