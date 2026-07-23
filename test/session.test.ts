import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { withSteelSession } from "../src/session.js";
import { NO_API_KEY_ERROR } from "../src/internal.js";
import type { SteelSessionHandle } from "../src/types.js";
import { createFakeStep, createFakeSteel, type FakeStep } from "./helpers.js";

type StepParam = Parameters<typeof withSteelSession>[0];

/** Cast a fake step to the type `withSteelSession` expects. */
const asStep = (step: FakeStep): StepParam => step as unknown as StepParam;

const SAVED_KEY = process.env.STEEL_API_KEY;

describe("withSteelSession (T003)", () => {
  beforeEach(() => {
    // Tests that need "no key" delete this; restore after each test.
    process.env.STEEL_API_KEY = SAVED_KEY;
  });
  afterEach(() => {
    process.env.STEEL_API_KEY = SAVED_KEY;
  });

  describe("handle shape", () => {
    test("handler receives exactly { id, connectUrl, viewerUrl }", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      let received: SteelSessionHandle | undefined;

      await withSteelSession(asStep(step), { steel }, async (session) => {
        received = session;
        return "done";
      });

      expect(received).toBeDefined();
      expect(Object.keys(received!).sort()).toEqual(["connectUrl", "id", "viewerUrl"]);
    });

    test("handle deep-equals itself through a JSON round-trip", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      let received: SteelSessionHandle | undefined;

      await withSteelSession(asStep(step), { steel }, async (session) => {
        received = session;
        return null;
      });

      expect(JSON.parse(JSON.stringify(received!))).toEqual(received);
    });

    test("connectUrl is `${websocketUrl}&apiKey=${key}`", async () => {
      const steel = createFakeSteel({
        session: { websocketUrl: "wss://api.steel.dev/v1/sessions/s/websocket?token=tok" },
      });
      const step = createFakeStep();
      let received: SteelSessionHandle | undefined;

      await withSteelSession(asStep(step), { steel, apiKey: "SECRET" }, async (session) => {
        received = session;
        return null;
      });

      expect(received!.connectUrl).toBe(
        "wss://api.steel.dev/v1/sessions/s/websocket?token=tok&apiKey=SECRET",
      );
    });

    test("viewerUrl maps from sessionViewerUrl; empty -> null", async () => {
      const steel = createFakeSteel({ session: { sessionViewerUrl: "https://viewer/x" } });
      const step = createFakeStep();
      let received: SteelSessionHandle | undefined;
      await withSteelSession(asStep(step), { steel }, async (s) => {
        received = s;
        return null;
      });
      expect(received!.viewerUrl).toBe("https://viewer/x");

      const steelEmpty = createFakeSteel({ session: { sessionViewerUrl: "" } });
      const step2 = createFakeStep();
      let received2: SteelSessionHandle | undefined;
      await withSteelSession(asStep(step2), { steel: steelEmpty }, async (s) => {
        received2 = s;
        return null;
      });
      expect(received2!.viewerUrl).toBeNull();
    });
  });

  describe("create-once (memoization)", () => {
    test("on a fresh run the create step executes exactly once", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();

      await withSteelSession(asStep(step), { steel }, async () => "ok");

      expect(steel.calls.create).toHaveLength(1);
      expect(step.runs.filter((r) => r.id === "steel/create-session")).toHaveLength(1);
    });

    test("on a replay, the create step does NOT re-run (memoized)", async () => {
      const steel = createFakeSteel();
      const seeded: SteelSessionHandle = {
        id: "replay-id",
        connectUrl: "wss://replayed&apiKey=k",
        viewerUrl: null,
      };
      const step = createFakeStep({ "steel/create-session": seeded });

      let received: SteelSessionHandle | undefined;
      await withSteelSession(asStep(step), { steel }, async (s) => {
        received = s;
        return null;
      });

      // sessions.create was never called on the replay.
      expect(steel.calls.create).toHaveLength(0);
      // The handler got the memoized handle.
      expect(received).toEqual(seeded);
      // The create step was invoked but did not execute its handler.
      const createRun = step.runs.find((r) => r.id === "steel/create-session");
      expect(createRun?.executed).toBe(false);
    });
  });

  describe("release lifecycle", () => {
    test("release runs after the handler resolves", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      let handleId: string | undefined;

      const result = await withSteelSession(asStep(step), { steel }, async (session) => {
        handleId = session.id;
        return 42;
      });

      expect(result).toBe(42);
      expect(steel.calls.release).toHaveLength(1);
      expect(steel.calls.release[0]?.id).toBe(handleId);
      expect(step.runs.find((r) => r.id === "steel/release-session")?.executed).toBe(true);
    });

    test("release does NOT run when the handler rejects", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      const boom = new Error("handler failed");

      await expect(
        withSteelSession(asStep(step), { steel }, async () => {
          throw boom;
        }),
      ).rejects.toBe(boom); // same reference, unchanged

      expect(steel.calls.release).toHaveLength(0);
      expect(step.runs.some((r) => r.id === "steel/release-session")).toBe(false);
    });

    test("a thrown handler error reaches the caller unchanged (same reference)", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      const marker = Symbol("unique");

      await expect(
        withSteelSession(asStep(step), { steel }, async () => {
          throw marker;
        }),
      ).rejects.toBe(marker);
    });
  });

  describe("timeout", () => {
    test("omitted -> 300000", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel }, async () => null);
      expect(steel.calls.create[0]?.params.timeout).toBe(300_000);
    });

    test("zero -> 300000 (not 0)", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel, timeoutMs: 0 }, async () => null);
      expect(steel.calls.create[0]?.params.timeout).toBe(300_000);
    });

    test("a positive finite timeout is forwarded as-is", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel, timeoutMs: 60_000 }, async () => null);
      expect(steel.calls.create[0]?.params.timeout).toBe(60_000);
    });

    test("Infinity is rejected with a clear error before any session is created", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await expect(
        withSteelSession(asStep(step), { steel, timeoutMs: Infinity }, async () => null),
      ).rejects.toThrow(/positive finite/i);
      expect(steel.calls.create).toHaveLength(0);
    });

    test("NaN is rejected", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await expect(
        withSteelSession(asStep(step), { steel, timeoutMs: NaN }, async () => null),
      ).rejects.toThrow(/positive finite/i);
    });
  });

  describe("deterministic session ID (runId -> UUIDv5)", () => {
    const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    test("with runId, sessionId is a valid v5 UUID", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel, runId: "run-xyz" }, async () => null);
      expect(steel.calls.create[0]?.params.sessionId).toMatch(UUID_V5);
    });

    test("same runId -> same sessionId (deterministic)", async () => {
      const a = createFakeSteel({ nextId: () => "a" });
      const b = createFakeSteel({ nextId: () => "b" });
      await withSteelSession(asStep(createFakeStep()), { steel: a, runId: "run-1" }, async () => null);
      await withSteelSession(asStep(createFakeStep()), { steel: b, runId: "run-1" }, async () => null);
      expect(a.calls.create[0]?.params.sessionId).toBe(b.calls.create[0]?.params.sessionId);
    });

    test("different runIds -> different sessionIds", async () => {
      const a = createFakeSteel({ nextId: () => "a" });
      const b = createFakeSteel({ nextId: () => "b" });
      await withSteelSession(asStep(createFakeStep()), { steel: a, runId: "run-1" }, async () => null);
      await withSteelSession(asStep(createFakeStep()), { steel: b, runId: "run-2" }, async () => null);
      expect(a.calls.create[0]?.params.sessionId).not.toBe(b.calls.create[0]?.params.sessionId);
    });

    test("without runId, no sessionId is set", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel }, async () => null);
      expect(steel.calls.create[0]?.params.sessionId).toBeUndefined();
    });
  });

  describe("step prefixing", () => {
    test("default prefix is 'steel'", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel }, async () => null);
      expect(step.runs.map((r) => r.id)).toEqual([
        "steel/create-session",
        "steel/release-session",
      ]);
    });

    test("distinct prefixes produce non-colliding step IDs", async () => {
      const a = createFakeSteel();
      const b = createFakeSteel();
      const stepA = createFakeStep();
      const stepB = createFakeStep();

      await withSteelSession(asStep(stepA), { steel: a, stepPrefix: "catalog" }, async () => null);
      await withSteelSession(asStep(stepB), { steel: b, stepPrefix: "checkout" }, async () => null);

      const idsA = stepA.runs.map((r) => r.id);
      const idsB = stepB.runs.map((r) => r.id);
      expect(idsA).toEqual(["catalog/create-session", "catalog/release-session"]);
      expect(idsB).toEqual(["checkout/create-session", "checkout/release-session"]);
      expect(idsA).not.toEqual(idsB);
    });
  });

  describe("options forwarding", () => {
    test("useProxy and solveCaptcha are forwarded to create", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(
        asStep(step),
        { steel, useProxy: true, solveCaptcha: true },
        async () => null,
      );
      expect(steel.calls.create[0]?.params.useProxy).toBe(true);
      expect(steel.calls.create[0]?.params.solveCaptcha).toBe(true);
    });

    test("useProxy/solveCaptcha are omitted when not provided", async () => {
      const steel = createFakeSteel();
      const step = createFakeStep();
      await withSteelSession(asStep(step), { steel }, async () => null);
      expect(steel.calls.create[0]?.params.useProxy).toBeUndefined();
      expect(steel.calls.create[0]?.params.solveCaptcha).toBeUndefined();
    });
  });

  describe("API key resolution", () => {
    test("no resolvable key -> error names both remedies (option + env)", async () => {
      delete process.env.STEEL_API_KEY;
      const steel = createFakeSteel();
      const step = createFakeStep();

      // NO_API_KEY_ERROR already names both the option and the env var;
      // toThrow with a string does a substring match.
      await expect(
        withSteelSession(asStep(step), {}, async () => null),
      ).rejects.toThrow(NO_API_KEY_ERROR);

      // And no session was created before the error.
      expect(steel.calls.create).toHaveLength(0);
    });

    test("a provided client's key is used for connectUrl when no explicit key/env", async () => {
      delete process.env.STEEL_API_KEY;
      const steel = createFakeSteel({
        steelAPIKey: "client-provided-key",
        session: { websocketUrl: "wss://ws?token=t" },
      });
      const step = createFakeStep();
      let received: SteelSessionHandle | undefined;
      await withSteelSession(asStep(step), { steel }, async (s) => {
        received = s;
        return null;
      });
      expect(received!.connectUrl).toBe("wss://ws?token=t&apiKey=client-provided-key");
    });
  });
});
