import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mapScrapeResult, steelScrape } from "../src/scrape.js";
import { NO_API_KEY_ERROR } from "../src/internal.js";
import type { SteelScrapeOptions } from "../src/types.js";
import { createFakeSteel, restoreEnv } from "./helpers.js";

describe("mapScrapeResult", () => {
  test("maps a full response", () => {
    expect(
      mapScrapeResult({
        content: { html: "<h>1", markdown: "# 1" },
        metadata: { title: "T", statusCode: 200 },
      }),
    ).toEqual({ html: "<h>1", markdown: "# 1", title: "T", statusCode: 200 });
  });

  test("missing content/metadata -> null-safe fallbacks", () => {
    expect(mapScrapeResult({})).toEqual({
      html: "",
      markdown: "",
      title: "",
      statusCode: 0,
    });
    expect(mapScrapeResult({ content: null, metadata: null })).toEqual({
      html: "",
      markdown: "",
      title: "",
      statusCode: 0,
    });
  });

  test("present containers but missing leaf fields -> empty string / 0", () => {
    expect(mapScrapeResult({ content: {}, metadata: {} })).toEqual({
      html: "",
      markdown: "",
      title: "",
      statusCode: 0,
    });
  });
});

describe("steelScrape", () => {
  const SAVED_KEY = process.env.STEEL_API_KEY;
  beforeEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });
  afterEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });

  test("calls scrape with { url } and maps the result", async () => {
    const steel = createFakeSteel();
    const result = await steelScrape("https://example.com", { steel });
    expect(steel.calls.scrape[0]?.params).toEqual({
      url: "https://example.com",
    });
    expect(result).toEqual({
      html: expect.any(String),
      markdown: expect.any(String),
      title: "Example",
      statusCode: 200,
    });
  });

  test("honors a custom scrape response", async () => {
    const steel = createFakeSteel({
      scrapeResponse: {
        content: { html: "H", markdown: "M" },
        metadata: { title: "TT", statusCode: 404 },
      },
    });
    const result = await steelScrape("https://x.example", { steel });
    expect(result).toEqual({
      html: "H",
      markdown: "M",
      title: "TT",
      statusCode: 404,
    });
  });

  test("no key and no client -> throws the same both-remedies error as the rest of the API", async () => {
    delete process.env.STEEL_API_KEY;
    // The full NO_API_KEY_ERROR names both the option and the env var; toThrow
    // with a string does a substring match. Mirrors session.test.ts so the
    // scrape path is held to the same standard.
    await expect(steelScrape("https://x.example", {})).rejects.toThrow(
      NO_API_KEY_ERROR,
    );
  });

  test("the options type rejects apiKey/baseUrl alongside steel", () => {
    const steel = createFakeSteel();
    const withClient: SteelScrapeOptions = { steel };
    const withCredentials: SteelScrapeOptions = {
      apiKey: "key",
      baseUrl: "https://steel.example",
    };

    // @ts-expect-error A supplied client is mutually exclusive with apiKey.
    const clientAndKey: SteelScrapeOptions = { steel, apiKey: "other" };
    // @ts-expect-error A supplied client is mutually exclusive with baseUrl.
    const clientAndBaseUrl: SteelScrapeOptions = {
      steel,
      baseUrl: "https://other.example",
    };

    expect([
      withClient,
      withCredentials,
      clientAndKey,
      clientAndBaseUrl,
    ]).toHaveLength(4);
  });

  test.each([
    ["apiKey", { apiKey: "other-key" }],
    ["baseUrl", { baseUrl: "https://other.example" }],
  ])("runtime callers cannot pass steel with %s", async (_name, conflict) => {
    const steel = createFakeSteel();
    const options = { steel, ...conflict } as unknown as SteelScrapeOptions;

    await expect(steelScrape("https://x.example", options)).rejects.toThrow(
      "`steel` cannot be combined with `apiKey` or `baseUrl`",
    );
    expect(steel.calls.scrape).toHaveLength(0);
  });
});
