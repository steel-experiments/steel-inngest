import { describe, expect, expectTypeOf, test } from "vitest";
import type {
  SteelSessionHandle,
  SteelMiddlewareOptions,
  SteelScrapeOptions,
  SteelScrapeResult,
  WithSteelSessionOptions,
} from "../src/types.js";

describe("SteelSessionHandle (T002)", () => {
  test("is exactly { id, connectUrl, viewerUrl } — JSON primitives only", () => {
    // No client, no connection, no Date — only JSON-safe fields.
    expectTypeOf<SteelSessionHandle>().toEqualTypeOf<{
      readonly id: string;
      readonly connectUrl: string;
      readonly viewerUrl: string | null;
    }>();
  });

  test("each field type is a JSON primitive", () => {
    expectTypeOf<SteelSessionHandle["id"]>().toEqualTypeOf<string>();
    expectTypeOf<SteelSessionHandle["connectUrl"]>().toEqualTypeOf<string>();
    expectTypeOf<SteelSessionHandle["viewerUrl"]>().toEqualTypeOf<string | null>();
  });

  test("survives a JSON round-trip unchanged (deep-equals itself)", () => {
    const handle: SteelSessionHandle = {
      id: "abc-123",
      connectUrl: "wss://api.steel.dev/v1/sessions/abc-123/websocket?token=t&apiKey=k",
      viewerUrl: "https://app.steel.dev/sessions/abc-123",
    };
    const roundTripped = JSON.parse(JSON.stringify(handle)) as SteelSessionHandle;
    expect(roundTripped).toEqual(handle);
  });

  test("viewerUrl can be null", () => {
    const handle: SteelSessionHandle = { id: "x", connectUrl: "wss://x", viewerUrl: null };
    expect(handle.viewerUrl).toBeNull();
    // And the null case round-trips too.
    expect(JSON.parse(JSON.stringify(handle))).toEqual(handle);
  });
});

describe("option interfaces (T002)", () => {
  test("WithSteelSessionOptions has the expected optional fields", () => {
    expectTypeOf<WithSteelSessionOptions>().toMatchTypeOf<{
      steel?: unknown;
      apiKey?: string;
      baseUrl?: string;
      runId?: string;
      timeoutMs?: number;
      useProxy?: boolean;
      solveCaptcha?: boolean;
      stepPrefix?: string;
    }>();
  });

  test("SteelMiddlewareOptions is { apiKey?, baseUrl? }", () => {
    expectTypeOf<SteelMiddlewareOptions>().toEqualTypeOf<{
      readonly apiKey?: string;
      readonly baseUrl?: string;
    }>();
  });

  test("SteelScrapeOptions honors steelApiKey + baseUrl", () => {
    expectTypeOf<SteelScrapeOptions>().toMatchTypeOf<{
      steelApiKey?: string;
      baseUrl?: string;
    }>();
  });

  test("SteelScrapeResult is all JSON primitives", () => {
    expectTypeOf<SteelScrapeResult>().toEqualTypeOf<{
      readonly html: string;
      readonly markdown: string;
      readonly title: string;
      readonly statusCode: number;
    }>();
  });
});
