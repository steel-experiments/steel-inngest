import type { Steel } from "steel-sdk";

/**
 * A JSON-serializable handle to a Steel browser session.
 *
 * This is the **only** thing that crosses an Inngest `step.run` boundary. Never
 * put a live client or CDP connection in a handle — Inngest memoizes step return
 * values, and only JSON survives between steps (see PROJECT.md § Hard constraints
 * #1).
 *
 * @remarks
 * `connectUrl` embeds the Steel API key. Do **not** return this handle from a
 * step and do not log it.
 */
export interface SteelSessionHandle {
  /** Steel session ID. */
  readonly id: string;
  /**
   * CDP websocket URL a driver (Playwright/Puppeteer) connects to.
   *
   * Built as `${session.websocketUrl}&apiKey=${key}`. Because `websocketUrl`
   * already carries a query string, the key is appended with `&`. The URL
   * embeds the API key — treat it as a secret.
   */
  readonly connectUrl: string;
  /** URL to view the live session in Steel's web UI, or `null` if unavailable. */
  readonly viewerUrl: string | null;
}

/**
 * Options for {@link withSteelSession}.
 *
 * Either pass a pre-built `steel` client, or let the wrapper build one from
 * `apiKey`/`baseUrl` (falling back to `process.env.STEEL_API_KEY`).
 */
export interface WithSteelSessionOptions {
  /** A pre-built Steel client. If omitted, one is built from `apiKey`/`baseUrl`. */
  readonly steel?: Steel;
  /** Steel API key. Defaults to `process.env.STEEL_API_KEY`. */
  readonly apiKey?: string;
  /** Steel base URL. Defaults to the Steel SDK's own default. */
  readonly baseUrl?: string;
  /**
   * The Inngest run ID. When provided, the Steel session ID is derived
   * deterministically — `UUIDv5(runId)` under the package's namespace — so a
   * future `onFailure` release helper can recompute and release the session
   * without a metadata lookup (Steel sessions have no metadata/tags).
   */
  readonly runId?: string;
  /**
   * Session timeout in milliseconds. The session self-expires after this even
   * if the run crashes mid-handler — this is the failure-path cleanup.
   *
   * Omitted or `0` → `300_000` (Steel's default). Non-finite or negative
   * values are rejected with a clear error. Sessions must always have a finite
   * timeout (PROJECT.md § Hard constraints #3).
   * @default 300000
   */
  readonly timeoutMs?: number;
  /**
   * Forwarded to Steel's `SessionCreateParams.useProxy`.
   *
   * Deliberately narrowed to `boolean` (the common on/off case). The Steel SDK
   * also accepts geolocation/server proxy config there; to use those, pass a
   * pre-built `steel` client configured with the richer options instead.
   */
  readonly useProxy?: boolean;
  /** Forwarded to Steel's `SessionCreateParams.solveCaptcha`. */
  readonly solveCaptcha?: boolean;
  /**
   * Prefix for the internal step IDs (`create-session`, `release-session`).
   *
   * Change this when running two sessions concurrently inside a single function
   * so their step IDs don't collide.
   * @default "steel"
   */
  readonly stepPrefix?: string;
}

/**
 * Options for {@link steelMiddleware}.
 */
export interface SteelMiddlewareOptions {
  /** Steel API key. Defaults to `process.env.STEEL_API_KEY`. */
  readonly apiKey?: string;
  /** Steel base URL. Defaults to the Steel SDK's own default. */
  readonly baseUrl?: string;
}

/**
 * Options for {@link steelScrape}.
 */
export interface SteelScrapeOptions {
  /** A pre-built Steel client. If omitted, one is built from the key/baseUrl. */
  readonly steel?: Steel;
  /** Steel API key. Defaults to `process.env.STEEL_API_KEY`. */
  readonly steelApiKey?: string;
  /** Steel base URL. */
  readonly baseUrl?: string;
}

/**
 * Null-safe result of a one-shot scrape.
 *
 * Missing fields map to `""` (strings) or `0` (`statusCode`), so the result is
 * always JSON-safe and composes directly with `step.run`.
 */
export interface SteelScrapeResult {
  readonly html: string;
  readonly markdown: string;
  readonly title: string;
  readonly statusCode: number;
}
