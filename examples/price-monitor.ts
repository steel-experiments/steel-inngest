/**
 * steel-inngest e2e example — a price monitor.
 *
 * Runs a Steel browser session as durable Inngest steps, connects Playwright to
 * it over CDP, reads a price, and releases the session. This file is the README
 * centerpiece AND the e2e test tier.
 *
 * Serve the {@link priceMonitor} function with the Inngest dev server, or run
 * the whole lifecycle directly against real Steel:
 *
 *   npm run example:price-monitor
 *
 * Required env: `STEEL_API_KEY`. Optional: `PRICE_MONITOR_URL`.
 */

import { chromium, type Browser } from "playwright-core";
import { Inngest, type InngestFunction, type Middleware } from "inngest";
import type { Steel } from "steel-sdk";
import { steelMiddleware, withSteelSession } from "../src/index.js";

const TARGET_URL = process.env.PRICE_MONITOR_URL ?? "https://books.toscrape.com/";

/**
 * Inngest client with Steel injected as `ctx.steel`.
 */
export const inngest = new Inngest({
  id: "price-monitor",
  middleware: [steelMiddleware({ apiKey: process.env.STEEL_API_KEY })],
});

/**
 * The durable price-monitor function.
 *
 * `withSteelSession` owns the session lifecycle as steps; the handler reconnects
 * by `connectUrl` and closes the *connection* (never the session) per step.
 */
export const priceMonitor: InngestFunction.Like = inngest.createFunction(
  { id: "check-price", name: "Check price", triggers: { cron: "*/5 * * * *" } },
  async ({ step, steel, runId }) => runPriceCheck(step, steel, runId),
);

/**
 * Shared lifecycle: create session -> connect Playwright -> read price ->
 * release. Called from both the durable function and the direct e2e runner.
 */
async function runPriceCheck(
  step: Middleware.StepTools,
  steel: Steel | undefined,
  runId: string | undefined,
): Promise<{ url: string; title: string | null; price: string | null; sessionId: string; viewerUrl: string | null }> {
  return withSteelSession(
    step,
    { steel, runId, timeoutMs: 120_000 },
    async (session) => {
      // connectOverCDP uses Steel's already-running browser — no local Chromium
      // download is needed.
      const browser: Browser = await chromium.connectOverCDP(session.connectUrl);
      try {
        const page = await step.run("read-price", async () => {
          const p = await browser.newPage();
          await p.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
          const title = await p.title();
          const price = await p.locator(".product_pod .price_color").first().textContent();
          await p.close();
          return { title, price: price?.trim() ?? null };
        });
        return {
          url: TARGET_URL,
          title: page.title,
          price: page.price,
          sessionId: session.id,
          viewerUrl: session.viewerUrl,
        };
      } finally {
        // Close the *connection*, not the session — withSteelSession releases
        // the session on success.
        await browser.close();
      }
    },
  );
}

/**
 * Direct e2e runner: executes the lifecycle against real Steel using a
 * passthrough step (every step actually runs; no memoization).
 */
async function main(): Promise<void> {
  if (!process.env.STEEL_API_KEY) {
    console.error("Missing STEEL_API_KEY. Copy .env.example to .env and set it.");
    process.exit(1);
  }

  // A passthrough step: run every handler immediately (real execution).
  const passthroughStep = {
    run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn(),
  } as unknown as Middleware.StepTools;

  console.log(`Monitoring ${TARGET_URL} ...`);
  const result = await runPriceCheck(passthroughStep, undefined, `e2e-price-monitor`);
  console.log("Result:", result);
}

// Run when executed directly (npm run example:price-monitor), not when imported.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
