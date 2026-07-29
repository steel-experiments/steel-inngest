// ABOUTME: Unit tests for the npm-pack stdout parser used by the package
// ABOUTME: verification script, including malformed-output termination.

import { describe, expect, test } from "vitest";
import { parsePackOutput } from "../scripts/parse-pack-output.mjs";

describe("parsePackOutput", () => {
  test("parses clean npm pack JSON output", () => {
    const result = [{ filename: "steel-inngest-0.3.1.tgz", files: [] }];
    expect(parsePackOutput(JSON.stringify(result))).toEqual(result);
  });

  test("skips lifecycle-script noise before the JSON result", () => {
    const result = [{ filename: "steel-inngest-0.3.1.tgz" }];
    const output = `> prepack\n> building [bundles]\n${JSON.stringify(result)}`;
    expect(parsePackOutput(output)).toEqual(result);
  });

  test("throws (rather than hanging) when output starts with '[' but no suffix is valid JSON", () => {
    expect(() => parsePackOutput("[not valid json")).toThrow(
      /did not emit a JSON result/,
    );
  });

  test("throws when the output contains no '[' at all", () => {
    expect(() => parsePackOutput("npm error something went wrong")).toThrow(
      /did not emit a JSON result/,
    );
  });
});
