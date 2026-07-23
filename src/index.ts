/**
 * steel-inngest — Durable Steel browser sessions inside Inngest functions.
 *
 * Three exports:
 * - {@link steelMiddleware} — inject a configured Steel client as `ctx.steel`.
 * - {@link withSteelSession} — run a handler inside a durable Steel session.
 * - {@link steelScrape} — one-shot scrape.
 *
 * @packageDocumentation
 */

export { withSteelSession } from "./session.js";
export { steelScrape, mapScrapeResult } from "./scrape.js";
export { steelMiddleware, SteelMiddleware } from "./middleware.js";

export type {
  SteelSessionHandle,
  WithSteelSessionOptions,
  SteelMiddlewareOptions,
  SteelScrapeOptions,
  SteelScrapeResult,
} from "./types.js";
