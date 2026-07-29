// ABOUTME: Integration test running steelMiddleware through the real @inngest/test
// ABOUTME: middleware pipeline to prove ctx.steel carries the configured client.
import { expect, test } from "vitest";
import { Inngest } from "inngest";
import { InngestTestEngine } from "@inngest/test";
import { steelMiddleware } from "../src/middleware.js";

/**
 * Integration tier: execute a real function through the @inngest/test harness,
 * which runs the actual middleware pipeline. Verifies the configured client is
 * visible at `ctx.steel` both inside the handler and on the returned ctx.
 */
test("@inngest/test: a function sees a configured client at ctx.steel", async () => {
  const inngest = new Inngest({
    id: "steel-integration",
    middleware: [steelMiddleware({ apiKey: "integration-key" })],
  });

  const fn = inngest.createFunction({ id: "sees-steel" }, async ({ steel }) => {
    return {
      // Return the configured key, not just a boolean, so the test proves the
      // *configured* client (carrying "integration-key") reaches the handler —
      // not merely some Steel-shaped object.
      steelAPIKey: steel.steelAPIKey,
      hasScrape: typeof steel.scrape === "function",
      hasSessions: !!steel.sessions,
    };
  });

  const engine = new InngestTestEngine({ function: fn });
  const { result, ctx } = await engine.execute();

  // The handler ran with the *configured* client at ctx.steel.
  expect(result).toEqual({
    steelAPIKey: "integration-key",
    hasScrape: true,
    hasSessions: true,
  });
  // ...and that same configured client is visible on the returned ctx, too.
  expect((ctx as { steel?: { steelAPIKey?: string } }).steel?.steelAPIKey).toBe(
    "integration-key",
  );
});
