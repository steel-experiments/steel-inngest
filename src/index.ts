// ABOUTME: Package entry point: re-exports the public steel-inngest runtime API
// ABOUTME: (middleware, durable sessions, scrape) and the public option/result types.
/**
 * steel-inngest — Durable Steel browser sessions inside Inngest functions.
 *
 * Exports:
 * - {@link steelMiddleware} / {@link SteelMiddleware} — inject a configured
 *   Steel client as `ctx.steel`.
 * - {@link withSteelSession} — run a handler inside a durable Steel session.
 * - {@link steelScrape} — one-shot scrape.
 *
 * @packageDocumentation
 */

export { withSteelSession } from "./session.js";
export { steelScrape } from "./scrape.js";
export { steelMiddleware, SteelMiddleware } from "./middleware.js";

export type {
  SteelSessionHandle,
  WithSteelSessionOptions,
  SteelMiddlewareOptions,
  SteelScrapeOptions,
  SteelScrapeResult,
} from "./types.js";
