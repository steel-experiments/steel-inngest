import { describe, expect, test } from "vitest";
import { expectTypeOf } from "vitest";
import type {
  SteelMiddlewareOptions,
  SteelScrapeOptions,
  SteelScrapeResult,
  SteelSessionHandle,
  WithSteelSessionOptions,
} from "../src/index.js";
import * as publicApi from "../src/index.js";

describe("package public API", () => {
  test("exports exactly the three documented runtime primitives", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "steelMiddleware",
      "steelScrape",
      "withSteelSession",
    ]);
  });

  test("exports the documented public types", () => {
    expectTypeOf<SteelSessionHandle>().toBeObject();
    expectTypeOf<WithSteelSessionOptions>().toBeObject();
    expectTypeOf<SteelMiddlewareOptions>().toBeObject();
    expectTypeOf<SteelScrapeOptions>().toBeObject();
    expectTypeOf<SteelScrapeResult>().toBeObject();
  });
});
