// ABOUTME: Guards the package's public surface: the exact runtime exports and the
// ABOUTME: documented public types available from the entry point.
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
import { SteelMiddleware } from "../src/index.js";
import { Middleware } from "inngest";

describe("package public API", () => {
  test("exports exactly the documented runtime primitives", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "SteelMiddleware",
      "steelMiddleware",
      "steelScrape",
      "withSteelSession",
    ]);
  });

  test("SteelMiddleware is usable directly from the package entry", () => {
    // The class JSDoc documents passing it directly when STEEL_API_KEY is set,
    // so it must be importable from the entry point, not just the factory.
    expect(SteelMiddleware.prototype).toBeInstanceOf(Middleware.BaseMiddleware);
  });

  test("exports the documented public types", () => {
    expectTypeOf<SteelSessionHandle>().toBeObject();
    expectTypeOf<WithSteelSessionOptions>().toBeObject();
    expectTypeOf<SteelMiddlewareOptions>().toBeObject();
    expectTypeOf<SteelScrapeOptions>().toBeObject();
    expectTypeOf<SteelScrapeResult>().toBeObject();
  });
});
