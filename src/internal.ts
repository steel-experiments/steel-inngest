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
 * package so the same `runId` always maps to the same session ID.
 */
export const STEEL_NAMESPACE_UUID = "2f8e3c91-7b4d-4e6a-9c5f-1a2b3c4d5e6f";

/**
 * Error thrown when no Steel API key can be resolved. Names both remedies
 * (option and env var) so the fix is obvious.
 */
export const NO_API_KEY_ERROR =
  "steel-inngest: No Steel API key found. Pass `apiKey` (or `steelApiKey`) in options, or set the STEEL_API_KEY environment variable.";

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
  return `${websocketUrl}&apiKey=${apiKey}`;
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
 * Derive a deterministic Steel session ID from an Inngest run ID using UUIDv5
 * under the package namespace. The same `runId` always produces the same ID.
 */
export function deriveSessionId(runId: string): string {
  return uuidV5(runId, STEEL_NAMESPACE_UUID);
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
