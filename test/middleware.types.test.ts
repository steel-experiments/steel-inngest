// ABOUTME: Compile-time tests that registering steelMiddleware types ctx.steel as
// ABOUTME: the Steel client in handlers without casts.
import { expectTypeOf, test } from "vitest";
import { Inngest } from "inngest";
import type { Steel } from "steel-sdk";
import { steelMiddleware } from "../src/middleware.js";

/**
 * Compile-time proof that registering `steelMiddleware` makes `ctx.steel` the
 * typed Steel client — usable in the handler without any cast. If the
 * middleware's `transformFunctionInput` return type were wrong, this file would
 * fail to typecheck.
 */
test("ctx.steel is inferred as the Steel client (no cast)", () => {
  const inngest = new Inngest({
    id: "type-inference-test",
    middleware: [steelMiddleware({ apiKey: "key" })],
  });

  inngest.createFunction({ id: "uses-steel" }, async ({ steel }) => {
    expectTypeOf(steel).toEqualTypeOf<Steel>();
    // Real method usage compiles without casts.
    void steel.scrape({ url: "https://example.com" });
    void steel.sessions;
    return "ok";
  });
});
