import { createHash } from "node:crypto";
import { Steel } from "steel-sdk";

/**
 * Default Steel session timeout, in milliseconds. Matches Steel's own default
 * (5 minutes). Every session gets a finite timeout — no exceptions — so an
 * orphaned session from a crashed run always self-expires.
 */
export const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Default prefix for the internal step IDs created by `withSteelSession`.
 */
export const DEFAULT_STEP_PREFIX = "steel";

/**
 * Fixed package namespace UUID used to derive deterministic Steel session IDs
 * via UUIDv5. Any valid UUID works as a namespace; this one is fixed for the
 * package so the same `(runId, stepPrefix)` pair always maps to the same
 * session ID.
 */
export const STEEL_NAMESPACE_UUID = "2f8e3c91-7b4d-4e6a-9c5f-1a2b3c4d5e6f";

/**
 * Error thrown when no Steel API key can be resolved. Names both remedies
 * (option and env var) so the fix is obvious.
 */
export const NO_API_KEY_ERROR =
  "steel-inngest: No Steel API key found. Pass `apiKey` in options, or set the STEEL_API_KEY environment variable.";

/**
 * Error thrown when a replay is configured with a different Steel endpoint or
 * credential than the invocation that created the session.
 */
export const SESSION_CONFIG_CHANGED_ERROR =
  "steel-inngest: Steel configuration changed after the session was created. Keep the API key and base URL stable for the lifetime of an Inngest run.";

/**
 * Reject ambiguous client configuration from untyped JavaScript callers.
 *
 * TypeScript callers are protected by the public options unions, but runtime
 * validation keeps plain JavaScript and cast values from silently using one
 * client's REST credentials with different URL credentials.
 */
export function assertExclusiveSteelClient(options: {
  readonly steel?: unknown;
  readonly apiKey?: unknown;
  readonly baseUrl?: unknown;
}): void {
  if (
    options.steel !== undefined &&
    (options.apiKey !== undefined || options.baseUrl !== undefined)
  ) {
    throw new Error(
      "steel-inngest: `steel` cannot be combined with `apiKey` or `baseUrl`; pass either a pre-built client or client configuration.",
    );
  }
}

/**
 * Resolve a Steel API key from (in order) an explicit option, the
 * `STEEL_API_KEY` environment variable, or an optional fallback (e.g. a
 * pre-built client's stored key). Throws {@link NO_API_KEY_ERROR} if none is
 * found.
 */
export function resolveApiKey(
  explicit?: string,
  fallback?: string | null,
): string {
  const key = explicit ?? process.env.STEEL_API_KEY ?? fallback ?? undefined;
  if (!key) {
    throw new Error(NO_API_KEY_ERROR);
  }
  return key;
}

/**
 * Build a Steel client from the given options, resolving the API key via
 * {@link resolveApiKey}. Throws at construction if no key is resolvable.
 */
export function createSteelClient(options: {
  apiKey?: string;
  baseUrl?: string;
}): Steel {
  const steelAPIKey = resolveApiKey(options.apiKey);
  const config: ConstructorParameters<typeof Steel>[0] = { steelAPIKey };
  if (options.baseUrl) {
    config.baseURL = options.baseUrl;
  }
  return new Steel(config);
}

/**
 * Build the CDP `connectUrl` from a session's `websocketUrl` and the API key.
 *
 * `websocketUrl` already carries a query string, so the key is appended with
 * `&` — the canonical pattern across Steel's docs. The result embeds the API
 * key and must be treated as a secret.
 */
export function buildConnectUrl(websocketUrl: string, apiKey: string): string {
  const url = new URL(websocketUrl);
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

/**
 * Create a one-way identifier for the Steel endpoint and API key so replay can
 * detect configuration drift without storing either value in Inngest state.
 */
export function fingerprintSessionConfiguration(
  baseUrl: string,
  apiKey: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([baseUrl, apiKey]))
    .digest("hex");
}

/**
 * Validate and resolve the session timeout.
 *
 * Omitted or `0` → the default. Non-finite (NaN/±Infinity) or negative values
 * are rejected. Every session must have a finite timeout.
 */
export function resolveTimeout(timeoutMs?: number): number {
  if (timeoutMs === undefined || timeoutMs === 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error(
      `steel-inngest: timeoutMs must be a positive finite number (got ${timeoutMs}).`,
    );
  }
  return timeoutMs;
}

/**
 * Derive a deterministic Steel session ID from an Inngest run ID and step
 * prefix using UUIDv5 under the package namespace. The pair is JSON-encoded so
 * arbitrary values cannot collide through delimiter ambiguity.
 */
export function deriveSessionId(
  runId: string,
  stepPrefix = DEFAULT_STEP_PREFIX,
): string {
  return uuidV5(JSON.stringify([runId, stepPrefix]), STEEL_NAMESPACE_UUID);
}

/**
 * RFC 4122 §4.3 UUIDv5 (name + namespace, SHA-1).
 *
 * Implemented locally (Node's `crypto` ships `randomUUID` for v4 only) so there
 * is no runtime dependency on a UUID package.
 */
function uuidV5(name: string, namespace: string): string {
  const ns = parseUuid(namespace);
  const hash = createHash("sha1");
  hash.update(ns);
  hash.update(name);
  const bytes = hash.digest(); // Buffer (Uint8Array)
  const out = bytes.subarray(0, 16);

  out[6] = (out[6]! & 0x0f) | 0x50; // version 5
  out[8] = (out[8]! & 0x3f) | 0x80; // variant: RFC 4122

  return formatUuid(out);
}

/** Parse a UUID string into 16 bytes. */
function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Format 16 bytes as an `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` UUID string. */
function formatUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i]!.toString(16).padStart(2, "0"));
  }
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
