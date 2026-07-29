// ABOUTME: Unit tests for internal helpers: key resolution, client construction,
// ABOUTME: connect URLs, env restore, timeouts, and deterministic session IDs.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildConnectUrl,
  createSteelClient,
  deriveSessionId,
  NO_API_KEY_ERROR,
  resolveApiKey,
  resolveTimeout,
  DEFAULT_TIMEOUT_MS,
} from "../src/internal.js";
import { restoreEnv } from "./helpers.js";

const SAVED_KEY = process.env.STEEL_API_KEY;

describe("resolveApiKey", () => {
  beforeEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });
  afterEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });

  test("explicit option wins", () => {
    expect(resolveApiKey("explicit-key")).toBe("explicit-key");
  });

  test("falls back to env", () => {
    delete process.env.STEEL_API_KEY;
    process.env.STEEL_API_KEY = "env-key";
    expect(resolveApiKey(undefined)).toBe("env-key");
  });

  test("no key anywhere -> error naming both remedies", () => {
    delete process.env.STEEL_API_KEY;
    expect(() => resolveApiKey(undefined)).toThrow(NO_API_KEY_ERROR);
    expect(() => resolveApiKey(undefined)).toThrow(/apiKey/);
    expect(() => resolveApiKey(undefined)).toThrow(/STEEL_API_KEY/);
  });
});

describe("createSteelClient", () => {
  beforeEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });
  afterEach(() => {
    restoreEnv("STEEL_API_KEY", SAVED_KEY);
  });

  test("builds a client whose steelAPIKey is the resolved key", () => {
    process.env.STEEL_API_KEY = "env-key";
    const client = createSteelClient({});
    expect(client.steelAPIKey).toBe("env-key");
  });

  test("baseUrl option is honored (sets the client baseURL)", () => {
    const client = createSteelClient({
      apiKey: "k",
      baseUrl: "https://steel.custom.example",
    });
    expect(client.baseURL).toContain("steel.custom.example");
  });

  test("no key -> error", () => {
    delete process.env.STEEL_API_KEY;
    expect(() => createSteelClient({})).toThrow(NO_API_KEY_ERROR);
  });
});

describe("buildConnectUrl", () => {
  test("appends the key with '&' (websocketUrl already has a query string)", () => {
    expect(buildConnectUrl("wss://api/s/s1/websocket?token=t", "K")).toBe(
      "wss://api/s/s1/websocket?token=t&apiKey=K",
    );
  });

  test("encodes reserved characters in the API key as one query value", () => {
    const result = buildConnectUrl(
      "wss://api/s/s1/websocket?token=t",
      "abc+def&x=y#fragment",
    );
    const parsed = new URL(result);

    expect(parsed.searchParams.get("apiKey")).toBe("abc+def&x=y#fragment");
    expect([...parsed.searchParams.keys()]).toEqual(["token", "apiKey"]);
  });
});

describe("restoreEnv", () => {
  test("restores an originally missing variable by deleting it", () => {
    process.env.STEEL_INNGEST_RESTORE_TEST = "temporary";
    restoreEnv("STEEL_INNGEST_RESTORE_TEST", undefined);
    expect(process.env.STEEL_INNGEST_RESTORE_TEST).toBeUndefined();
  });
});

describe("resolveTimeout", () => {
  test("omitted -> default", () => {
    expect(resolveTimeout(undefined)).toBe(DEFAULT_TIMEOUT_MS);
  });
  test("zero -> default", () => {
    expect(resolveTimeout(0)).toBe(DEFAULT_TIMEOUT_MS);
  });
  test("positive finite -> as-is", () => {
    expect(resolveTimeout(12_000)).toBe(12_000);
  });
  test("Infinity / NaN / negative rejected", () => {
    expect(() => resolveTimeout(Infinity)).toThrow(/positive finite/i);
    expect(() => resolveTimeout(NaN)).toThrow(/positive finite/i);
    expect(() => resolveTimeout(-1)).toThrow(/positive finite/i);
  });
});

describe("deriveSessionId (UUIDv5)", () => {
  const UUID_V5 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  test("produces a valid v5 UUID", () => {
    expect(deriveSessionId("run-1", "steel")).toMatch(UUID_V5);
  });

  test("deterministic: same runId and stepPrefix -> same id", () => {
    expect(deriveSessionId("run-1", "catalog")).toBe(
      deriveSessionId("run-1", "catalog"),
    );
  });

  test("different runIds -> different ids", () => {
    expect(deriveSessionId("run-1", "steel")).not.toBe(
      deriveSessionId("run-2", "steel"),
    );
  });

  test("same runId with different step prefixes -> different ids", () => {
    expect(deriveSessionId("run-1", "catalog")).not.toBe(
      deriveSessionId("run-1", "checkout"),
    );
  });
});
