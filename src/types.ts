import type { Steel } from "steel-sdk";

/**
 * A JSON-serializable view of a Steel browser session.
 *
 * The package constructs this handle in memory from an API-key-free create-step
 * checkpoint. Never put a live client or CDP connection in a handle — Inngest
 * memoizes step return values, and only JSON survives between steps (see
 * PROJECT.md § Hard constraints #1).
 *
 * @remarks
 * `connectUrl` embeds the Steel API key. The package does not checkpoint it;
 * callers must not return it from their own steps or log it.
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

interface WithSteelSessionCommonOptions {
  /**
   * The Inngest run ID. When provided, the Steel session ID is derived
   * deterministically from `(runId, stepPrefix)` under the package's UUIDv5
   * namespace. A future `onFailure` release helper can therefore recompute and
   * release the session without a metadata lookup (Steel sessions have no
   * metadata/tags).
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
   * Deliberately narrowed to `boolean` (the common on/off case). Richer
   * geolocation/server proxy configuration is not supported by this wrapper.
   */
  readonly useProxy?: boolean;
  /** Forwarded to Steel's `SessionCreateParams.solveCaptcha`. */
  readonly solveCaptcha?: boolean;
  /**
   * Prefix for the internal step IDs (`create-session`, `release-session`).
   *
   * Change this when running two sessions inside a single function so both
   * their step IDs and deterministic Steel session IDs remain distinct.
   * @default "steel"
   */
  readonly stepPrefix?: string;
}

/**
 * Options for {@link withSteelSession}.
 *
 * Pass either a pre-built `steel` client or client configuration through
 * `apiKey`/`baseUrl`. These modes are mutually exclusive so the client used for
 * REST calls can never disagree with the credential embedded in `connectUrl`.
 */
export type WithSteelSessionOptions = WithSteelSessionCommonOptions &
  (
    | {
        /** A pre-built Steel client. Its API key is authoritative. */
        readonly steel: Steel;
        readonly apiKey?: never;
        readonly baseUrl?: never;
      }
    | {
        readonly steel?: never;
        /** Steel API key. Defaults to `process.env.STEEL_API_KEY`. */
        readonly apiKey?: string;
        /** Steel base URL. Defaults to the Steel SDK's own default. */
        readonly baseUrl?: string;
      }
  );

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
 *
 * A pre-built client and client configuration are mutually exclusive.
 */
export type SteelScrapeOptions =
  | {
      /** A pre-built Steel client. */
      readonly steel: Steel;
      readonly steelApiKey?: never;
      readonly baseUrl?: never;
    }
  | {
      readonly steel?: never;
      /** Steel API key. Defaults to `process.env.STEEL_API_KEY`. */
      readonly steelApiKey?: string;
      /** Steel base URL. */
      readonly baseUrl?: string;
    };

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
