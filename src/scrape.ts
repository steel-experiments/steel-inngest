import type { SteelScrapeOptions, SteelScrapeResult } from "./types.js";
import {
  assertExclusiveSteelClient,
  createSteelClient,
} from "./internal.js";

/**
 * Structural view of the Steel `scrape()` response. Decoupled from the SDK's
 * internal type path so the package doesn't import private types. The real
 * `ScrapeResponse` is structurally compatible.
 */
interface SteelScrapeResponse {
  content?: { html?: string; markdown?: string } | null;
  metadata?: { title?: string; statusCode?: number } | null;
}

/**
 * One-shot scrape of a URL via Steel. Stateless — composes directly with
 * `step.run`.
 *
 * @param url - The URL to scrape.
 * @param options - Client configuration. Same key resolution and error message
 *   as {@link steelMiddleware}.
 * @returns A null-safe {@link SteelScrapeResult}: missing fields map to `""`
 *   (strings) or `0` (`statusCode`).
 *
 * @example
 * ```ts
 * const result = await step.run("scrape", () => steelScrape("https://example.com"));
 * console.log(result.markdown);
 * ```
 */
export async function steelScrape(
  url: string,
  options: SteelScrapeOptions = {},
): Promise<SteelScrapeResult> {
  assertExclusiveSteelClient(options);

  const client =
    options.steel ??
    createSteelClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  const response = (await client.scrape({ url })) as SteelScrapeResponse;
  return mapScrapeResult(response);
}

/**
 * Map a raw Steel `scrape()` response into the null-safe
 * {@link SteelScrapeResult}.
 *
 * Exported for unit testing without touching the network.
 */
export function mapScrapeResult(response: SteelScrapeResponse): SteelScrapeResult {
  return {
    html: response.content?.html ?? "",
    markdown: response.content?.markdown ?? "",
    title: response.metadata?.title ?? "",
    statusCode: response.metadata?.statusCode ?? 0,
  };
}
