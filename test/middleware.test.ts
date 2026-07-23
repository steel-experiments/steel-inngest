import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Middleware, type Inngest } from "inngest";
import { steelMiddleware, SteelMiddleware } from "../src/middleware.js";
import { NO_API_KEY_ERROR } from "../src/internal.js";

const SAVED_KEY = process.env.STEEL_API_KEY;

/** A throwaway Inngest client value for the middleware constructor. */
const fakeInngestClient = {} as Inngest.Any;

/** Minimal TransformFunctionInputArgs for driving the hook directly. */
function inputArgs(ctx: Record<string, unknown> = {}): Middleware.TransformFunctionInputArgs {
  return {
    ctx: ctx as Middleware.TransformFunctionInputArgs["ctx"],
    fn: {} as Middleware.TransformFunctionInputArgs["fn"],
    steps: {},
  };
}

describe("steelMiddleware (T005)", () => {
  beforeEach(() => {
    process.env.STEEL_API_KEY = SAVED_KEY;
  });
  afterEach(() => {
    process.env.STEEL_API_KEY = SAVED_KEY;
  });

  test("the raw class is a Middleware.BaseMiddleware subclass", () => {
    expect(SteelMiddleware.prototype).toBeInstanceOf(Middleware.BaseMiddleware);
  });

  test("factory returns a class (constructor), not an instance", () => {
    const MW = steelMiddleware({ apiKey: "k" });
    expect(typeof MW).toBe("function");
    // It's a constructor that produces a BaseMiddleware instance.
    const instance = new MW({ client: fakeInngestClient });
    expect(instance).toBeInstanceOf(Middleware.BaseMiddleware);
    expect(instance.id).toBe("steel-inngest");
  });

  test("transformFunctionInput injects ctx.steel", () => {
    const MW = steelMiddleware({ apiKey: "k" });
    const instance = new MW({ client: fakeInngestClient });
    const out = instance.transformFunctionInput(inputArgs({ existing: 1 }));
    const ctx = out.ctx as unknown as Record<string, unknown>;
    expect(ctx).toHaveProperty("steel");
    expect(ctx.existing).toBe(1); // other ctx preserved
    expect(typeof (ctx.steel as { scrape: unknown }).scrape).toBe("function");
  });

  test("the raw class works when STEEL_API_KEY is in the env", () => {
    process.env.STEEL_API_KEY = "env-key";
    const instance = new SteelMiddleware({ client: fakeInngestClient });
    const out = instance.transformFunctionInput(inputArgs());
    const steel = (out.ctx as unknown as Record<string, unknown>).steel as {
      steelAPIKey: string | null;
    };
    expect(steel.steelAPIKey).toBe("env-key");
  });

  test("missing key fails at construction (not first use)", () => {
    delete process.env.STEEL_API_KEY;
    const MW = steelMiddleware({});
    expect(() => new MW({ client: fakeInngestClient })).toThrow(NO_API_KEY_ERROR);
  });

  test("apiKey option satisfies key resolution at construction", () => {
    delete process.env.STEEL_API_KEY;
    const MW = steelMiddleware({ apiKey: "opt-key" });
    const instance = new MW({ client: fakeInngestClient });
    const out = instance.transformFunctionInput(inputArgs());
    const steel = (out.ctx as unknown as Record<string, unknown>).steel as {
      steelAPIKey: string | null;
    };
    expect(steel.steelAPIKey).toBe("opt-key");
  });
});
